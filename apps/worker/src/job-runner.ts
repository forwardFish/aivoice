import crypto, { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { evaluateContentSafety } from '@aivoice/contracts';
import { decryptProviderId, encryptProviderId } from './crypto/provider-id.js';
import {
  compileVoiceChatMessages,
  type VoiceChatMessage,
  type VoiceRelationshipType,
} from './chat/voice-chat-context.js';
import { WorkerDatabase } from './db.js';
import { recoverExpiredLeases } from './lease-recovery.js';
import { embedAigcMetadata } from './media/aigc.js';
import { extractReference, probeWav } from './media/ffmpeg.js';
import { cleanupUnpersistedReference, inspectReferenceQuality, ReferenceQualityError } from './media/quality.js';
import { AliyunCosyVoiceProvider } from './providers/aliyun-cosyvoice.js';
import { DashscopeChatProvider } from './providers/dashscope-chat.js';

interface JobRow {
  id: string;
  user_id: string;
  voice_profile_id: string | null;
  message_id: string | null;
  type: 'PROCESS_VOICE' | 'GENERATE_MESSAGE' | 'DELETE_VOICE' | 'DELETE_ACCOUNT';
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
}

interface VoiceProviderPort {
  readonly targetModel: string;
  enroll(referencePath: string, prefix: string): Promise<string>;
  synthesize(voiceId: string, text: string): Promise<Buffer>;
  deleteVoice(voiceId: string): Promise<void>;
}

interface ChatProviderPort {
  reply(messages: VoiceChatMessage[]): Promise<string>;
}

interface JobRunnerDependencies {
  voiceProvider?: VoiceProviderPort;
  chatProvider?: ChatProviderPort;
}

function generationPointCost(): number {
  const raw = process.env.GENERATION_POINT_COST || '1';
  const cost = Number(raw);
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    throw new Error('GENERATION_POINT_COST must be a positive integer');
  }
  return cost;
}

class ContentBlockedError extends Error {
  constructor(readonly reason: string) {
    super('CONTENT_BLOCKED');
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class JobRunner {
  private readonly mediaRoot = path.resolve(process.env.MEDIA_LOCAL_ROOT || '../../.runtime/media');
  private readonly voiceProvider: VoiceProviderPort;
  private readonly chatProvider: ChatProviderPort;
  private readonly pointCost: number;
  private stopping = false;

  constructor(private readonly database: WorkerDatabase, dependencies: JobRunnerDependencies = {}) {
    this.voiceProvider = dependencies.voiceProvider || new AliyunCosyVoiceProvider();
    this.chatProvider = dependencies.chatProvider || new DashscopeChatProvider();
    this.pointCost = generationPointCost();
  }

  stop(): void {
    this.stopping = true;
  }

  private safePath(objectKey: string): string {
    const resolved = path.resolve(this.mediaRoot, objectKey);
    if (!resolved.startsWith(this.mediaRoot + path.sep)) throw new Error('media path escaped storage root');
    return resolved;
  }

  private async acquire(): Promise<JobRow | null> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await recoverExpiredLeases(client);
      const result = await client.query<JobRow>(
        `SELECT id, user_id, voice_profile_id, message_id, type, attempts, max_attempts, payload
         FROM jobs
         WHERE status = 'QUEUED' AND available_at <= NOW()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const job = result.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return null;
      }
      await client.query(
        `UPDATE jobs SET status = 'PROCESSING', attempts = attempts + 1,
         leased_until = NOW() + INTERVAL '5 minutes', heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [job.id],
      );
      await client.query('COMMIT');
      job.attempts += 1;
      return job;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async markSucceeded(jobId: string): Promise<void> {
    await this.database.pool.query(
      `UPDATE jobs SET status = 'SUCCEEDED', leased_until = NULL, heartbeat_at = NOW(),
       error_code = '', error_message = '', finished_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [jobId],
    );
  }

  private async heartbeat(jobId: string): Promise<void> {
    await this.database.pool.query(
      `UPDATE jobs SET leased_until=NOW() + INTERVAL '5 minutes', heartbeat_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='PROCESSING'`,
      [jobId],
    );
  }

  private async markBlocked(job: JobRow, reason: string): Promise<void> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE jobs SET status='FAILED', leased_until=NULL, error_code='CONTENT_BLOCKED', error_message=$1,
         finished_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [reason, job.id],
      );
      if (job.message_id) {
        await client.query(
          `UPDATE messages SET status='BLOCKED', error_code='CONTENT_BLOCKED', error_message=$1, updated_at=NOW()
           WHERE id=$2 AND user_id=$3 AND status IN ('PENDING','PROCESSING')`,
          [reason, job.message_id, job.user_id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async markFailed(job: JobRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const qualityError = error instanceof ReferenceQualityError ? error : null;
    const terminal = Boolean(qualityError) || job.attempts >= job.max_attempts;
    const jobErrorCode = qualityError?.code || 'JOB_FAILED';
    await this.database.pool.query(
      `UPDATE jobs SET status = $1::job_status,
       available_at = CASE WHEN $1::job_status = 'QUEUED'::job_status THEN NOW() + INTERVAL '10 seconds' ELSE available_at END,
       leased_until = NULL, error_code = $2, error_message = $3,
       finished_at = CASE WHEN $1::job_status = 'FAILED'::job_status THEN NOW() ELSE NULL END, updated_at = NOW()
       WHERE id = $4`,
      [terminal ? 'FAILED' : 'QUEUED', jobErrorCode, message.slice(0, 1000), job.id],
    );
    if (terminal && job.voice_profile_id && job.type === 'PROCESS_VOICE') {
      await this.database.pool.query(
        `UPDATE voice_profiles SET status = 'FAILED', failure_code = $1, failure_message = $2, updated_at = NOW()
         WHERE id = $3`,
        [qualityError?.code || 'PROVIDER_FAILED', message.slice(0, 500), job.voice_profile_id],
      );
    }
    if (terminal && job.message_id && job.type === 'GENERATE_MESSAGE') {
      await this.database.pool.query(
        `UPDATE messages SET status = 'FAILED', error_code = 'PROVIDER_FAILED', error_message = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('PENDING', 'PROCESSING')`,
        [message.slice(0, 500), job.message_id],
      );
    }
  }

  private async processVoice(job: JobRow): Promise<void> {
    if (!job.voice_profile_id) throw new Error('PROCESS_VOICE job has no voice_profile_id');
    const result = await this.database.pool.query<{
      user_id: string;
      clip_start_ms: number;
      clip_end_ms: number;
      object_key: string;
      media_id: string;
    }>(
      `SELECT v.user_id, v.clip_start_ms, v.clip_end_ms, m.object_key, m.id AS media_id
       FROM voice_profiles v
       JOIN media_assets m ON m.voice_profile_id = v.id AND m.kind = 'SOURCE_VIDEO' AND m.status = 'READY'
       WHERE v.id = $1 AND v.status IN ('QUEUED', 'PROCESSING')
       ORDER BY m.created_at DESC LIMIT 1`,
      [job.voice_profile_id],
    );
    const row = result.rows[0];
    if ((!row?.clip_start_ms && row?.clip_start_ms !== 0) || row.clip_end_ms === null) throw new Error('voice clip is missing');
    await this.database.pool.query(`UPDATE voice_profiles SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`, [job.voice_profile_id]);
    const sourcePath = this.safePath(row.object_key);
    const referenceKey = path.join('reference', row.user_id, `${job.voice_profile_id}.wav`).replaceAll('\\', '/');
    const referencePath = this.safePath(referenceKey);
    await extractReference({
      videoPath: sourcePath,
      outputPath: referencePath,
      startMs: row.clip_start_ms,
      endMs: row.clip_end_ms,
    });
    let providerVoiceId = '';
    let referencePersisted = false;
    try {
      const referenceProbe = await probeWav(referencePath);
      const quality = await inspectReferenceQuality(referencePath);
      await this.database.pool.query(
        `UPDATE voice_profiles SET quality_report=$1::jsonb, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(quality), job.voice_profile_id],
      );
      if (!quality.acceptable && quality.failureCode) {
        throw new ReferenceQualityError(quality.failureCode, quality);
      }
      const referenceHash = await sha256(referencePath);
      const existing = await this.database.pool.query<{ provider_voice_id_encrypted: string; status: string }>(
        `SELECT provider_voice_id_encrypted,status FROM voice_models
         WHERE voice_profile_id=$1 AND status <> 'DELETED' LIMIT 1`,
        [job.voice_profile_id],
      );
      if (existing.rows[0]) {
        await this.voiceProvider.deleteVoice(decryptProviderId(existing.rows[0].provider_voice_id_encrypted));
        await this.database.pool.query(
          `UPDATE voice_models SET status='DELETED',deleted_at=NOW(),deletion_error='',updated_at=NOW()
           WHERE voice_profile_id=$1`,
          [job.voice_profile_id],
        );
      }
      providerVoiceId = await this.voiceProvider.enroll(referencePath, `av${job.voice_profile_id.replaceAll('-', '').slice(0, 8)}`);
      const previewText = process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。';
      const previewBytes = await this.voiceProvider.synthesize(providerVoiceId, previewText);
      const previewKey = path.join('preview', row.user_id, `${job.voice_profile_id}.wav`).replaceAll('\\', '/');
      const previewPath = this.safePath(previewKey);
      await fs.mkdir(path.dirname(previewPath), { recursive: true });
      await fs.writeFile(previewPath, previewBytes);
      const previewProbe = await probeWav(previewPath);
      const previewHash = await sha256(previewPath);
      const client = await this.database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO media_assets
           (id, user_id, voice_profile_id, kind, status, object_key, mime_type, bytes, duration_ms, sha256, created_at, updated_at)
           VALUES ($1,$2,$3,'REFERENCE_AUDIO','READY',$4,'audio/wav',$5,$6,$7,NOW(),NOW())
           ON CONFLICT (object_key) DO UPDATE SET bytes=$5,duration_ms=$6,sha256=$7,status='READY',updated_at=NOW()`,
          [randomUUID(), row.user_id, job.voice_profile_id, referenceKey, referenceProbe.bytes, referenceProbe.durationMs, referenceHash],
        );
        await client.query(
          `INSERT INTO media_assets
           (id, user_id, voice_profile_id, kind, status, object_key, mime_type, bytes, duration_ms, sha256, created_at, updated_at)
           VALUES ($1,$2,$3,'PREVIEW_AUDIO','READY',$4,'audio/wav',$5,$6,$7,NOW(),NOW())
           ON CONFLICT (object_key) DO UPDATE SET bytes=$5,duration_ms=$6,sha256=$7,status='READY',updated_at=NOW()`,
          [randomUUID(), row.user_id, job.voice_profile_id, previewKey, previewProbe.bytes, previewProbe.durationMs, previewHash],
        );
        await client.query(
          `INSERT INTO voice_models
           (id, voice_profile_id, provider, target_model, provider_voice_id_encrypted, status, deletion_error, created_at, updated_at)
           VALUES ($1,$2,'aliyun-cosyvoice',$3,$4,'READY','',NOW(),NOW())
           ON CONFLICT (voice_profile_id) DO UPDATE SET provider='aliyun-cosyvoice',target_model=$3,provider_voice_id_encrypted=$4,status='READY',updated_at=NOW()`,
          [randomUUID(), job.voice_profile_id, this.voiceProvider.targetModel, encryptProviderId(providerVoiceId)],
        );
        await client.query(`UPDATE voice_profiles SET status='READY',failure_code='',failure_message='',updated_at=NOW() WHERE id=$1`, [job.voice_profile_id]);
        await client.query(`UPDATE media_assets SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE id=$1`, [row.media_id]);
        await client.query('COMMIT');
        referencePersisted = true;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      await fs.unlink(sourcePath).catch(() => undefined);
    } catch (error) {
      if (providerVoiceId) await this.voiceProvider.deleteVoice(providerVoiceId).catch(() => undefined);
      throw error;
    } finally {
      await cleanupUnpersistedReference(referencePath, referencePersisted);
    }
  }

  private async completeGeneratedMessage(input: {
    job: JobRow;
    outputText: string;
    audioPath: string;
    objectKey: string;
  }): Promise<void> {
    const probe = await probeWav(input.audioPath);
    const hash = await sha256(input.audioPath);
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const locked = await client.query<{
        balance: number;
        status: string;
      }>(
        `SELECT pa.balance,m.status
         FROM messages m JOIN point_accounts pa ON pa.user_id=m.user_id
         WHERE m.id=$1 AND m.user_id=$2 FOR UPDATE OF m,pa`,
        [input.job.message_id, input.job.user_id],
      );
      const row = locked.rows[0];
      if (!row) throw new Error('message or point account not found');
      const prior = await client.query(
        `SELECT id FROM point_ledgers WHERE type='GENERATION_CONSUME' AND message_id=$1`,
        [input.job.message_id],
      );
      if (prior.rowCount) {
        await client.query('COMMIT');
        return;
      }
      if (row.balance < this.pointCost) throw new Error('POINTS_EXHAUSTED');
      const balanceAfter = row.balance - this.pointCost;
      await client.query(
        `UPDATE point_accounts SET balance=$1,updated_at=NOW() WHERE user_id=$2`,
        [balanceAfter, input.job.user_id],
      );
      await client.query(
        `UPDATE voice_profiles SET last_used_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [input.job.voice_profile_id],
      );
      await client.query(
        `INSERT INTO media_assets
         (id,user_id,voice_profile_id,message_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'GENERATED_AUDIO','READY',$5,'audio/wav',$6,$7,$8,NOW(),NOW())`,
        [randomUUID(), input.job.user_id, input.job.voice_profile_id, input.job.message_id, input.objectKey, probe.bytes, probe.durationMs, hash],
      );
      await client.query(`UPDATE messages SET status='READY',output_text=$1,ready_at=NOW(),updated_at=NOW() WHERE id=$2`, [input.outputText, input.job.message_id]);
      await client.query(
        `INSERT INTO point_ledgers
         (id,user_id,voice_profile_id,message_id,type,amount,balance_after,request_key,created_at)
         VALUES ($1,$2,$3,$4,'GENERATION_CONSUME',$5,$6,$7,NOW())`,
        [
          randomUUID(),
          input.job.user_id,
          input.job.voice_profile_id,
          input.job.message_id,
          -this.pointCost,
          balanceAfter,
          `generation:${input.job.message_id}`,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async generateMessage(job: JobRow): Promise<void> {
    if (!job.message_id || !job.voice_profile_id) throw new Error('GENERATE_MESSAGE job is incomplete');
    const result = await this.database.pool.query<{
      input_text: string;
      mode: 'CHAT' | 'EXACT_SPEECH';
      conversation_id: string;
      provider_voice_id_encrypted: string;
      voice_name: string;
      relationship_type: VoiceRelationshipType | null;
      relationship_label: string;
      user_address: string;
      cleared_at: Date | null;
    }>(
      `SELECT m.input_text,m.mode,m.conversation_id,vm.provider_voice_id_encrypted,
              vp.name AS voice_name,vp.relationship_type,vp.relationship_label,vp.user_address,c.cleared_at
       FROM messages m
       JOIN conversations c ON c.id=m.conversation_id
       JOIN voice_profiles vp ON vp.id=m.voice_profile_id AND vp.user_id=m.user_id AND vp.deleted_at IS NULL
       JOIN voice_models vm ON vm.voice_profile_id=m.voice_profile_id AND vm.status='READY'
       WHERE m.id=$1 AND m.user_id=$2`,
      [job.message_id, job.user_id],
    );
    const message = result.rows[0];
    if (!message) throw new Error('message or ready voice model not found');
    let outputText = message.input_text;
    if (message.mode === 'CHAT') {
      const historyResult = await this.database.pool.query<{ id: string; mode: string; input_text: string; output_text: string }>(
        `SELECT id,mode,input_text,output_text FROM messages
         WHERE conversation_id=$1 AND status='READY' AND mode='CHAT'
           AND ($2::timestamptz IS NULL OR created_at>$2)
         ORDER BY created_at DESC,id DESC LIMIT 8`,
        [message.conversation_id, message.cleared_at],
      );
      const context = compileVoiceChatMessages({
        voiceName: message.voice_name,
        relationshipType: message.relationship_type,
        relationshipLabel: message.relationship_label,
        userAddress: message.user_address,
        history: historyResult.rows.reverse().map((row) => ({
          messageId: row.id,
          mode: row.mode,
          inputText: row.input_text,
          outputText: row.output_text,
        })),
        currentInput: message.input_text,
      });
      outputText = await this.chatProvider.reply(context.messages);
    }
    const outputSafety = evaluateContentSafety(outputText);
    if (!outputSafety.safe) throw new ContentBlockedError(outputSafety.reason || 'OUTPUT_CONTENT_BLOCKED');
    const voiceId = decryptProviderId(message.provider_voice_id_encrypted);
    const audio = await this.voiceProvider.synthesize(voiceId, outputText);
    const objectKey = path.join('generated', job.user_id, job.voice_profile_id, `${job.message_id}.wav`).replaceAll('\\', '/');
    const audioPath = this.safePath(objectKey);
    await fs.mkdir(path.dirname(audioPath), { recursive: true });
    try {
      await fs.writeFile(audioPath, audio);
      await embedAigcMetadata(audioPath, job.message_id);
      await this.completeGeneratedMessage({ job, outputText, audioPath, objectKey });
    } catch (error) {
      await fs.unlink(audioPath).catch(() => undefined);
      throw error;
    }
  }

  private async deleteVoice(job: JobRow): Promise<void> {
    if (!job.voice_profile_id) throw new Error('DELETE_VOICE job has no voice_profile_id');
    const models = await this.database.pool.query<{ provider_voice_id_encrypted: string; status: string }>(
      `SELECT provider_voice_id_encrypted,status FROM voice_models WHERE voice_profile_id=$1 LIMIT 1`,
      [job.voice_profile_id],
    );
    const model = models.rows[0];
    if (model && model.status !== 'DELETED') {
      await this.voiceProvider.deleteVoice(decryptProviderId(model.provider_voice_id_encrypted));
    }
    const assets = await this.database.pool.query<{ id: string; object_key: string }>(
      `SELECT id,object_key FROM media_assets WHERE voice_profile_id=$1 AND status <> 'DELETED'`,
      [job.voice_profile_id],
    );
    for (const asset of assets.rows) await fs.unlink(this.safePath(asset.object_key)).catch(() => undefined);
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE media_assets SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE voice_profile_id=$1`, [job.voice_profile_id]);
      await client.query(`UPDATE voice_models SET status='DELETED',deleted_at=NOW(),deletion_error='',updated_at=NOW() WHERE voice_profile_id=$1`, [job.voice_profile_id]);
      await client.query(`UPDATE voice_profiles SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE id=$1`, [job.voice_profile_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async deleteAccount(job: JobRow): Promise<void> {
    const models = await this.database.pool.query<{ voice_profile_id: string; provider_voice_id_encrypted: string; status: string }>(
      `SELECT vm.voice_profile_id,vm.provider_voice_id_encrypted,vm.status
       FROM voice_models vm JOIN voice_profiles v ON v.id=vm.voice_profile_id
       WHERE v.user_id=$1`,
      [job.user_id],
    );
    for (const model of models.rows) {
      if (model.status !== 'DELETED') {
        await this.voiceProvider.deleteVoice(decryptProviderId(model.provider_voice_id_encrypted));
      }
    }
    const assets = await this.database.pool.query<{ object_key: string }>(
      `SELECT object_key FROM media_assets WHERE user_id=$1 AND status <> 'DELETED'`,
      [job.user_id],
    );
    for (const asset of assets.rows) await fs.unlink(this.safePath(asset.object_key)).catch(() => undefined);
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE media_assets SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE user_id=$1`, [job.user_id]);
      await client.query(
        `UPDATE voice_models SET status='DELETED',deleted_at=NOW(),deletion_error='',updated_at=NOW()
         WHERE voice_profile_id IN (SELECT id FROM voice_profiles WHERE user_id=$1)`,
        [job.user_id],
      );
      await client.query(`UPDATE voice_profiles SET status='DELETED',deleted_at=NOW(),updated_at=NOW() WHERE user_id=$1`, [job.user_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async execute(job: JobRow): Promise<void> {
    if (job.type === 'PROCESS_VOICE') return this.processVoice(job);
    if (job.type === 'GENERATE_MESSAGE') return this.generateMessage(job);
    if (job.type === 'DELETE_VOICE') return this.deleteVoice(job);
    if (job.type === 'DELETE_ACCOUNT') return this.deleteAccount(job);
    throw new Error(`job type not implemented: ${job.type}`);
  }

  async runOnce(): Promise<boolean> {
    const job = await this.acquire();
    if (!job) return false;
    try {
      const heartbeatMs = Math.max(5_000, Number(process.env.WORKER_HEARTBEAT_MS || 60_000));
      const timer = setInterval(() => {
        void this.heartbeat(job.id).catch((error) => console.error('worker heartbeat failed', error));
      }, heartbeatMs);
      try {
        await this.execute(job);
        await this.markSucceeded(job.id);
      } finally {
        clearInterval(timer);
      }
    } catch (error) {
      if (error instanceof ContentBlockedError) await this.markBlocked(job, error.reason);
      else await this.markFailed(job, error);
    }
    return true;
  }

  async run(): Promise<void> {
    while (!this.stopping) {
      if (!await this.runOnce()) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
