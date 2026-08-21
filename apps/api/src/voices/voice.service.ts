import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { consentRecords, jobs, mediaAssets, voiceProfiles } from '../db/schema.js';
import { QuotaService } from '../quota/quota.service.js';
import { MediaService } from '../media/media.service.js';
import { CONSENT_TEXT, CONSENT_VERSION } from './consent-text.js';

@Injectable()
export class VoiceService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
  ) {}

  private async ownedVoice(userId: string, voiceId: string) {
    const voice = await this.database.db.query.voiceProfiles.findFirst({
      where: and(
        eq(voiceProfiles.id, voiceId),
        eq(voiceProfiles.userId, userId),
        isNull(voiceProfiles.deletedAt),
      ),
    });
    if (!voice) throw new NotFoundException('voice not found');
    return voice;
  }

  private publicVoice(voice: typeof voiceProfiles.$inferSelect) {
    return {
      id: voice.id,
      name: voice.name,
      permissionType: voice.permissionType,
      status: voice.status,
      clipStartMs: voice.clipStartMs,
      clipEndMs: voice.clipEndMs,
      acceptedAt: voice.acceptedAt,
      previewPlaybackStartedAt: voice.previewPlaybackStartedAt,
      previewPlayedAt: voice.previewPlayedAt,
      previewRetryCount: voice.previewRetryCount,
      trialQuotaRemaining: voice.trialQuotaRemaining,
      paidQuotaRemaining: voice.paidQuotaRemaining,
      availableQuota: voice.trialQuotaRemaining + voice.paidQuotaRemaining,
      failureCode: voice.failureCode,
      failureMessage: voice.failureMessage,
      qualityReport: voice.qualityReport,
      lastUsedAt: voice.lastUsedAt,
      createdAt: voice.createdAt,
      updatedAt: voice.updatedAt,
    };
  }

  async createDraft(userId: string, name = '') {
    const [voice] = await this.database.db.insert(voiceProfiles).values({
      userId,
      name: name.trim().slice(0, 40),
    }).returning();
    return this.publicVoice(voice);
  }

  async get(userId: string, voiceId: string) {
    const voice = await this.ownedVoice(userId, voiceId);
    const preview = await this.mediaService.latestAsset(voiceId, 'PREVIEW_AUDIO');
    const quota = await this.quotaService.getQuota(userId, voiceId);
    return {
      ...this.publicVoice(voice),
      quota,
      preview: preview ? {
        mediaId: preview.id,
        durationMs: preview.durationMs,
        url: this.mediaService.signedUrl(preview.id, userId),
      } : null,
    };
  }

  async preview(userId: string, voiceId: string) {
    const voice = await this.ownedVoice(userId, voiceId);
    const preview = await this.mediaService.latestAsset(voiceId, 'PREVIEW_AUDIO');
    if (!preview) throw new NotFoundException('preview not found');
    const quota = await this.quotaService.getQuota(userId, voiceId);
    return {
      mediaId: preview.id,
      durationMs: preview.durationMs,
      url: this.mediaService.signedUrl(preview.id, userId),
      text: process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。',
      trialEligibility: quota.trialEligibility,
      freeRetryRemaining: Math.max(0, 1 - voice.previewRetryCount),
    };
  }

  async list(userId: string, statuses: string[] = []) {
    const allowed = statuses.filter((status): status is typeof voiceProfiles.status.enumValues[number] =>
      voiceProfiles.status.enumValues.includes(status as typeof voiceProfiles.status.enumValues[number]));
    const where = allowed.length
      ? and(eq(voiceProfiles.userId, userId), inArray(voiceProfiles.status, allowed), isNull(voiceProfiles.deletedAt))
      : and(eq(voiceProfiles.userId, userId), isNull(voiceProfiles.deletedAt));
    const rows = await this.database.db.query.voiceProfiles.findMany({
      where,
      orderBy: [desc(voiceProfiles.updatedAt)],
      limit: 100,
    });
    return rows.map((voice) => this.publicVoice(voice));
  }

  async home(userId: string) {
    const recent = await this.database.db.query.voiceProfiles.findMany({
      where: and(
        eq(voiceProfiles.userId, userId),
        eq(voiceProfiles.status, 'READY'),
        isNotNull(voiceProfiles.acceptedAt),
        isNull(voiceProfiles.deletedAt),
      ),
      orderBy: [desc(voiceProfiles.lastUsedAt), desc(voiceProfiles.updatedAt)],
      limit: 6,
    });
    return { canCreateVoice: true, recentVoices: recent.map((voice) => this.publicVoice(voice)) };
  }

  async updateClip(userId: string, voiceId: string, startMs: number, endMs: number) {
    await this.ownedVoice(userId, voiceId);
    const duration = endMs - startMs;
    if (duration < 10_000 || duration > 30_000) throw new ConflictException('clip must be 10-30 seconds');
    const [voice] = await this.database.db.update(voiceProfiles).set({
      clipStartMs: startMs,
      clipEndMs: endMs,
      status: 'DRAFT',
      failureCode: '',
      failureMessage: '',
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return this.publicVoice(voice);
  }

  async updateProfile(userId: string, voiceId: string, name: string, permission: 'SELF' | 'OTHER' | 'MINOR') {
    await this.ownedVoice(userId, voiceId);
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName) throw new ConflictException('voice name is required');
    const [voice] = await this.database.db.update(voiceProfiles).set({
      name: cleanName,
      permissionType: permission,
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return { ...this.publicVoice(voice), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT[permission] };
  }

  async confirmConsent(userId: string, voiceId: string, input: { version: string; text: string; confirmed: boolean }) {
    const voice = await this.ownedVoice(userId, voiceId);
    if (!voice.permissionType) throw new ConflictException('permission type is required');
    const expected = CONSENT_TEXT[voice.permissionType];
    if (!input.confirmed || input.version !== CONSENT_VERSION || input.text !== expected) {
      throw new ConflictException('consent confirmation does not match current version');
    }
    const [record] = await this.database.db.insert(consentRecords).values({
      voiceProfileId: voiceId,
      permissionType: voice.permissionType,
      consentVersion: CONSENT_VERSION,
      consentTextHash: createHash('sha256').update(expected).digest('hex'),
      confirmedAt: new Date(),
    }).returning();
    return { id: record.id, consentVersion: record.consentVersion, confirmedAt: record.confirmedAt };
  }

  async process(userId: string, voiceId: string) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await client.query<{
        id: string;
        name: string;
        permission_type: string | null;
        clip_start_ms: number | null;
        clip_end_ms: number | null;
        status: string;
      }>(
        `SELECT id, name, permission_type, clip_start_ms, clip_end_ms, status
         FROM voice_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [voiceId, userId],
      );
      const voice = result.rows[0];
      if (!voice) throw new NotFoundException('voice not found');
      if (['QUEUED', 'PROCESSING'].includes(voice.status)) {
        await client.query('COMMIT');
        return this.get(userId, voiceId);
      }
      if (!voice.name || !voice.permission_type || voice.clip_start_ms === null || voice.clip_end_ms === null) {
        throw new ConflictException('voice profile and clip are incomplete');
      }
      const expectedConsent = CONSENT_TEXT[voice.permission_type as keyof typeof CONSENT_TEXT];
      const expectedConsentHash = createHash('sha256').update(expectedConsent).digest('hex');
      const consent = await client.query(
        `SELECT id FROM consent_records
         WHERE voice_profile_id = $1 AND consent_version = $2 AND consent_text_hash = $3
         ORDER BY confirmed_at DESC LIMIT 1`,
        [voiceId, CONSENT_VERSION, expectedConsentHash],
      );
      if (!consent.rowCount) throw new ConflictException('CONSENT_REQUIRED');
      const media = await client.query(
        `SELECT id FROM media_assets WHERE voice_profile_id = $1 AND kind = 'SOURCE_VIDEO' AND status = 'READY' LIMIT 1`,
        [voiceId],
      );
      if (!media.rowCount) throw new ConflictException('source video is required');
      await client.query(
        `UPDATE voice_profiles SET status = 'QUEUED', preview_playback_started_at = NULL,
         preview_played_at = NULL, accepted_at = NULL, updated_at = NOW() WHERE id = $1`,
        [voiceId],
      );
      await client.query(
        `INSERT INTO jobs (id, user_id, voice_profile_id, type, status, dedupe_key, payload, attempts, max_attempts, available_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'PROCESS_VOICE', 'QUEUED', $4, $5::jsonb, 0, 3, NOW(), NOW(), NOW())
         ON CONFLICT (dedupe_key) DO UPDATE
         SET status='QUEUED', payload=EXCLUDED.payload, attempts=0, available_at=NOW(),
             leased_until=NULL, error_code='', error_message='', finished_at=NULL, updated_at=NOW()
         WHERE jobs.status IN ('FAILED','SUCCEEDED','CANCELLED')`,
        [randomUUID(), userId, voiceId, `process-voice:${voiceId}`, JSON.stringify({ voiceId })],
      );
      await client.query('COMMIT');
      return this.get(userId, voiceId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptPreview(userId: string, voiceId: string) {
    const quota = await this.quotaService.acceptPreview(userId, voiceId);
    const voice = await this.get(userId, voiceId);
    return { ...quota, quota, voice, trialGranted: quota.trialQuotaRemaining > 0 };
  }

  async markPreviewPlayed(userId: string, voiceId: string) {
    const voice = await this.ownedVoice(userId, voiceId);
    if (voice.status !== 'READY') throw new ConflictException('VOICE_NOT_READY');
    const preview = await this.mediaService.latestAsset(voiceId, 'PREVIEW_AUDIO');
    if (!preview?.durationMs || !voice.previewPlaybackStartedAt) {
      throw new ConflictException('PREVIEW_NOT_PLAYED');
    }
    const elapsedMs = Date.now() - voice.previewPlaybackStartedAt.getTime();
    if (elapsedMs < Math.max(0, preview.durationMs - 750)) {
      throw new ConflictException('PREVIEW_NOT_PLAYED');
    }
    const [updated] = await this.database.db.update(voiceProfiles).set({
      previewPlayedAt: voice.previewPlayedAt || new Date(),
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return { previewPlayedAt: updated.previewPlayedAt };
  }

  async retryPreview(userId: string, voiceId: string) {
    const voice = await this.ownedVoice(userId, voiceId);
    if (voice.status !== 'READY') throw new ConflictException('VOICE_NOT_READY');
    if (voice.previewRetryCount >= 1) throw new ConflictException('PREVIEW_RETRY_EXHAUSTED');
    await this.database.db.update(voiceProfiles).set({
      status: 'DRAFT',
      acceptedAt: null,
      previewPlaybackStartedAt: null,
      previewPlayedAt: null,
      previewRetryCount: voice.previewRetryCount + 1,
      failureCode: '',
      failureMessage: '',
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)));
    return this.get(userId, voiceId);
  }

  async deleteVoice(userId: string, voiceId: string) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ status: string }>(
        `SELECT status FROM voice_profiles WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [voiceId, userId],
      );
      const voice = result.rows[0];
      if (!voice) throw new NotFoundException('voice not found');
      if (voice.status === 'DELETING') {
        await client.query('COMMIT');
        return { status: 'DELETING' };
      }
      await client.query(`UPDATE voice_profiles SET status='DELETING',updated_at=NOW() WHERE id=$1`, [voiceId]);
      await client.query(
        `INSERT INTO jobs
         (id,user_id,voice_profile_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at,created_at,updated_at)
         VALUES ($1,$2,$3,'DELETE_VOICE','QUEUED',$4,$5::jsonb,0,5,NOW(),NOW(),NOW())
         ON CONFLICT (dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,available_at=NOW(),error_code='',error_message='',finished_at=NULL,updated_at=NOW()
         WHERE jobs.status IN ('FAILED','SUCCEEDED','CANCELLED')`,
        [randomUUID(), userId, voiceId, `delete-voice:${voiceId}`, JSON.stringify({ voiceId })],
      );
      await client.query('COMMIT');
      return { status: 'DELETING' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
