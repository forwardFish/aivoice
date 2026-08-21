import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { evaluateContentSafety, VOICE_QUOTA_PRODUCT } from '@aivoice/contracts';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { conversations, mediaAssets, messages } from '../db/schema.js';
import { MediaService } from '../media/media.service.js';

@Injectable()
export class MessageService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(MediaService)
    private readonly media: MediaService,
  ) {}

  async create(input: {
    userId: string;
    voiceId: string;
    idempotencyKey: string;
    text: string;
    mode: 'CHAT' | 'EXACT_SPEECH';
  }) {
    const text = input.text.trim();
    if (!text) throw new ConflictException('text is required');
    const characterCount = Array.from(text).length;
    if (input.mode === 'EXACT_SPEECH' && characterCount > 50) {
      throw new BadRequestException('exact speech text must be at most 50 characters');
    }
    if (characterCount > 300) throw new BadRequestException('message text must be at most 300 characters');
    const safety = evaluateContentSafety(text);
    if (!safety.safe) {
      throw new HttpException({ code: 'CONTENT_BLOCKED', reason: safety.reason }, 422);
    }
    if (!input.idempotencyKey.trim()) throw new ConflictException('Idempotency-Key is required');
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const existing = await client.query(
        `SELECT id, status FROM messages WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [input.userId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return { messageId: existing.rows[0].id, status: existing.rows[0].status };
      }
      const voiceResult = await client.query<{
        status: string;
        accepted_at: Date | null;
        trial_quota_remaining: number;
        paid_quota_remaining: number;
      }>(
        `SELECT status, accepted_at, trial_quota_remaining, paid_quota_remaining
         FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [input.voiceId, input.userId],
      );
      const voice = voiceResult.rows[0];
      if (!voice) throw new NotFoundException('voice not found');
      if (voice.status !== 'READY' || !voice.accepted_at) throw new ConflictException('VOICE_NOT_READY');
      if (voice.trial_quota_remaining + voice.paid_quota_remaining <= 0) {
        throw new HttpException({
          code: 'QUOTA_EXHAUSTED',
          purchaseOption: VOICE_QUOTA_PRODUCT,
        }, 402);
      }
      const active = await client.query(
        `SELECT id FROM messages WHERE voice_profile_id = $1 AND status IN ('PENDING', 'PROCESSING') LIMIT 1`,
        [input.voiceId],
      );
      if (active.rowCount) throw new ConflictException('GENERATION_IN_PROGRESS');
      const conversationResult = await client.query<{ id: string }>(
        `INSERT INTO conversations (id, voice_profile_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (voice_profile_id) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [randomUUID(), input.voiceId],
      );
      const messageId = randomUUID();
      await client.query(
        `INSERT INTO messages
         (id, conversation_id, user_id, voice_profile_id, idempotency_key, mode, status, input_text, output_text, error_code, error_message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7, '', '', '', NOW(), NOW())`,
        [messageId, conversationResult.rows[0].id, input.userId, input.voiceId, input.idempotencyKey, input.mode, text],
      );
      await client.query(
        `INSERT INTO jobs
         (id, user_id, voice_profile_id, message_id, type, status, dedupe_key, payload, attempts, max_attempts, available_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'GENERATE_MESSAGE', 'QUEUED', $5, $6::jsonb, 0, 3, NOW(), NOW(), NOW())`,
        [randomUUID(), input.userId, input.voiceId, messageId, `generate-message:${messageId}`, JSON.stringify({ messageId, mode: input.mode })],
      );
      await client.query('COMMIT');
      return { messageId, status: 'PROCESSING' as const };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(userId: string, messageId: string) {
    const message = await this.database.db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.userId, userId)),
    });
    if (!message) throw new NotFoundException('message not found');
    const audio = await this.database.db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.messageId, messageId),
        eq(mediaAssets.kind, 'GENERATED_AUDIO'),
        eq(mediaAssets.status, 'READY'),
      ),
    });
    return {
      id: message.id,
      mode: message.mode,
      status: message.status,
      inputText: message.inputText,
      outputText: message.outputText,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      audio: audio ? { mediaId: audio.id, url: this.media.signedUrl(audio.id, userId), durationMs: audio.durationMs } : null,
      createdAt: message.createdAt,
      readyAt: message.readyAt,
    };
  }

  async conversation(userId: string, voiceId: string) {
    const owned = await this.database.pool.query(
      'SELECT id FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [voiceId, userId],
    );
    if (!owned.rowCount) throw new NotFoundException('voice not found');
    const conversation = await this.database.db.query.conversations.findFirst({
      where: eq(conversations.voiceProfileId, voiceId),
    });
    if (!conversation) return { messages: [] };
    const rows = await this.database.db.query.messages.findMany({
      where: and(
        eq(messages.conversationId, conversation.id),
        eq(messages.userId, userId),
        conversation.clearedAt ? gt(messages.createdAt, conversation.clearedAt) : undefined,
      ),
      orderBy: [desc(messages.createdAt)],
      limit: 10,
    });
    rows.reverse();
    const messageIds = rows.map((row) => row.id);
    const audioRows = messageIds.length
      ? await this.database.db.query.mediaAssets.findMany({
        where: and(
          inArray(mediaAssets.messageId, messageIds),
          eq(mediaAssets.kind, 'GENERATED_AUDIO'),
          eq(mediaAssets.status, 'READY'),
        ),
      })
      : [];
    const audioByMessage = new Map(audioRows.map((audio) => [audio.messageId, audio]));
    return {
      conversationId: conversation.id,
      messages: rows.flatMap((row) => {
        const audio = audioByMessage.get(row.id);
        const userMessage = {
          id: `${row.id}-user`,
          role: 'USER' as const,
          mode: row.mode,
          status: 'READY' as const,
          text: row.inputText,
          createdAt: row.createdAt,
        };
        const assistantMessage = {
          id: row.id,
          role: 'ASSISTANT' as const,
          mode: row.mode,
          status: row.status,
          text: row.outputText,
          audio: audio ? {
            mediaId: audio.id,
            url: this.media.signedUrl(audio.id, userId),
            durationMs: audio.durationMs,
          } : null,
          failureCode: row.errorCode,
          createdAt: row.createdAt,
        };
        return row.mode === 'CHAT' ? [userMessage, assistantMessage] : [assistantMessage];
      }),
    };
  }

  async clearConversation(userId: string, voiceId: string) {
    const conversation = await this.database.db.query.conversations.findFirst({
      where: eq(conversations.voiceProfileId, voiceId),
    });
    if (!conversation) return { cleared: true };
    const owned = await this.database.pool.query(
      'SELECT id FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [voiceId, userId],
    );
    if (!owned.rowCount) throw new NotFoundException('voice not found');
    await this.database.db.update(conversations).set({ clearedAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    return { cleared: true };
  }
}
