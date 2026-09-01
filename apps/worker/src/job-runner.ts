import crypto, { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { evaluateContentSafety } from '@aivoice/contracts';
import { decryptProviderId, encryptProviderId } from './crypto/provider-id.js';
import { VoiceGenerationCoordinator } from './voice-generation-coordinator.js';
import type { GeneratedVoiceCandidate } from './voice-generation-strategy.js';
import { voiceCompanionBudgetPolicy } from './voice-companion-budget.js';
import {
  compileVoiceChatMessages,
  relationshipReplyViolation,
  type VoiceChatMessage,
  type VoiceRelationshipType,
} from './chat/voice-chat-context.js';
import {
  legacyCharacterTurnGeneration,
  normalizeInteractionStateDetailed,
  type CharacterTurnGeneration,
  type ConversationInteractionState,
} from './chat/interaction-state.js';
import { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, sanitizeSelfUnsupportedPersonalHistory, sanitizeUnsupportedPresentSceneClaims } from './chat/human-likeness.js';
import { validateQuestionBehavior } from './chat/dialogue-control.js';
import { personalityTurnFocusReplyViolation, resolvedBoundaryReplyViolation } from './chat/personality-turn-focus.js';
import { WorkerDatabase } from './db.js';
import { recoverExpiredLeases } from './lease-recovery.js';
import { embedAigcMetadata } from './media/aigc.js';
import { extractReference, probeWav } from './media/ffmpeg.js';
import { cleanupUnpersistedReference, inspectReferenceQuality, ReferenceQualityError } from './media/quality.js';
import { createVoiceProviderRegistry, type VoiceProviderRegistry } from './providers/voice-provider-registry.js';
import { usesReferenceAudio, VoiceGenerationError, type VoiceProviderPort } from './providers/voice-provider.js';
import { buildSpeechSynthesisPlan } from './speech-instruction.js';
import { createVoiceDeliveryPlan } from './voice-delivery-plan.js';
import { buildEmotionExpressionPlan } from './emotion-expression.js';
import { observedPersonEvidenceFromQualityReport, persistedPersonCorrectionsFromQualityReport, speechPlanBaselineWithCorrections, voiceObservedDeliveryBaselineWithCorrections } from './observed-person-evidence.js';
import { createChatProviderFromEnv } from './providers/chat-provider-factory.js';
import type { ChatProviderPort } from './providers/chat-provider.js';
import {
  evaluateCharacterGenerationQuality,
  chatTemperatureForFocus,
  GenerationQualityError,
  qualityRetryMessages,
  withOneQualityRetry,
} from './chat/generation-quality.js';

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

interface JobRunnerDependencies {
  voiceProvider?: VoiceProviderPort;
  registeredVoiceProvider?: VoiceProviderPort;
  companionVoiceProviders?: VoiceProviderPort[];
  voiceProviderRegistry?: VoiceProviderRegistry;
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
  private readonly voiceProviders: VoiceProviderRegistry;
  private readonly voiceProvider: VoiceProviderPort;
  private readonly voiceGenerationCoordinator: VoiceGenerationCoordinator;
  private readonly chatProvider: ChatProviderPort;
  private readonly pointCost: number;
  private stopping = false;

  constructor(private readonly database: WorkerDatabase, dependencies: JobRunnerDependencies = {}) {
    this.voiceProviders = dependencies.voiceProviderRegistry || createVoiceProviderRegistry({
      active: dependencies.voiceProvider,
      registered: dependencies.registeredVoiceProvider,
      companions: dependencies.companionVoiceProviders,
    });
    this.voiceProvider = this.voiceProviders.active.provider;
    this.voiceGenerationCoordinator = new VoiceGenerationCoordinator(this.voiceProviders);
    this.chatProvider = dependencies.chatProvider || createChatProviderFromEnv();
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

  private async deleteProviderBinding(providerBinding: string): Promise<void> {
    if (!providerBinding || providerBinding.startsWith('reference/')) return;
    await this.registeredProvider().deleteVoice(providerBinding);
  }

  private registeredProvider(): VoiceProviderPort {
    return this.voiceProviders.registered.provider;
  }

  private async reserveVoiceCompanionBudget(job: JobRow, providerId: string): Promise<boolean> {
    const policy = voiceCompanionBudgetPolicy(providerId);
    if (!policy) return true;
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [job.user_id]);
      const current = await client.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM jobs
         WHERE id=$1 AND user_id=$2 AND type='GENERATE_MESSAGE'
         FOR UPDATE`,
        [job.id, job.user_id],
      );
      const payload = current.rows[0]?.payload;
      if (!payload) throw new Error('GENERATION_JOB_NOT_FOUND');
      const reservations = payload.voiceCompanionReservations;
      if (reservations && typeof reservations === 'object' && providerId in reservations) {
        await client.query('COMMIT');
        console.info('voice_companion_budget', JSON.stringify({
          event: 'voice_companion_budget', status: 'ALREADY_RESERVED', provider: providerId,
          jobId: job.id, userId: job.user_id, limit: policy.limit, windowSize: policy.windowSize,
        }));
        return false;
      }
      const usedResult = await client.query<{ current_in_window: boolean; used: number }>(
        `SELECT COALESCE(bool_or(id=$2),false) AS current_in_window,
           count(*) FILTER (
             WHERE COALESCE(recent.payload->'voiceCompanionReservations','{}'::jsonb) ? $4
           )::integer AS used
         FROM (
           SELECT id,payload FROM jobs
           WHERE user_id=$1 AND type='GENERATE_MESSAGE'
           ORDER BY created_at DESC,id DESC
           LIMIT $3
         ) recent`,
        [job.user_id, job.id, policy.windowSize, providerId],
      );
      const currentInWindow = Boolean(usedResult.rows[0]?.current_in_window);
      const used = Number(usedResult.rows[0]?.used || 0);
      if (!currentInWindow) {
        await client.query('COMMIT');
        console.info('voice_companion_budget', JSON.stringify({
          event: 'voice_companion_budget', status: 'OUTSIDE_CURRENT_WINDOW', provider: providerId,
          jobId: job.id, userId: job.user_id, used, limit: policy.limit, windowSize: policy.windowSize,
        }));
        return false;
      }
      if (used >= policy.limit) {
        await client.query('COMMIT');
        console.info('voice_companion_budget', JSON.stringify({
          event: 'voice_companion_budget', status: 'DENIED', provider: providerId,
          jobId: job.id, userId: job.user_id, used, limit: policy.limit, windowSize: policy.windowSize,
        }));
        return false;
      }
      await client.query(
        `UPDATE jobs SET payload=jsonb_set(
           jsonb_set(COALESCE(payload,'{}'::jsonb),'{voiceCompanionReservations}',
             COALESCE(payload->'voiceCompanionReservations','{}'::jsonb),true),
           ARRAY['voiceCompanionReservations',$1],
           jsonb_build_object('reservedAt',now(),'limit',$2::integer,'windowSize',$3::integer),true
         ),updated_at=NOW()
         WHERE id=$4`,
        [providerId, policy.limit, policy.windowSize, job.id],
      );
      await client.query('COMMIT');
      console.info('voice_companion_budget', JSON.stringify({
        event: 'voice_companion_budget', status: 'RESERVED', provider: providerId,
        jobId: job.id, userId: job.user_id, used: used + 1, limit: policy.limit, windowSize: policy.windowSize,
      }));
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('voice_companion_budget', JSON.stringify({
        event: 'voice_companion_budget', status: 'FAILED_CLOSED', provider: providerId,
        jobId: job.id, userId: job.user_id,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      }));
      return false;
    } finally {
      client.release();
    }
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
    const voiceGenerationError = error instanceof VoiceGenerationError ? error : null;
    const terminal = Boolean(qualityError) || error instanceof VoiceGenerationError || job.attempts >= job.max_attempts;
    const jobErrorCode = qualityError?.code || voiceGenerationError?.code || 'JOB_FAILED';
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
        [qualityError?.code || voiceGenerationError?.code || 'PROVIDER_FAILED', message.slice(0, 500), job.voice_profile_id],
      );
    }
    if (terminal && job.message_id && job.type === 'GENERATE_MESSAGE') {
      await this.database.pool.query(
        `UPDATE messages SET status = 'FAILED', error_code = $1, error_message = $2, updated_at = NOW()
         WHERE id = $3 AND status IN ('PENDING', 'PROCESSING')`,
        [voiceGenerationError?.code || 'PROVIDER_FAILED', message.slice(0, 500), job.message_id],
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
      age_years: number | null;
      gender: 'FEMALE' | 'MALE' | null;
      user_age_years: number | null;
      relationship_type: VoiceRelationshipType | null;
    }>(
      `SELECT v.user_id,v.clip_start_ms,v.clip_end_ms,v.age_years,v.gender,v.user_age_years,v.relationship_type,
              m.object_key,m.id AS media_id
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
    let providerBinding = '';
    let referencePersisted = false;
    const registeredProvider = this.registeredProvider();
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
        await this.deleteProviderBinding(decryptProviderId(existing.rows[0].provider_voice_id_encrypted));
        await this.database.pool.query(
          `UPDATE voice_models SET status='DELETED',deleted_at=NOW(),deletion_error='',updated_at=NOW()
           WHERE voice_profile_id=$1`,
          [job.voice_profile_id],
        );
      }
      const previewText = process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。';
      providerBinding = await registeredProvider.enroll(referencePath, `av${job.voice_profile_id.replaceAll('-', '').slice(0, 8)}`);
      const previewBytes = await this.voiceProvider.synthesize(
        usesReferenceAudio(this.voiceProvider) ? referencePath : providerBinding,
        previewText,
        {
          jobId: job.id,
          relationshipType: row.relationship_type,
          deliveryMode: 'CASUAL',
          speechAct: 'REPLY',
        },
      );
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
            VALUES ($1,$2,$3,$4,$5,'READY','',NOW(),NOW())
            ON CONFLICT (voice_profile_id) DO UPDATE SET provider=$3,target_model=$4,provider_voice_id_encrypted=$5,status='READY',updated_at=NOW()`,
          [
            randomUUID(),
            job.voice_profile_id,
            registeredProvider.providerName || 'aliyun-cosyvoice',
            registeredProvider.targetModel,
            encryptProviderId(providerBinding),
          ],
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
      if (providerBinding) await registeredProvider.deleteVoice(providerBinding).catch(() => undefined);
      throw error;
    } finally {
      await cleanupUnpersistedReference(referencePath, referencePersisted);
    }
  }

  private async prepareGeneratedAudio(audioPath: string, messageId: string, audio: Buffer): Promise<{
    bytes: number;
    durationMs: number;
    sha256: string;
  }> {
    await fs.writeFile(audioPath, audio);
    await embedAigcMetadata(audioPath, messageId);
    const [probe, hash] = await Promise.all([probeWav(audioPath), sha256(audioPath)]);
    return { bytes: probe.bytes, durationMs: probe.durationMs, sha256: hash };
  }

  private async upgradeReadyMessageAudio(input: {
    job: JobRow;
    audioPath: string;
    candidate: GeneratedVoiceCandidate;
  }): Promise<void> {
    if (!input.job.message_id) return;
    const prepared = await this.prepareGeneratedAudio(input.audioPath, input.job.message_id, input.candidate.audio);
    const result = await this.database.pool.query(
      `UPDATE media_assets SET bytes=$1,duration_ms=$2,sha256=$3,updated_at=NOW()
       WHERE message_id=$4 AND kind='GENERATED_AUDIO' AND status='READY' AND deleted_at IS NULL`,
      [prepared.bytes, prepared.durationMs, prepared.sha256, input.job.message_id],
    );
    if (!result.rowCount) throw new Error('MESSAGE_AUDIO_NOT_READY');
    console.info('voice_quality_upgrade', JSON.stringify({
      event: 'voice_quality_upgrade', status: 'SUCCEEDED', messageId: input.job.message_id,
      provider: input.candidate.id,
      providerElapsedMs: input.candidate.elapsedMs, durationMs: prepared.durationMs, bytes: prepared.bytes,
    }));
  }

  private async completeGeneratedMessage(input: {
    job: JobRow;
    outputText: string;
    audioPath: string;
    objectKey: string;
    interactionState: ConversationInteractionState | null;
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
      await client.query(`UPDATE messages SET status='READY',output_text=$1,interaction_state=$2::jsonb,ready_at=NOW(),updated_at=NOW() WHERE id=$3`, [input.outputText, JSON.stringify(input.interactionState || {}), input.job.message_id]);
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
      reference_object_key: string;
      voice_name: string;
      relationship_type: VoiceRelationshipType | null;
      relationship_label: string;
      user_address: string;
      age_years: number | null;
      gender: 'FEMALE' | 'MALE' | null;
      user_age_years: number | null;
      user_life_stage: 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT' | null;
      background: string;
      relationship_note: string;
      personality_note: string;
      speech_habit_note: string;
      quality_report: unknown;
      cleared_at: Date | null;
    }>(
      `SELECT m.input_text,m.mode,m.conversation_id,vm.provider_voice_id_encrypted,ra.object_key AS reference_object_key,
              vp.name AS voice_name,vp.relationship_type,vp.relationship_label,vp.user_address,
              vp.age_years,vp.gender,vp.user_age_years,vp.user_life_stage,vp.background,vp.relationship_note,
              vp.personality_note,vp.speech_habit_note,vp.quality_report,c.cleared_at
       FROM messages m
       JOIN conversations c ON c.id=m.conversation_id
       JOIN voice_profiles vp ON vp.id=m.voice_profile_id AND vp.user_id=m.user_id AND vp.deleted_at IS NULL
       JOIN voice_models vm ON vm.voice_profile_id=m.voice_profile_id AND vm.status='READY'
       JOIN media_assets ra ON ra.voice_profile_id=m.voice_profile_id AND ra.kind='REFERENCE_AUDIO'
         AND ra.status='READY' AND ra.deleted_at IS NULL
       WHERE m.id=$1 AND m.user_id=$2`,
      [job.message_id, job.user_id],
    );
    const message = result.rows[0];
    if (!message) throw new Error('message or ready voice model not found');
    const providerBinding = decryptProviderId(message.provider_voice_id_encrypted);
    if (usesReferenceAudio(this.voiceProvider) && !message.reference_object_key) {
      throw new VoiceGenerationError(
        'Existing voice has no retained reference audio for Seed Audio use',
        'VOICE_REPROCESS_REQUIRED_FOR_SEED_AUDIO',
      );
    }
    const observedPersonEvidence = observedPersonEvidenceFromQualityReport(message.quality_report);
    const persistedPersonCorrections = persistedPersonCorrectionsFromQualityReport(message.quality_report);
    let outputText = message.input_text;
    let speechTone: import('./chat/interaction-state.js').ReplyTone = 'PLAIN';
    let interactionState: ConversationInteractionState | null = null;
    let personalityTurnFocus: import('./chat/personality-turn-focus.js').PersonalityTurnFocus | null = null;
    if (message.mode === 'CHAT') {
      const historyResult = await this.database.pool.query<{ id: string; mode: string; input_text: string; output_text: string; interaction_state: unknown }>(
        `SELECT id,mode,input_text,output_text,interaction_state FROM messages
         WHERE conversation_id=$1 AND status='READY' AND mode='CHAT'
           AND ($2::timestamptz IS NULL OR created_at>$2)
         ORDER BY created_at DESC,id DESC LIMIT 8`,
        [message.conversation_id, message.cleared_at],
      );
      const context = compileVoiceChatMessages({
        structuredOutput: true,
        currentMessageId: job.message_id,
        voiceName: message.voice_name,
        ageYears: message.age_years,
        gender: message.gender,
        userAgeYears: message.user_age_years,
        relationshipType: message.relationship_type,
        relationshipLabel: message.relationship_label,
        userAddress: message.user_address,
        userLifeStage: message.user_life_stage,
        background: message.background,
        relationshipNote: message.relationship_note,
        personalityNote: message.personality_note,
        speechHabitNote: message.speech_habit_note,
        observedPersonEvidence,
        persistedPersonCorrections,
        history: historyResult.rows.reverse().map((row) => ({
          messageId: row.id,
          mode: row.mode,
          inputText: row.input_text,
          outputText: row.output_text,
          interactionState: row.interaction_state,
        })),
        currentInput: message.input_text,
      });
      personalityTurnFocus = context.personalityTurnFocus;
      let quality;
      try {
        quality = await withOneQualityRetry({
          generate: async (attempt, previousReasons) => {
            const providerResult = await this.chatProvider.reply(
              attempt === 1 ? context.messages : qualityRetryMessages(context.messages, previousReasons),
              { maxAttempts: 1, temperature: chatTemperatureForFocus(context.personalityTurnFocus) },
            );
            return typeof providerResult === 'string' ? legacyCharacterTurnGeneration(providerResult) : providerResult;
          },
          evaluate: (generation) => evaluateCharacterGenerationQuality({
            generation,
            currentUserText: message.input_text,
            relationshipType: message.relationship_type,
            subjectBackground: message.background || null,
            recentUserInputs: historyResult.rows.map((row) => row.input_text),
            recentCharacterReplies: historyResult.rows.map((row) => row.output_text).filter(Boolean),
            currentTurn: context.currentTurn,
            recentTurns: context.recentTurns,
            previousState: context.previousInteractionState,
            control: context.runtimeDialogueControl,
            personalityTurnFocus: context.personalityTurnFocus,
            profile: {
              personalityNote: message.personality_note || null,
              speechHabitNote: message.speech_habit_note || null,
              relationshipNote: message.relationship_note || null,
            },
          }),
          onRetry: (reasons) => console.info('character_generation_quality_retry', JSON.stringify({
            event: 'character_generation_quality_retry', messageId: job.message_id, attempt: 2, reasons,
          })),
        });
      } catch (error) {
        if (error instanceof GenerationQualityError) throw new ContentBlockedError(error.reasons[0] || 'GENERATION_QUALITY_REJECTED');
        throw error;
      }
      outputText = quality.outputText;
      speechTone = quality.replyTone;
      interactionState = quality.interactionState;
      console.info('character_generation_quality', JSON.stringify({
        event: 'character_generation_quality', promptVersion: 'voice-chat-human-v2', personaVersion: 'explicit-persona-v1',
        provider: this.chatProvider.providerName || 'dashscope',
        model: this.chatProvider.modelName || process.env.CHAT_MODEL || 'qwen3.8-max', parsedSuccessfully: true,
        hardRuleHits: [], softQualitySignals: quality.qualitySignals,
        interactionStateAccepted: quality.interactionStateAccepted, interactionStateResetReason: quality.interactionStateResetReason,
        interactionStateIssues: quality.interactionStateIssues,
        qualityAttemptCount: quality.attemptCount, firstAttemptReasons: quality.firstAttemptReasons,
        replyLength: Array.from(outputText).length,
      }));
    }
    const outputSafety = evaluateContentSafety(outputText);
    if (!outputSafety.safe) throw new ContentBlockedError(outputSafety.reason || 'OUTPUT_CONTENT_BLOCKED');
    if (message.mode === 'CHAT') {
      await this.database.pool.query(
        `UPDATE messages SET output_text=$1,interaction_state=$2::jsonb,updated_at=NOW()
         WHERE id=$3 AND user_id=$4 AND status='PROCESSING'`,
        [outputText, JSON.stringify(interactionState || {}), job.message_id, job.user_id],
      );
    }
    const emotionExpression = buildEmotionExpressionPlan({
      replyTone: speechTone,
      text: outputText,
      interactionState,
      personalityNote: message.personality_note,
      personalityTurnFocus,
    });
    const speechBaseline = speechPlanBaselineWithCorrections(observedPersonEvidence, message.quality_report);
    const voiceObservedBaseline = voiceObservedDeliveryBaselineWithCorrections(observedPersonEvidence, message.quality_report);
    const deliveryPlan = createVoiceDeliveryPlan(emotionExpression);
    const speechPlan = buildSpeechSynthesisPlan(
      speechTone,
      outputText,
      speechBaseline,
      emotionExpression,
      deliveryPlan,
    );
    const synthesisOptions = {
      jobId: job.id,
      messageId: job.message_id,
      instruction: speechPlan.instruction,
      ...(speechPlan.applyAcousticOverrides ? {
        rate: speechPlan.rate,
        pitch: speechPlan.pitch,
        volume: speechPlan.volume,
      } : {}),
      enableSsml: speechPlan.enableSsml,
      relationshipType: message.relationship_type,
      deliveryMode: emotionExpression.deliveryMode,
      speechAct: emotionExpression.speechAct,
      observedBaseline: voiceObservedBaseline,
      deliveryPlan,
    };
    const referencePath = this.safePath(message.reference_object_key);
    const generationSession = await this.voiceGenerationCoordinator.generate({
      mode: message.mode,
      visibleText: outputText,
      synthesisText: speechPlan.text,
      expression: emotionExpression,
      registeredBinding: providerBinding,
      resolveReference: async () => referencePath,
      options: synthesisOptions,
      allowCompanion: (provider) => this.reserveVoiceCompanionBudget(job, provider.id),
    });
    const primaryCandidate = generationSession.primary;
    const objectKey = path.join('generated', job.user_id, job.voice_profile_id, `${job.message_id}.wav`).replaceAll('\\', '/');
    const audioPath = this.safePath(objectKey);
    await fs.mkdir(path.dirname(audioPath), { recursive: true });
    try {
      await fs.writeFile(audioPath, primaryCandidate.audio);
      await embedAigcMetadata(audioPath, job.message_id);
      await this.completeGeneratedMessage({ job, outputText, audioPath, objectKey, interactionState });
      const upgrade = await generationSession.bestUpgrade;
      if (upgrade) {
          await this.upgradeReadyMessageAudio({ job, audioPath, candidate: upgrade }).catch((error) => {
            console.error('voice_quality_upgrade', JSON.stringify({
              event: 'voice_quality_upgrade', status: 'FAILED', messageId: job.message_id,
              error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
            }));
          });
      } else {
          console.info('voice_quality_upgrade', JSON.stringify({
            event: 'voice_quality_upgrade', status: 'NO_HIGHER_QUALITY_RESULT', messageId: job.message_id,
          }));
      }
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
      await this.deleteProviderBinding(decryptProviderId(model.provider_voice_id_encrypted));
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
        await this.deleteProviderBinding(decryptProviderId(model.provider_voice_id_encrypted));
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
