import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { evaluateContentSafety, hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { invokeWorkerAsync } from '../db/cloudbase-worker-invoker.js';
import { conversations, mediaAssets, messages } from '../db/schema.js';
import { MediaService } from '../media/media.service.js';
import { loadPointsConfig } from '../quota/points.config.js';

type MessageMode = 'CHAT' | 'EXACT_SPEECH';
type MessageStatus = typeof messages.status.enumValues[number];

interface CloudMessageRow {
  id: string;
  conversationId: string;
  userId: string;
  voiceProfileId: string;
  mode: MessageMode;
  status: MessageStatus;
  inputText: string;
  outputText: string;
  errorCode: string;
  errorMessage: string;
  createdAt: string | Date;
  readyAt: string | Date | null;
}

interface CloudConversationRow {
  id: string;
  voiceProfileId: string;
  clearedAt: string | Date | null;
}

interface CloudMediaRow {
  id: string;
  messageId: string | null;
  durationMs: number | null;
}

interface MessageCreateRpcResult {
  messageId: string;
  status: MessageStatus;
  jobId?: string;
  idempotent?: boolean;
  errorCode?: string;
  availablePoints?: number;
}

function firstRpcRow<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const body = 'body' in error ? (error as Error & { body?: unknown }).body : undefined;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    return [record.code, record.message, record.details, record.hint].filter(Boolean).join(' ');
  }
  return error.message;
}

const IDENTITY_BLOCKED_COPY = '这条回复未通过身份表达检查，已隐藏。';

function visibleAssistantOutput(message: Pick<CloudMessageRow, 'mode' | 'status' | 'outputText' | 'errorCode'>) {
  const blocked = message.mode === 'CHAT' && hasForbiddenAssistantIdentityDisclosure(message.outputText || '');
  return {
    blocked,
    status: blocked ? 'BLOCKED' as const : message.status,
    text: blocked ? IDENTITY_BLOCKED_COPY : message.outputText,
    errorCode: blocked ? 'IDENTITY_DISCLOSURE_BLOCKED' : message.errorCode,
  };
}

@Injectable()
export class MessageService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(MediaService)
    private readonly media: MediaService,
  ) {}

  private async rethrowCloud(error: unknown, userId?: string): Promise<never> {
    const message = errorText(error);
    if (/MESSAGE_NOT_FOUND|message not found/i.test(message)) throw new NotFoundException('message not found');
    if (/VOICE_NOT_FOUND|voice not found/i.test(message)) throw new NotFoundException('voice not found');
    if (/POINT_ACCOUNT_NOT_FOUND|point account not found/i.test(message)) throw new NotFoundException('point account not found');
    if (/POINTS_EXHAUSTED/i.test(message)) {
      const account = userId
        ? await this.database.requireCloud().selectOne<{ balance: number }>('point_accounts', {
          filters: { userId },
          select: 'balance',
        })
        : null;
      const config = loadPointsConfig();
      throw new HttpException({
        code: 'POINTS_EXHAUSTED',
        availablePoints: Number(account?.balance || 0),
        generationCost: config.generationCost,
        purchaseOption: config.product,
      }, 402);
    }
    const conflictAliases: Array<[string, string]> = [
      ['VOICE_NOT_READY', 'VOICE_NOT_READY'],
      ['GENERATION_IN_PROGRESS', 'GENERATION_IN_PROGRESS'],
      ['IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required'],
      ['INVALID_MESSAGE_TEXT', 'message text is invalid'],
      ['INVALID_GENERATION_COST', 'invalid generation cost'],
    ];
    const knownConflict = conflictAliases.find(([code]) => message.includes(code));
    if (knownConflict) throw new ConflictException(knownConflict[1]);
    throw error;
  }

  private async triggerJob(jobId: string | undefined) {
    if (!jobId) return;
    await invokeWorkerAsync({ jobId, type: 'GENERATE_MESSAGE' });
  }

  async create(input: {
    userId: string;
    voiceId: string;
    idempotencyKey: string;
    text: string;
    mode: MessageMode;
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
    if (this.database.isCloudBase) {
      const totalStartedAt = Date.now();
      let activeStage = 'create_message';
      let createMessageMs = 0;
      let lookupJobMs = 0;
      let dispatchWorkerMs = 0;
      let messageId = '';
      let jobId = '';
      try {
        const createStartedAt = Date.now();
        const raw = await this.database.requireCloud().rpc<
          MessageCreateRpcResult | MessageCreateRpcResult[]
        >('rpc_message_create', {
          pUserId: input.userId,
          pVoiceId: input.voiceId,
          pIdempotencyKey: input.idempotencyKey,
          pMode: input.mode,
          pInputText: text,
          pGenerationCost: loadPointsConfig().generationCost,
        });
        createMessageMs = Date.now() - createStartedAt;
        const result = firstRpcRow(raw);
        if (!result) throw new Error('CloudBase did not return the created message');
        messageId = result.messageId;
        if (result.errorCode === 'POINTS_EXHAUSTED') {
          const config = loadPointsConfig();
          throw new HttpException({
            code: 'POINTS_EXHAUSTED',
            availablePoints: Number(result.availablePoints || 0),
            generationCost: config.generationCost,
            purchaseOption: config.product,
          }, 402);
        }
        jobId = result.jobId || '';
        if (!jobId && result.status === 'PROCESSING') {
          activeStage = 'lookup_job';
          const lookupStartedAt = Date.now();
          const job = await this.database.requireCloud().selectOne<{ id: string }>('jobs', {
            select: 'id',
            filters: { messageId: result.messageId, type: 'GENERATE_MESSAGE', status: { in: ['QUEUED', 'PROCESSING'] } },
            order: [{ column: 'createdAt', ascending: false }],
          });
          jobId = job?.id || '';
          lookupJobMs = Date.now() - lookupStartedAt;
        }
        activeStage = 'dispatch_worker';
        const dispatchStartedAt = Date.now();
        await this.triggerJob(jobId);
        dispatchWorkerMs = Date.now() - dispatchStartedAt;
        console.info('message_dispatch_timing', JSON.stringify({
          event: 'message_dispatch_timing',
          status: 'SUCCEEDED',
          messageId: result.messageId,
          jobId: jobId || '',
          mode: input.mode,
          idempotent: Boolean(result.idempotent),
          createMessageMs,
          lookupJobMs,
          dispatchWorkerMs,
          slowestStage: createMessageMs >= lookupJobMs && createMessageMs >= dispatchWorkerMs
            ? 'create_message'
            : lookupJobMs >= dispatchWorkerMs ? 'lookup_job' : 'dispatch_worker',
          slowestStageMs: Math.max(createMessageMs, lookupJobMs, dispatchWorkerMs),
          totalMs: Date.now() - totalStartedAt,
          overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
        }));
        return { messageId: result.messageId, status: result.status };
      } catch (error) {
        console.error('message_dispatch_timing', JSON.stringify({
          event: 'message_dispatch_timing',
          status: 'FAILED',
          messageId,
          jobId,
          mode: input.mode,
          failedStage: activeStage,
          createMessageMs,
          lookupJobMs,
          dispatchWorkerMs,
          slowestStage: activeStage,
          slowestStageMs: Math.max(createMessageMs, lookupJobMs, dispatchWorkerMs),
          totalMs: Date.now() - totalStartedAt,
          overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
          error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        }));
        if (error instanceof HttpException) throw error;
        return this.rethrowCloud(error, input.userId);
      }
    }
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
      const accountResult = await client.query<{ balance: number }>(
        'SELECT balance FROM point_accounts WHERE user_id = $1 FOR UPDATE',
        [input.userId],
      );
      const account = accountResult.rows[0];
      if (!account) throw new NotFoundException('point account not found');
      const voiceResult = await client.query<{
        status: string;
        accepted_at: Date | null;
      }>(
        `SELECT status, accepted_at
         FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [input.voiceId, input.userId],
      );
      const voice = voiceResult.rows[0];
      if (!voice) throw new NotFoundException('voice not found');
      if (voice.status !== 'READY' || !voice.accepted_at) throw new ConflictException('VOICE_NOT_READY');
      const activeResult = await client.query<{ active_count: number }>(
        `SELECT COUNT(*)::integer AS active_count FROM messages
         WHERE user_id = $1 AND status IN ('PENDING', 'PROCESSING')`,
        [input.userId],
      );
      const config = loadPointsConfig();
      const requiredPoints = config.generationCost * (Number(activeResult.rows[0]?.active_count || 0) + 1);
      if (Number(account.balance) < requiredPoints) {
        throw new HttpException({
          code: 'POINTS_EXHAUSTED',
          availablePoints: Number(account.balance),
          generationCost: config.generationCost,
          purchaseOption: config.product,
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
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const message = await cloud.selectOne<CloudMessageRow>('messages', {
        filters: { id: messageId, userId },
      });
      if (!message) throw new NotFoundException('message not found');
      const audio = await cloud.selectOne<CloudMediaRow>('media_assets', {
        filters: { messageId, kind: 'GENERATED_AUDIO', status: 'READY', deletedAt: null },
        order: [{ column: 'createdAt', ascending: false }],
      });
      const visible = visibleAssistantOutput(message);
      return {
        id: message.id,
        mode: message.mode,
        status: visible.status,
        inputText: message.inputText,
        outputText: visible.text,
        errorCode: visible.errorCode,
        errorMessage: message.errorMessage,
        audio: !visible.blocked && audio ? {
          mediaId: audio.id,
          url: await this.media.signedUrl(audio.id, userId),
          durationMs: audio.durationMs,
        } : null,
        createdAt: message.createdAt,
        readyAt: message.readyAt,
      };
    }
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
    const visible = visibleAssistantOutput(message);
    return {
      id: message.id,
      mode: message.mode,
      status: visible.status,
      inputText: message.inputText,
      outputText: visible.text,
      errorCode: visible.errorCode,
      errorMessage: message.errorMessage,
      audio: !visible.blocked && audio ? { mediaId: audio.id, url: await this.media.signedUrl(audio.id, userId), durationMs: audio.durationMs } : null,
      createdAt: message.createdAt,
      readyAt: message.readyAt,
    };
  }

  async conversation(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const owned = await cloud.selectOne<{ id: string }>('voice_profiles', {
        select: 'id',
        filters: { id: voiceId, userId, deletedAt: null },
      });
      if (!owned) throw new NotFoundException('voice not found');
      const conversation = await cloud.selectOne<CloudConversationRow>('conversations', {
        filters: { voiceProfileId: voiceId },
      });
      if (!conversation) return { messages: [] };
      const rows = await cloud.select<CloudMessageRow>('messages', {
        filters: {
          conversationId: conversation.id,
          userId,
          ...(conversation.clearedAt ? { createdAt: { gt: conversation.clearedAt } } : {}),
        },
        order: [{ column: 'createdAt', ascending: false }],
        limit: 10,
      });
      rows.reverse();
      const messageIds = rows.map((row) => row.id);
      const audioRows = messageIds.length
        ? await cloud.select<CloudMediaRow>('media_assets', {
          filters: {
            messageId: { in: messageIds },
            kind: 'GENERATED_AUDIO',
            status: 'READY',
            deletedAt: null,
          },
        })
        : [];
      const audioByMessage = new Map(audioRows.map((audio) => [audio.messageId, audio]));
      return {
        conversationId: conversation.id,
        messages: (await Promise.all(rows.map(async (row) => {
          const audio = audioByMessage.get(row.id);
          const visible = visibleAssistantOutput(row);
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
            status: visible.status,
            text: visible.text,
            audio: !visible.blocked && audio ? {
              mediaId: audio.id,
              url: await this.media.signedUrl(audio.id, userId),
              durationMs: audio.durationMs,
            } : null,
            failureCode: visible.errorCode,
            createdAt: row.createdAt,
          };
          return row.mode === 'CHAT' ? [userMessage, assistantMessage] : [assistantMessage];
        }))).flat(),
      };
    }
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
      messages: (await Promise.all(rows.map(async (row) => {
        const audio = audioByMessage.get(row.id);
        const visible = visibleAssistantOutput(row);
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
          status: visible.status,
          text: visible.text,
          audio: !visible.blocked && audio ? {
            mediaId: audio.id,
            url: await this.media.signedUrl(audio.id, userId),
            durationMs: audio.durationMs,
          } : null,
          failureCode: visible.errorCode,
          createdAt: row.createdAt,
        };
        return row.mode === 'CHAT' ? [userMessage, assistantMessage] : [assistantMessage];
      }))).flat(),
    };
  }

  async clearConversation(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const conversation = await cloud.selectOne<CloudConversationRow>('conversations', {
        filters: { voiceProfileId: voiceId },
      });
      if (!conversation) return { cleared: true };
      const owned = await cloud.selectOne<{ id: string }>('voice_profiles', {
        select: 'id',
        filters: { id: voiceId, userId, deletedAt: null },
      });
      if (!owned) throw new NotFoundException('voice not found');
      await cloud.update('conversations', {
        clearedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { filters: { id: conversation.id } });
      return { cleared: true };
    }
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
