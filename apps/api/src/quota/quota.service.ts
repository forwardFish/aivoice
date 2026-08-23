import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PointsView, QuotaView } from '@aivoice/contracts';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../db/database.service.js';
import { loadPointsConfig } from './points.config.js';

interface LockedPointAccount {
  user_id: string;
  balance: number;
  signup_granted_at: Date | null;
}

interface LockedVoice {
  id: string;
  status: string;
  accepted_at: Date | null;
  preview_played_at: Date | null;
}

function toPoints(balance: number): PointsView {
  const config = loadPointsConfig();
  return {
    balance,
    availablePoints: balance,
    generationCost: config.generationCost,
    signupBonusPoints: config.signupBonusPoints,
    purchaseOption: config.product,
  };
}

function toCompatibilityQuota(balance: number): QuotaView {
  return {
    trialQuotaRemaining: 0,
    paidQuotaRemaining: balance,
    availableQuota: balance,
    trialEligibility: 'USED',
  };
}

function quotaFromCloudResult(result: { balance?: number; quota?: { availableQuota?: number } }): QuotaView {
  return toCompatibilityQuota(Number(result.balance ?? result.quota?.availableQuota ?? 0));
}

async function lockAccount(client: PoolClient, userId: string): Promise<LockedPointAccount> {
  await client.query(
    `INSERT INTO point_accounts (user_id, balance, created_at, updated_at)
     VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const result = await client.query<LockedPointAccount>(
    `SELECT a.user_id, a.balance, a.signup_granted_at
     FROM point_accounts a JOIN users u ON u.id = a.user_id
     WHERE a.user_id = $1 AND u.deleted_at IS NULL FOR UPDATE OF a`,
    [userId],
  );
  const account = result.rows[0];
  if (!account) throw new NotFoundException('point account not found');
  account.balance = Number(account.balance);
  return account;
}

async function lockVoice(client: PoolClient, userId: string, voiceId: string): Promise<LockedVoice> {
  const result = await client.query<LockedVoice>(
    `SELECT id, status, accepted_at, preview_played_at FROM voice_profiles
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [voiceId, userId],
  );
  const voice = result.rows[0];
  if (!voice) throw new NotFoundException('voice not found');
  return voice;
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

  async ensureSignupGrant(userId: string, attempt = 0): Promise<PointsView> {
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const user = await cloud.selectOne<{
        openid: string;
        unionid: string | null;
        nickname: string;
        avatarUrl: string;
      }>('users', { filters: { id: userId, deletedAt: { is: null } } });
      if (!user) throw new NotFoundException('user not found');
      await cloud.rpc('rpc_auth_login_wechat', {
        pOpenid: user.openid,
        pUnionid: user.unionid,
        pNickname: user.nickname,
        pAvatarUrl: user.avatarUrl,
        pSignupBonusPoints: loadPointsConfig().signupBonusPoints,
      });
      return this.getPoints(userId);
    }
    const client = await this.database.pool.connect();
    let released = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const account = await lockAccount(client, userId);
      if (!account.signup_granted_at) {
        const amount = loadPointsConfig().signupBonusPoints;
        account.balance += amount;
        await client.query(
          `UPDATE point_accounts SET balance = $1, signup_granted_at = NOW(), updated_at = NOW()
           WHERE user_id = $2`,
          [account.balance, userId],
        );
        await client.query(
          `INSERT INTO point_ledgers
           (id, user_id, type, amount, balance_after, request_key, source, created_at)
           VALUES ($1, $2, 'REGISTER_GRANT', $3, $4, $5, 'REGISTRATION', NOW())`,
          [randomUUID(), userId, amount, account.balance, `registration:${userId}`],
        );
      }
      await client.query('COMMIT');
      return toPoints(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        released = true;
        client.release();
        return this.ensureSignupGrant(userId, attempt + 1);
      }
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  async getPoints(userId: string): Promise<PointsView> {
    if (this.database.isCloudBase) {
      const account = await this.database.requireCloud().selectOne<{ balance: number }>('point_accounts', {
        select: 'balance',
        filters: { userId },
      });
      if (!account) throw new NotFoundException('point account not found');
      return toPoints(Number(account.balance));
    }
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await lockAccount(client, userId);
      await client.query('COMMIT');
      return toPoints(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getQuota(userId: string, voiceId: string): Promise<QuotaView> {
    if (this.database.isCloudBase) {
      const voice = await this.database.requireCloud().selectOne<{ id: string }>('voice_profiles', {
        select: 'id',
        filters: { id: voiceId, userId, deletedAt: { is: null } },
      });
      if (!voice) throw new NotFoundException('voice not found');
      return toCompatibilityQuota((await this.getPoints(userId)).balance);
    }
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await lockVoice(client, userId, voiceId);
      const account = await lockAccount(client, userId);
      await client.query('COMMIT');
      return toCompatibilityQuota(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPointLedgers(userId: string) {
    if (this.database.isCloudBase) {
      const rows = await this.database.requireCloud().select<{
        id: string;
        voiceProfileId: string | null;
        orderId: string | null;
        messageId: string | null;
        type: string;
        amount: number;
        balanceAfter: number;
        requestKey: string | null;
        source: string;
        createdAt: Date;
      }>('point_ledgers', {
        filters: { userId },
        order: [{ column: 'createdAt', ascending: false }],
        limit: 100,
      });
      return { ledgers: rows.map((row) => ({
        id: row.id,
        voiceId: row.voiceProfileId,
        orderId: row.orderId,
        messageId: row.messageId,
        type: row.type,
        amount: Number(row.amount),
        balanceAfter: Number(row.balanceAfter),
        requestKey: row.requestKey,
        source: row.source,
        createdAt: row.createdAt,
      })) };
    }
    const result = await this.database.pool.query<{
      id: string;
      voice_profile_id: string | null;
      order_id: string | null;
      message_id: string | null;
      type: string;
      amount: number;
      balance_after: number;
      request_key: string | null;
      source: string;
      created_at: Date;
    }>(
      `SELECT id, voice_profile_id, order_id, message_id, type, amount, balance_after, request_key, source, created_at
       FROM point_ledgers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return {
      ledgers: result.rows.map((row) => ({
        id: row.id,
        voiceId: row.voice_profile_id,
        orderId: row.order_id,
        messageId: row.message_id,
        type: row.type,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        requestKey: row.request_key,
        source: row.source,
        createdAt: row.created_at,
      })),
    };
  }

  /** @deprecated Use listPointLedgers. */
  listLedgers(userId: string) {
    return this.listPointLedgers(userId);
  }

  async acceptPreview(userId: string, voiceId: string): Promise<QuotaView> {
    if (this.database.isCloudBase) {
      const result = await this.database.requireCloud().rpc<{
        balance?: number;
        quota?: { availableQuota?: number };
      }>('rpc_voice_accept_preview', {
        pUserId: userId,
        pVoiceId: voiceId,
      });
      return quotaFromCloudResult(result);
    }
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const voice = await lockVoice(client, userId, voiceId);
      if (voice.status !== 'READY') throw new ConflictException('voice is not ready');
      if (!voice.preview_played_at) throw new ConflictException('PREVIEW_NOT_PLAYED');
      if (!voice.accepted_at) {
        await client.query('UPDATE voice_profiles SET accepted_at = NOW(), updated_at = NOW() WHERE id = $1', [voiceId]);
      }
      const account = await lockAccount(client, userId);
      await client.query('COMMIT');
      return toCompatibilityQuota(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeMessage(input: {
    userId: string;
    voiceId: string;
    messageId: string;
    outputText: string;
    generatedMedia?: {
      objectKey: string;
      mimeType: string;
      bytes: number;
      durationMs: number;
      sha256: string;
    };
  }, attempt = 0): Promise<QuotaView> {
    if (this.database.isCloudBase) {
      if (!input.generatedMedia) {
        throw new ConflictException('generated media is required for CloudBase completion');
      }
      const result = await this.database.requireCloud().rpc<{ balance: number }>('rpc_message_complete_success', {
        pUserId: input.userId,
        pVoiceId: input.voiceId,
        pMessageId: input.messageId,
        pOutputText: input.outputText,
        pObjectKey: input.generatedMedia.objectKey,
        pMimeType: input.generatedMedia.mimeType,
        pBytes: input.generatedMedia.bytes,
        pDurationMs: input.generatedMedia.durationMs,
        pSha256: input.generatedMedia.sha256,
        pGenerationCost: loadPointsConfig().generationCost,
      });
      return toCompatibilityQuota(Number(result.balance));
    }
    const client = await this.database.pool.connect();
    let released = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const account = await lockAccount(client, input.userId);
      await lockVoice(client, input.userId, input.voiceId);
      const messageResult = await client.query<{ status: string }>(
        `SELECT status FROM messages WHERE id = $1 AND user_id = $2 AND voice_profile_id = $3 FOR UPDATE`,
        [input.messageId, input.userId, input.voiceId],
      );
      const message = messageResult.rows[0];
      if (!message) throw new NotFoundException('message not found');
      const existing = await client.query(
        `SELECT id FROM point_ledgers WHERE type = 'GENERATION_CONSUME' AND message_id = $1 LIMIT 1`,
        [input.messageId],
      );
      if (existing.rowCount) {
        await client.query('COMMIT');
        return toCompatibilityQuota(account.balance);
      }
      if (!['PENDING', 'PROCESSING'].includes(message.status)) {
        throw new ConflictException(`message cannot complete from ${message.status}`);
      }
      const cost = loadPointsConfig().generationCost;
      if (account.balance < cost) throw new ConflictException('POINTS_EXHAUSTED');
      account.balance -= cost;
      await client.query('UPDATE point_accounts SET balance = $1, updated_at = NOW() WHERE user_id = $2', [account.balance, input.userId]);
      await client.query('UPDATE voice_profiles SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1', [input.voiceId]);
      await client.query(
        `UPDATE messages SET status = 'READY', output_text = $1, ready_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [input.outputText, input.messageId],
      );
      await client.query(
        `INSERT INTO point_ledgers
         (id, user_id, voice_profile_id, message_id, type, amount, balance_after, request_key, source, created_at)
         VALUES ($1, $2, $3, $4, 'GENERATION_CONSUME', $5, $6, $7, 'VOICE_GENERATION', NOW())`,
        [randomUUID(), input.userId, input.voiceId, input.messageId, -cost, account.balance, `generation:${input.messageId}`],
      );
      await client.query('COMMIT');
      return toCompatibilityQuota(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        released = true;
        client.release();
        return this.completeMessage(input, attempt + 1);
      }
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  async failMessage(input: { userId: string; messageId: string; code: string; message: string }): Promise<void> {
    if (this.database.isCloudBase) {
      await this.database.requireCloud().rpc('rpc_message_complete_failure', {
        pUserId: input.userId,
        pMessageId: input.messageId,
        pErrorCode: input.code,
        pErrorMessage: input.message,
      });
      return;
    }
    await this.database.pool.query(
      `UPDATE messages SET status = 'FAILED', error_code = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND status IN ('PENDING', 'PROCESSING')`,
      [input.code, input.message, input.messageId, input.userId],
    );
  }

  async grantPaidQuota(input: {
    userId: string;
    orderId: string;
    transactionId: string;
    paidAt: Date;
    orderNo?: string;
    notifyDigest?: string;
    appId?: string;
    mchId?: string;
    payerOpenid?: string;
    amountFen?: number;
  }, attempt = 0): Promise<QuotaView> {
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const order = await cloud.selectOne<{ orderNo: string; amountFen: number }>('orders', {
        select: 'order_no,amount_fen',
        filters: { id: input.orderId, userId: input.userId },
      });
      if (!order) throw new NotFoundException('order not found');
      const user = await cloud.selectOne<{ openid: string }>('users', {
        select: 'openid',
        filters: { id: input.userId, deletedAt: { is: null } },
      });
      if (!user) throw new NotFoundException('user not found');
      const result = await cloud.rpc<{ balance: number }>('rpc_payment_apply_success', {
        pOrderNo: input.orderNo || order.orderNo,
        pTransactionId: input.transactionId,
        pPaidAt: input.paidAt.toISOString(),
        pNotifyDigest: input.notifyDigest || '',
        pAppid: input.appId || process.env.WECHAT_APP_ID || '',
        pMchid: input.mchId || process.env.WECHAT_PAY_MCH_ID || '',
        pPayerOpenid: input.payerOpenid || user.openid,
        pAmountFen: input.amountFen ?? Number(order.amountFen),
      });
      return toCompatibilityQuota(Number(result.balance));
    }
    const client = await this.database.pool.connect();
    let released = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const orderResult = await client.query<{
        id: string;
        points: number;
        points_granted_at: Date | null;
      }>(
        `SELECT id, points, points_granted_at FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.orderId, input.userId],
      );
      const order = orderResult.rows[0];
      if (!order) throw new NotFoundException('order not found');
      const account = await lockAccount(client, input.userId);
      if (order.points_granted_at) {
        await client.query('COMMIT');
        return toCompatibilityQuota(account.balance);
      }
      const amount = Number(order.points);
      account.balance += amount;
      await client.query(
        `UPDATE orders SET status = 'PAID', transaction_id = $1, paid_at = $2,
         points_granted_at = NOW(), quota_granted_at = NOW(), updated_at = NOW() WHERE id = $3`,
        [input.transactionId, input.paidAt, input.orderId],
      );
      await client.query('UPDATE point_accounts SET balance = $1, updated_at = NOW() WHERE user_id = $2', [account.balance, input.userId]);
      await client.query(
        `INSERT INTO point_ledgers
         (id, user_id, order_id, type, amount, balance_after, request_key, source, created_at)
         VALUES ($1, $2, $3, 'PURCHASE_GRANT', $4, $5, $6, 'WECHAT_PAY', NOW())`,
        [randomUUID(), input.userId, input.orderId, amount, account.balance, `purchase:${input.orderId}`],
      );
      await client.query('COMMIT');
      return toCompatibilityQuota(account.balance);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (attempt < 3 && this.retryable(error)) {
        released = true;
        client.release();
        return this.grantPaidQuota(input, attempt + 1);
      }
      throw error;
    } finally {
      if (!released) client.release();
    }
  }

  grantPurchasedPoints(input: {
    userId: string;
    orderId: string;
    transactionId: string;
    paidAt: Date;
    orderNo?: string;
    notifyDigest?: string;
    appId?: string;
    mchId?: string;
    payerOpenid?: string;
    amountFen?: number;
  }): Promise<QuotaView> {
    return this.grantPaidQuota(input);
  }
}
