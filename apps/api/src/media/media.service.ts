import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { mediaAssets, voiceProfiles } from '../db/schema.js';

const execFileAsync = promisify(execFile);

interface ProbeResult {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string }>;
}

interface UploadPolicyInput {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface ConfirmSourceInput extends UploadPolicyInput {
  objectKey?: string;
  mediaId?: string;
  durationMs?: number;
}

interface MediaAssetRow {
  id: string;
  userId: string;
  voiceProfileId: string | null;
  kind: 'SOURCE_VIDEO' | 'REFERENCE_AUDIO' | 'PREVIEW_AUDIO' | 'GENERATED_AUDIO';
  status: 'PENDING' | 'READY' | 'DELETED';
  objectKey: string;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
}

@Injectable()
export class MediaService {
  readonly root = path.resolve(process.env.MEDIA_LOCAL_ROOT || './.runtime/media');

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private signingSecret(): string {
    const secret = process.env.MEDIA_SIGNING_SECRET || '';
    if (!secret && process.env.NODE_ENV === 'production') throw new Error('MEDIA_SIGNING_SECRET is required');
    return secret || 'aivoice-local-media-secret';
  }

  private async ownedVoice(userId: string, voiceId: string) {
    if (this.database.isCloudBase) {
      const voice = await this.database.requireCloud().selectOne<Record<string, unknown>>('voice_profiles', {
        filters: { id: voiceId, userId, deletedAt: null },
      });
      if (!voice) throw new NotFoundException('voice not found');
      return voice;
    }
    const voice = await this.database.db.query.voiceProfiles.findFirst({
      where: and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId), isNull(voiceProfiles.deletedAt)),
    });
    if (!voice) throw new NotFoundException('voice not found');
    return voice;
  }

  private storageBucket(): string {
    const bucket = String(
      process.env.CLOUDBASE_SOURCE_BUCKET || process.env.CLOUDBASE_PG_STORAGE_BUCKET || '',
    ).trim();
    if (!bucket) throw new Error('CLOUDBASE_SOURCE_BUCKET is required for CloudBase media storage');
    return bucket;
  }

  private audioBucket(): string {
    const bucket = String(process.env.CLOUDBASE_AUDIO_BUCKET || '').trim();
    if (!bucket && process.env.NODE_ENV === 'production') {
      throw new Error('CLOUDBASE_AUDIO_BUCKET is required for CloudBase media storage');
    }
    return bucket || 'aivoice-audio';
  }

  private validateVideoMetadata(input: UploadPolicyInput): { mimeType: string; sizeBytes: number } {
    const mimeType = String(input.mimeType || '').trim().toLowerCase();
    const sizeBytes = Number(input.sizeBytes || 0);
    if (!mimeType.startsWith('video/') || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 100 * 1024 * 1024) {
      throw new ConflictException('INVALID_MEDIA');
    }
    return { mimeType, sizeBytes };
  }

  private sourceExtension(fileName = '', mimeType = ''): string {
    const supplied = path.extname(fileName).toLowerCase();
    if (/^\.(mp4|mov|m4v|webm)$/.test(supplied)) return supplied;
    if (mimeType === 'video/quicktime') return '.mov';
    if (mimeType === 'video/webm') return '.webm';
    return '.mp4';
  }

  private async probe(filePath: string): Promise<{ durationMs: number }> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type',
        '-of', 'json',
        filePath,
      ], { timeout: 20_000, encoding: 'utf8' }));
    } catch {
      throw new ConflictException('INVALID_MEDIA');
    }
    const data = JSON.parse(stdout) as ProbeResult;
    const durationMs = Math.round(Number(data.format?.duration || 0) * 1000);
    const streamTypes = new Set((data.streams || []).map((stream) => stream.codec_type));
    if (!streamTypes.has('video') || !streamTypes.has('audio') || durationMs < 8_000 || durationMs > 60_000) {
      throw new ConflictException('video must contain audio and be 8-60 seconds');
    }
    return { durationMs };
  }

  private async sha256(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  async uploadPolicy(userId: string, voiceId: string, input: UploadPolicyInput = {}) {
    await this.ownedVoice(userId, voiceId);
    if (this.database.isCloudBase) {
      const { mimeType } = this.validateVideoMetadata(input);
      const mediaId = randomUUID();
      const objectKey = `source/${userId}/${voiceId}/${mediaId}${this.sourceExtension(input.fileName, mimeType)}`;
      const signed = await this.database.requireCloud().signUpload(this.storageBucket(), objectKey, false);
      const uploadUrl = new URL(signed.uploadUrl);
      uploadUrl.searchParams.set('token', signed.token);
      return {
        mode: 'signed-put',
        uploadMethod: 'PUT',
        uploadUrl: uploadUrl.toString(),
        headers: { 'Content-Type': mimeType },
        objectKey,
        mediaId,
        maxBytes: 100 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
    }
    const base = String(process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
    return {
      mode: 'server-upload',
      uploadMethod: 'POST',
      uploadUrl: `${base}/v1/voices/${voiceId}/media-upload`,
      fieldName: 'file',
      maxBytes: 100 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }

  async registerSourceVideo(userId: string, voiceId: string, file: Express.Multer.File) {
    await this.ownedVoice(userId, voiceId);
    if (!file || file.size <= 0 || file.size > 100 * 1024 * 1024 || !file.mimetype.startsWith('video/')) {
      if (file?.path) await fs.unlink(file.path).catch(() => undefined);
      throw new ConflictException('INVALID_MEDIA');
    }
    let target = '';
    try {
      const { durationMs } = await this.probe(file.path);
      const hash = await this.sha256(file.path);
      const extension = path.extname(file.originalname || '') || '.mp4';
      const relative = path.join('source', userId, voiceId, `${randomUUID()}${extension}`);
      target = path.join(this.root, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(file.path, target);
      const [asset] = await this.database.db.insert(mediaAssets).values({
        userId,
        voiceProfileId: voiceId,
        kind: 'SOURCE_VIDEO',
        status: 'READY',
        objectKey: relative.replaceAll('\\', '/'),
        mimeType: file.mimetype,
        bytes: file.size,
        durationMs,
        sha256: hash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      }).returning();
      await this.database.db.update(voiceProfiles).set({ status: 'DRAFT', updatedAt: new Date() })
        .where(and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId)));
      return { mediaId: asset.id, durationMs, bytes: asset.bytes, mimeType: asset.mimeType };
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      if (target) await fs.unlink(target).catch(() => undefined);
      throw error;
    }
  }

  async confirmSourceMedia(userId: string, voiceId: string, input: ConfirmSourceInput | string) {
    await this.ownedVoice(userId, voiceId);
    if (this.database.isCloudBase) {
      const metadata = typeof input === 'string' ? { mediaId: input } : input;
      const { mimeType: declaredMimeType, sizeBytes: declaredBytes } = this.validateVideoMetadata(metadata);
      const objectKey = String(metadata.objectKey || '');
      const expectedPrefix = `source/${userId}/${voiceId}/`;
      if (!objectKey.startsWith(expectedPrefix) || objectKey.includes('..') || objectKey.length <= expectedPrefix.length) {
        throw new UnauthorizedException('invalid source object key');
      }
      const durationMs = Number(metadata.durationMs || 0);
      if (!Number.isInteger(durationMs) || durationMs < 8_000 || durationMs > 60_000) {
        throw new ConflictException('video must contain audio and be 8-60 seconds');
      }
      let object: Awaited<ReturnType<ReturnType<DatabaseService['requireCloud']>['objectInfo']>>;
      try {
        object = await this.database.requireCloud().objectInfo(this.storageBucket(), objectKey);
      } catch {
        throw new NotFoundException('uploaded source media not found');
      }
      const actualBytes = Number(object.size || 0);
      const actualMimeType = String(object.contentType || '').split(';')[0].trim().toLowerCase();
      if (!Number.isInteger(actualBytes) || actualBytes <= 0 || actualBytes > 100 * 1024 * 1024 ||
          actualBytes !== declaredBytes || !actualMimeType.startsWith('video/') || actualMimeType !== declaredMimeType) {
        throw new ConflictException('uploaded media metadata mismatch');
      }
      const objectFingerprint = createHash('sha256')
        .update(`${this.storageBucket()}\n${objectKey}\n${actualBytes}\n${object.etag || ''}`)
        .digest('hex');
      const raw = await this.database.requireCloud().rpc<Record<string, unknown> | Array<Record<string, unknown>>>(
        'rpc_voice_confirm_source_upload',
        {
          pUserId: userId,
          pVoiceId: voiceId,
          pObjectKey: objectKey,
          pMimeType: actualMimeType,
          pBytes: actualBytes,
          pDurationMs: durationMs,
          pSha256: objectFingerprint,
        },
      );
      const result = Array.isArray(raw) ? raw[0] || {} : raw;
      return {
        voiceId,
        mediaId: String(result.mediaId || metadata.mediaId || ''),
        status: 'DRAFT',
        sourceDurationMs: durationMs,
        confirmed: true,
      };
    }
    const mediaId = typeof input === 'string' ? input : String(input.mediaId || '');
    const asset = await this.database.db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.id, mediaId),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.voiceProfileId, voiceId),
        eq(mediaAssets.kind, 'SOURCE_VIDEO'),
        eq(mediaAssets.status, 'READY'),
      ),
    });
    if (!asset) throw new NotFoundException('source media not found');
    return { voiceId, mediaId: asset.id, confirmed: true };
  }

  async latestAsset(voiceId: string, kind: 'PREVIEW_AUDIO' | 'GENERATED_AUDIO') {
    if (this.database.isCloudBase) {
      return this.database.requireCloud().selectOne<MediaAssetRow>('media_assets', {
        filters: { voiceProfileId: voiceId, kind, status: 'READY' },
        order: [{ column: 'createdAt', ascending: false }],
      });
    }
    return this.database.db.query.mediaAssets.findFirst({
      where: and(eq(mediaAssets.voiceProfileId, voiceId), eq(mediaAssets.kind, kind), eq(mediaAssets.status, 'READY')),
      orderBy: [desc(mediaAssets.createdAt)],
    });
  }

  signedUrl(mediaId: string, userId: string, ttlSeconds = 600): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${mediaId}.${userId}.${exp}`;
    const sig = createHmac('sha256', this.signingSecret()).update(payload).digest('base64url');
    const base = String(process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
    return `${base}/v1/media/${mediaId}/play?userId=${encodeURIComponent(userId)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
  }

  async resolveSigned(mediaId: string, userId: string, exp: number, sig: string) {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException('media URL expired');
    const expected = createHmac('sha256', this.signingSecret()).update(`${mediaId}.${userId}.${exp}`).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, 'base64url');
    } catch {
      throw new UnauthorizedException('invalid media signature');
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('invalid media signature');
    }
    const asset = this.database.isCloudBase
      ? await this.database.requireCloud().selectOne<MediaAssetRow>('media_assets', {
        filters: { id: mediaId, userId, status: 'READY' },
      })
      : await this.database.db.query.mediaAssets.findFirst({
        where: and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId), eq(mediaAssets.status, 'READY')),
      });
    if (!asset) throw new NotFoundException('media not found');
    if (this.database.isCloudBase) {
      if (asset.kind === 'PREVIEW_AUDIO' && asset.voiceProfileId) {
        const voice = await this.database.requireCloud().selectOne<{ previewPlaybackStartedAt: string | null }>('voice_profiles', {
          select: 'preview_playback_started_at',
          filters: { id: asset.voiceProfileId, userId, status: 'READY', deletedAt: null },
        });
        if (voice && !voice.previewPlaybackStartedAt) {
          await this.database.requireCloud().update('voice_profiles', {
            previewPlaybackStartedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { filters: { id: asset.voiceProfileId, userId, status: 'READY', deletedAt: null } });
        }
      }
      return {
        redirectUrl: await this.database.requireCloud().signDownload(
          asset.kind === 'SOURCE_VIDEO' ? this.storageBucket() : this.audioBucket(),
          asset.objectKey,
          600,
        ),
        mimeType: asset.mimeType,
        bytes: asset.bytes,
      };
    }
    const filePath = path.resolve(this.root, asset.objectKey);
    if (!filePath.startsWith(this.root + path.sep)) throw new UnauthorizedException('invalid media path');
    await fs.access(filePath);
    if (asset.kind === 'PREVIEW_AUDIO' && asset.voiceProfileId) {
      await this.database.pool.query(
        `UPDATE voice_profiles SET preview_playback_started_at=COALESCE(preview_playback_started_at,NOW()), updated_at=NOW()
         WHERE id=$1 AND user_id=$2 AND status='READY' AND deleted_at IS NULL`,
        [asset.voiceProfileId, userId],
      );
    }
    return { filePath, mimeType: asset.mimeType, bytes: asset.bytes };
  }
}
