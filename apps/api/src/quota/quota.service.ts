import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { QuotaView } from '@aivoice/contracts';
import { DatabaseService } from '../db/database.service.js';

interface LockedVoiceRow {
  voice_id: string;
  user_id: string;
  status: string;
  accepted_at: Date | null;
  preview_played_at: Date | null;
  trial_quota_remaining: number;
  paid_quota_remaining: number;
  trial_custom_generation_granted_at: Date | null;
  trial_custom_generation_consumed_at: Date | null;
}

function toQuota(row: LockedVoiceRow): QuotaView {
  return {
    trialQuotaRemaining: Number(row.trial_quota_remaining),
    paidQuotaRemaining: Number(row.paid_quota_remaining),
    availableQuota: Number(row.trial_quota_remaining) + Number(row.paid_quota_remaining),
    trialEligibility: row.trial_custom_generation_consumed_at
      ? 'USED'
      : row.trial_custom_generation_granted_at
        ? 'GRANTED'
        : 'ELIGIBLE',
  };
}

async function lockVoice(client: PoolClient, userId: string, voiceId: string): Promise<LockedVoiceRow> {
  const result = await client.query<LockedVoiceRow>(
    `SELECT
       v.id AS voice_id,
       v.user_id,
       v.status,
       v.accepted_at,
       v.preview_played_at,
       v.trial_quota_remaining,
       v.paid_quota_remaining,
       u.trial_custom_generation_granted_at,
       u.trial_custom_generation_consumed_at
     FROM voice_profiles v
     JOIN users u ON u.id = v.user_id
     WHERE v.id = $1 AND v.user_id = $2 AND v.deleted_at IS NULL AND u.deleted_at IS NULL
     FOR UPDATE OF v, u`,
    [voiceId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundException('voice not found');
  return row;
}

@Injectable()
export class QuotaService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private retryable(error: unknown): boolean {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    return code === '40001' || code === '40P01' || code === '23505';
  }

  async getQuota(userId: string, voiceId: string): Promise<QuotaView> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await lockVoice(client, userId, voiceId);
      await client.query('COMMIT');
      return toQuota(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listLedgers(userId: string) {
    const result = await this.database.pool.query<{
      id: string;
      voice_profile_id: string;
      order_id: string | null;
      message_id: string | null;
      type: string;
      bucket: string;
      amount: number;
      balance_after: number;
      created_at: Date;
    }>(
      `SELECT id, voice_profile_id, order_id, message_id, type, bucket, amount, balance_after, created_at
       FROM quota_ledgers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return {
      ledgers: result.rows.map((row) => ({
        id: row.id,
        voiceId: row.voice_profile_id,
        orderId: row.order_id,
        messageId: row.message_id,
        type: row.type,
        bucket: row.bucket,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        createdAt: row.created_at,
      })),
    };
  }

  async acceptPreview(userId: string, voiceId: string, attempt = 0): Promise<QuotaView> {
    const client = await this.database.pool.connect();
    let releaseHandled = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const row = await lockVoice(client, userId, voiceId);
      if (row.status !== 'READY') throw new ConflictException('voice is not ready');
      if (!row.preview_played_at) throw new ConflictException('PREVIEW_NOT_PLAYED');

      if (!row.accepted_at) {
        await client.query(
          'UPDATE voice_profiles SET accepted_at = NOW(), updated_at = NOW() WHERE id = $1',
          [voiceId],
        );
      }

      if (!row.trial_custom_generation_granted_at) {
        const nextBalance = row.trial_quota_remaining + 1;
        await client.query(
          `UPDATE users
           SET trial_voice_profile_id = $1,
               trial_custom_generation_granted_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [voiceId, userId],
        );
        await client.query(
          `UPDATE voice_profiles
           SET trial_quota_remaining = $1, updated_at = NOW()
           WHERE id = $2`,
          [nextBalance, voiceId],
        );
        await client.query(
          `INSERT INTO quota_ledgers
           (id, user_id, voice_profile_id, type, bucket, amount, balance_after, created_at)
           VALUES ($1, $2, $3, 'TRIAL_GRANT', 'TRIAL', 1, $4, NOW())`,
          [randomUUID(), userId, voiceId, nextBalance],
        );
        row.trial_quota_remaining = nextBalance;
        row.trial_custom_generation_granted_at = new Date();
      }

      await client.query('COMMIT');
      return toQuota(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        releaseHandled = true;
        client.release();
        return this.acceptPreview(userId, voiceId, attempt + 1);
      }
      throw error;
    } finally {
      if (!releaseHandled) client.release();
    }
  }

  async completeMessage(input: {
    userId: string;
    voiceId: string;
    messageId: string;
    outputText: string;
  }, attempt = 0): Promise<QuotaView> {
    const client = await this.database.pool.connect();
    let releaseHandled = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const row = await lockVoice(client, input.userId, input.voiceId);
      const messageResult = await client.query<{ status: string }>(
        `SELECT status FROM messages
         WHERE id = $1 AND user_id = $2 AND voice_profile_id = $3
         FOR UPDATE`,
        [input.messageId, input.userId, input.voiceId],
      );
      const message = messageResult.rows[0];
      if (!message) throw new NotFoundException('message not found');

      const existingLedger = await client.query(
        `SELECT id FROM quota_ledgers
         WHERE type = 'GENERATION_CONSUME' AND message_id = $1
         LIMIT 1`,
        [input.messageId],
      );
      if (existingLedger.rowCount) {
        await client.query('COMMIT');
        return toQuota(row);
      }
      if (!['PENDING', 'PROCESSING'].includes(message.status)) {
        throw new ConflictException(`message cannot complete from ${message.status}`);
      }

      let bucket: 'TRIAL' | 'PAID';
      let balanceAfter: number;
      if (row.trial_quota_remaining > 0) {
        bucket = 'TRIAL';
        row.trial_quota_remaining -= 1;
        balanceAfter = row.trial_quota_remaining;
        await client.query(
          `UPDATE voice_profiles SET trial_quota_remaining = $1, last_used_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [balanceAfter, input.voiceId],
        );
        await client.query(
          `UPDATE users SET trial_custom_generation_consumed_at = COALESCE(trial_custom_generation_consumed_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [input.userId],
        );
        row.trial_custom_generation_consumed_at ||= new Date();
      } else if (row.paid_quota_remaining > 0) {
        bucket = 'PAID';
        row.paid_quota_remaining -= 1;
        balanceAfter = row.paid_quota_remaining;
        await client.query(
          `UPDATE voice_profiles SET paid_quota_remaining = $1, last_used_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [balanceAfter, input.voiceId],
        );
      } else {
        throw new ConflictException('QUOTA_EXHAUSTED');
      }

      await client.query(
        `UPDATE messages
         SET status = 'READY', output_text = $1, ready_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [input.outputText, input.messageId],
      );
      await client.query(
        `INSERT INTO quota_ledgers
         (id, user_id, voice_profile_id, message_id, type, bucket, amount, balance_after, created_at)
         VALUES ($1, $2, $3, $4, 'GENERATION_CONSUME', $5, -1, $6, NOW())`,
        [randomUUID(), input.userId, input.voiceId, input.messageId, bucket, balanceAfter],
      );
      await client.query('COMMIT');
      return toQuota(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        releaseHandled = true;
        client.release();
        return this.completeMessage(input, attempt + 1);
      }
      throw error;
    } finally {
      if (!releaseHandled) client.release();
    }
  }

  async failMessage(input: { userId: string; messageId: string; code: string; message: string }): Promise<void> {
    await this.database.pool.query(
      `UPDATE messages
       SET status = 'FAILED', error_code = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND status IN ('PENDING', 'PROCESSING')`,
      [input.code, input.message, input.messageId, input.userId],
    );
  }

  async grantPaidQuota(input: {
    userId: string;
    orderId: string;
    transactionId: string;
    paidAt: Date;
  }, attempt = 0): Promise<QuotaView> {
    const client = await this.database.pool.connect();
    let releaseHandled = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const orderResult = await client.query<{
        id: string;
        user_id: string;
        voice_profile_id: string;
        quota: number;
        status: string;
        quota_granted_at: Date | null;
      }>(
        `SELECT id, user_id, voice_profile_id, quota, status, quota_granted_at
         FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.orderId, input.userId],
      );
      const order = orderResult.rows[0];
      if (!order) throw new NotFoundException('order not found');
      const voice = await lockVoice(client, input.userId, order.voice_profile_id);
      if (order.quota_granted_at) {
        await client.query('COMMIT');
        return toQuota(voice);
      }

      const nextBalance = voice.paid_quota_remaining + Number(order.quota);
      await client.query(
        `UPDATE orders
         SET status = 'PAID', transaction_id = $1, paid_at = $2, quota_granted_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [input.transactionId, input.paidAt, input.orderId],
      );
      await client.query(
        `UPDATE voice_profiles SET paid_quota_remaining = $1, updated_at = NOW() WHERE id = $2`,
        [nextBalance, order.voice_profile_id],
      );
      await client.query(
        `INSERT INTO quota_ledgers
         (id, user_id, voice_profile_id, order_id, type, bucket, amount, balance_after, created_at)
         VALUES ($1, $2, $3, $4, 'PURCHASE_GRANT', 'PAID', $5, $6, NOW())`,
        [randomUUID(), input.userId, order.voice_profile_id, input.orderId, order.quota, nextBalance],
      );
      voice.paid_quota_remaining = nextBalance;
      await client.query('COMMIT');
      return toQuota(voice);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        releaseHandled = true;
        client.release();
        return this.grantPaidQuota(input, attempt + 1);
      }
      throw error;
    } finally {
      if (!releaseHandled) client.release();
    }
  }
}
