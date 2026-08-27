import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { consentRecords, jobs, mediaAssets, voiceProfiles } from '../db/schema.js';
import { QuotaService } from '../quota/quota.service.js';
import { MediaService } from '../media/media.service.js';
import { invokeWorkerAsync } from '../db/cloudbase-worker-invoker.js';
import { CONSENT_TEXT, CONSENT_VERSION } from './consent-text.js';

type Permission = 'SELF' | 'OTHER' | 'MINOR';
type Relationship = typeof voiceProfiles.relationshipType.enumValues[number];
type VoiceStatus = typeof voiceProfiles.status.enumValues[number];

interface VoiceRow {
  id: string;
  userId: string;
  name: string;
  permissionType: Permission | null;
  relationshipType: Relationship | null;
  relationshipLabel: string;
  userAddress: string;
  ageYears: number | null;
  gender: string | null;
  userAgeYears: number | null;
  userLifeStage: string | null;
  background: string;
  relationshipNote: string;
  status: VoiceStatus;
  clipStartMs: number | null;
  clipEndMs: number | null;
  acceptedAt: Date | string | null;
  previewPlaybackStartedAt: Date | string | null;
  previewPlayedAt: Date | string | null;
  previewRetryCount: number;
  trialQuotaRemaining: number;
  paidQuotaRemaining: number;
  failureCode: string;
  failureMessage: string;
  qualityReport: unknown;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface VoiceJobRpcResult {
  voiceId: string;
  status: VoiceStatus;
  jobId?: string;
  idempotent?: boolean;
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

  private rethrowCloud(error: unknown): never {
    const message = errorText(error);
    if (/VOICE_NOT_FOUND|voice not found/i.test(message)) throw new NotFoundException('voice not found');
    if (/PREVIEW_NOT_FOUND|preview not found/i.test(message)) throw new NotFoundException('preview not found');
    if (/SOURCE_MEDIA_NOT_FOUND|source media not found/i.test(message)) throw new NotFoundException('source media not found');
    const conflictAliases: Array<[string, string]> = [
      ['INVALID_CLIP', 'clip must be 8-20 seconds'],
      ['VOICE_NAME_REQUIRED', 'voice name is required'],
      ['VOICE_OR_PERMISSION_NOT_FOUND', 'voice not found'],
      ['INVALID_CONSENT', 'consent confirmation does not match current version'],
      ['VOICE_PROFILE_INCOMPLETE', 'voice profile and clip are incomplete'],
      ['SOURCE_VIDEO_REQUIRED', 'source video is required'],
      ['AGE_YEARS_INVALID', 'age must be 0-120'],
      ['GENDER_INVALID', 'gender is invalid'],
      ['USER_AGE_YEARS_INVALID', 'user age must be 0-120'],
      ['USER_LIFE_STAGE_INVALID', 'user life stage is invalid'],
      ['PARTNER_REQUIRES_ADULTS', 'partner relationship requires adults'],
      ['RELATIONSHIP_AGE_CONFLICT', 'relationship ages conflict'],
    ];
    const alias = conflictAliases.find(([code]) => message.includes(code));
    if (alias) {
      if (alias[0] === 'VOICE_OR_PERMISSION_NOT_FOUND') throw new NotFoundException(alias[1]);
      throw new ConflictException(alias[1]);
    }
    const knownConflict = [
      'CONSENT_REQUIRED',
      'VOICE_NOT_READY',
      'PREVIEW_NOT_PLAYED',
      'PREVIEW_RETRY_EXHAUSTED',
      'source video is required',
      'voice profile and clip are incomplete',
      'clip must be 8-20 seconds',
      'voice name is required',
      'permission type is required',
      'consent confirmation does not match current version',
    ].find((code) => message.includes(code));
    if (knownConflict) throw new ConflictException(knownConflict);
    throw error;
  }

  private async triggerJob(jobId: string | undefined, type: 'PROCESS_VOICE' | 'DELETE_VOICE') {
    if (!jobId) return;
    await invokeWorkerAsync({ jobId, type });
  }

  private async ownedVoice(userId: string, voiceId: string): Promise<VoiceRow> {
    if (this.database.isCloudBase) {
      const voice = await this.database.requireCloud().selectOne<VoiceRow>('voice_profiles', {
        filters: { id: voiceId, userId, deletedAt: null },
      });
      if (!voice) throw new NotFoundException('voice not found');
      return voice;
    }
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

  private publicVoice(voice: VoiceRow | typeof voiceProfiles.$inferSelect) {
    return {
      id: voice.id,
      name: voice.name,
      permissionType: voice.permissionType,
      relationshipType: voice.relationshipType,
      relationshipLabel: voice.relationshipLabel,
      userAddress: voice.userAddress,
      ageYears: voice.ageYears,
      gender: voice.gender,
      userAgeYears: voice.userAgeYears,
      userLifeStage: voice.userLifeStage,
      background: voice.background,
      relationshipNote: voice.relationshipNote,
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
    if (this.database.isCloudBase) {
      const [voice] = await this.database.requireCloud().insert<VoiceRow>('voice_profiles', {
        userId,
        name: name.trim().slice(0, 40),
      });
      if (!voice) throw new Error('CloudBase did not return the created voice');
      return this.publicVoice(voice);
    }
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
        url: await this.mediaService.signedUrl(preview.id, userId),
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
      url: await this.mediaService.signedUrl(preview.id, userId),
      text: process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。',
      trialEligibility: quota.trialEligibility,
      freeRetryRemaining: Math.max(0, 1 - voice.previewRetryCount),
    };
  }

  async list(userId: string, statuses: string[] = []) {
    const allowed = statuses.filter((status): status is typeof voiceProfiles.status.enumValues[number] =>
      voiceProfiles.status.enumValues.includes(status as typeof voiceProfiles.status.enumValues[number]));
    if (this.database.isCloudBase) {
      const rows = await this.database.requireCloud().select<VoiceRow>('voice_profiles', {
        filters: {
          userId,
          deletedAt: null,
          ...(allowed.length ? { status: { in: allowed } } : {}),
        },
        order: [{ column: 'updatedAt', ascending: false }],
        limit: 100,
      });
      return rows.map((voice) => this.publicVoice(voice));
    }
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
    if (this.database.isCloudBase) {
      const rows = await this.database.requireCloud().select<VoiceRow>('voice_profiles', {
        filters: { userId, status: 'READY', deletedAt: null },
        order: [
          { column: 'lastUsedAt', ascending: false },
          { column: 'updatedAt', ascending: false },
        ],
        limit: 100,
      });
      const recent = rows.filter((voice) => Boolean(voice.acceptedAt)).slice(0, 6);
      return { canCreateVoice: true, recentVoices: recent.map((voice) => this.publicVoice(voice)) };
    }
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
    const duration = endMs - startMs;
    if (duration < 8_000 || duration > 20_000) throw new ConflictException('clip must be 8-20 seconds');
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<VoiceRow | VoiceRow[]>('rpc_voice_update_clip', {
          pUserId: userId,
          pVoiceId: voiceId,
          pStartMs: startMs,
          pEndMs: endMs,
        });
        if (!firstRpcRow(result)) throw new NotFoundException('voice not found');
        return this.publicVoice(await this.ownedVoice(userId, voiceId));
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
    await this.ownedVoice(userId, voiceId);
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

  async updateProfile(userId: string, voiceId: string, input: {
    name: string;
    permissionType: Permission;
    relationshipType?: Relationship;
    relationshipLabel?: string;
    userAddress?: string;
    ageYears?: number;
    gender?: 'FEMALE' | 'MALE';
    userAgeYears?: number;
    userLifeStage?: 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT';
    background?: string;
    relationshipNote?: string;
  }) {
    const cleanName = input.name.trim().slice(0, 40);
    if (!cleanName) throw new ConflictException('voice name is required');
    const relationshipType = input.permissionType === 'SELF' ? 'SELF' : input.relationshipType ?? null;
    const relationshipLabel = relationshipType === 'OTHER' ? String(input.relationshipLabel || '').trim().slice(0, 10) : '';
    const userAddress = String(input.userAddress || '').trim().slice(0, 10);
    const ageYears = Number.isInteger(input.ageYears) ? Number(input.ageYears) : null;
    const gender = input.gender === 'FEMALE' || input.gender === 'MALE' ? input.gender : null;
    const userAgeYears = Number.isInteger(input.userAgeYears) ? Number(input.userAgeYears) : null;
    const derivedUserLifeStage = userAgeYears === null
      ? null
      : userAgeYears < 13 ? 'CHILD' : userAgeYears < 18 ? 'TEEN' : userAgeYears < 65 ? 'ADULT' : 'OLDER_ADULT';
    const userLifeStage = derivedUserLifeStage || (['CHILD', 'TEEN', 'ADULT', 'OLDER_ADULT'].includes(String(input.userLifeStage || ''))
      ? input.userLifeStage || null
      : null);
    const background = String(input.background || '').trim().slice(0, 300);
    const relationshipNote = String(input.relationshipNote || '').trim().slice(0, 300);
    if (ageYears !== null && (ageYears < 0 || ageYears > 120)) throw new ConflictException('age must be 0-120');
    if (userAgeYears !== null && (userAgeYears < 0 || userAgeYears > 120)) throw new ConflictException('user age must be 0-120');
    const userIsMinor = userAgeYears !== null
      ? userAgeYears < 18
      : userLifeStage === 'CHILD' || userLifeStage === 'TEEN';
    const parentRole = ['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER'].includes(String(relationshipType || ''));
    if (parentRole && ageYears !== null && ageYears < 18) throw new ConflictException('relationship ages conflict');
    if (parentRole && ageYears !== null && userAgeYears !== null && ageYears <= userAgeYears) throw new ConflictException('relationship ages conflict');
    if (relationshipType === 'CHILD' && userIsMinor) throw new ConflictException('relationship ages conflict');
    if (relationshipType === 'CHILD' && ageYears !== null && userAgeYears !== null && ageYears >= userAgeYears) throw new ConflictException('relationship ages conflict');
    if (relationshipType === 'PARTNER' && ((ageYears !== null && ageYears < 18) || userIsMinor)) {
      throw new ConflictException('partner relationship requires adults');
    }
    if (relationshipType === 'OTHER' && input.relationshipType && !relationshipLabel) {
      throw new ConflictException('custom relationship label is required');
    }
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<VoiceRow | VoiceRow[]>('rpc_voice_update_profile_v5', {
          pUserId: userId,
          pVoiceId: voiceId,
          pName: cleanName,
          pPermissionType: input.permissionType,
          pRelationshipType: relationshipType,
          pRelationshipLabel: relationshipLabel,
          pUserAddress: userAddress,
          pAgeYears: ageYears,
          pGender: gender,
          pUserAgeYears: userAgeYears,
          pUserLifeStage: userLifeStage,
          pBackground: background,
          pRelationshipNote: relationshipNote,
        });
        if (!firstRpcRow(result)) throw new NotFoundException('voice not found');
        const voice = await this.ownedVoice(userId, voiceId);
        return { ...this.publicVoice(voice), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT[input.permissionType] };
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
    await this.ownedVoice(userId, voiceId);
    const [voice] = await this.database.db.update(voiceProfiles).set({
      name: cleanName,
      permissionType: input.permissionType,
      relationshipType,
      relationshipLabel,
      userAddress,
      ageYears,
      gender,
      userAgeYears,
      userLifeStage,
      background,
      relationshipNote,
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return { ...this.publicVoice(voice), consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT[input.permissionType] };
  }

  async confirmConsent(userId: string, voiceId: string, input: { version: string; text: string; confirmed: boolean }) {
    const voice = await this.ownedVoice(userId, voiceId);
    if (!voice.permissionType) throw new ConflictException('permission type is required');
    const expected = CONSENT_TEXT[voice.permissionType];
    if (!input.confirmed || input.version !== CONSENT_VERSION || input.text !== expected) {
      throw new ConflictException('consent confirmation does not match current version');
    }
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<{
          id: string;
          consentVersion: string;
          confirmedAt: string | Date;
        } | Array<{
          id: string;
          consentVersion: string;
          confirmedAt: string | Date;
        }>>('rpc_voice_confirm_consent', {
          pUserId: userId,
          pVoiceId: voiceId,
          pPermissionType: voice.permissionType,
          pConsentVersion: CONSENT_VERSION,
          pConsentTextHash: createHash('sha256').update(expected).digest('hex'),
        });
        const record = firstRpcRow(result);
        if (!record) throw new Error('CloudBase did not return the consent record');
        return { id: record.id, consentVersion: record.consentVersion, confirmedAt: record.confirmedAt };
      } catch (error) {
        this.rethrowCloud(error);
      }
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
    if (this.database.isCloudBase) {
      try {
        const voice = await this.ownedVoice(userId, voiceId);
        if (!voice.permissionType) throw new ConflictException('voice profile and clip are incomplete');
        const result = await this.database.requireCloud().rpc<VoiceJobRpcResult>('rpc_voice_queue_processing', {
          pUserId: userId,
          pVoiceId: voiceId,
          pConsentVersion: CONSENT_VERSION,
          pConsentTextHash: createHash('sha256').update(CONSENT_TEXT[voice.permissionType]).digest('hex'),
        });
        await this.triggerJob(result.jobId, 'PROCESS_VOICE');
        return this.get(userId, voiceId);
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
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
    if (this.database.isCloudBase) {
      try {
        const accepted = await this.database.requireCloud().rpc<{
          quota: {
            trialQuotaRemaining: number;
            paidQuotaRemaining: number;
            availableQuota: number;
            trialEligibility: 'ELIGIBLE' | 'GRANTED' | 'USED';
          };
        }>('rpc_voice_accept_preview', {
          pUserId: userId,
          pVoiceId: voiceId,
        });
        const quota = accepted.quota;
        const voice = await this.get(userId, voiceId);
        return { ...quota, quota, voice, trialGranted: quota.trialQuotaRemaining > 0 };
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
    const quota = await this.quotaService.acceptPreview(userId, voiceId);
    const voice = await this.get(userId, voiceId);
    return { ...quota, quota, voice, trialGranted: quota.trialQuotaRemaining > 0 };
  }

  async markPreviewPlayed(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<
          { previewPlayedAt: string | Date } | Array<{ previewPlayedAt: string | Date }>
        >('rpc_voice_mark_preview_played', {
          pUserId: userId,
          pVoiceId: voiceId,
          pMinElapsedMs: 0,
        });
        const updated = firstRpcRow(result);
        return { previewPlayedAt: updated.previewPlayedAt };
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
    const voice = await this.ownedVoice(userId, voiceId);
    if (voice.status !== 'READY') throw new ConflictException('VOICE_NOT_READY');
    const preview = await this.mediaService.latestAsset(voiceId, 'PREVIEW_AUDIO');
    if (!preview?.durationMs || !voice.previewPlaybackStartedAt) {
      throw new ConflictException('PREVIEW_NOT_PLAYED');
    }
    const elapsedMs = Date.now() - new Date(voice.previewPlaybackStartedAt).getTime();
    if (elapsedMs < Math.max(0, preview.durationMs - 750)) {
      throw new ConflictException('PREVIEW_NOT_PLAYED');
    }
    const [updated] = await this.database.db.update(voiceProfiles).set({
      previewPlayedAt: voice.previewPlayedAt ? new Date(voice.previewPlayedAt) : new Date(),
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return { previewPlayedAt: updated.previewPlayedAt };
  }

  async markPreviewStarted(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<
          { previewPlaybackStartedAt: string | Date } | Array<{ previewPlaybackStartedAt: string | Date }>
        >('rpc_voice_mark_preview_started', {
          pUserId: userId,
          pVoiceId: voiceId,
        });
        const updated = firstRpcRow(result);
        return { previewPlaybackStartedAt: updated.previewPlaybackStartedAt };
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
    const voice = await this.ownedVoice(userId, voiceId);
    if (voice.status !== 'READY') throw new ConflictException('VOICE_NOT_READY');
    const preview = await this.mediaService.latestAsset(voiceId, 'PREVIEW_AUDIO');
    if (!preview) throw new NotFoundException('preview not found');
    const [updated] = await this.database.db.update(voiceProfiles).set({
      previewPlaybackStartedAt: voice.previewPlaybackStartedAt ? new Date(voice.previewPlaybackStartedAt) : new Date(),
      updatedAt: new Date(),
    }).where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId))).returning();
    return { previewPlaybackStartedAt: updated.previewPlaybackStartedAt };
  }

  async retryPreview(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<VoiceJobRpcResult>('rpc_voice_retry_preview', {
          pUserId: userId,
          pVoiceId: voiceId,
        });
        await this.triggerJob(result.jobId, 'PROCESS_VOICE');
        return this.get(userId, voiceId);
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
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
    if (this.database.isCloudBase) {
      try {
        const result = await this.database.requireCloud().rpc<
          (VoiceJobRpcResult & { status: 'DELETING' }) | Array<VoiceJobRpcResult & { status: 'DELETING' }>
        >('rpc_voice_delete_request', {
          pUserId: userId,
          pVoiceId: voiceId,
        });
        const deleted = firstRpcRow(result);
        await this.triggerJob(deleted?.jobId, 'DELETE_VOICE');
        return { status: deleted?.status || 'DELETING' };
      } catch (error) {
        this.rethrowCloud(error);
      }
    }
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
