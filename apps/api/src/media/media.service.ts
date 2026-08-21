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
    const voice = await this.database.db.query.voiceProfiles.findFirst({
      where: and(eq(voiceProfiles.id, voiceId), eq(voiceProfiles.userId, userId), isNull(voiceProfiles.deletedAt)),
    });
    if (!voice) throw new NotFoundException('voice not found');
    return voice;
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
    if (!streamTypes.has('video') || !streamTypes.has('audio') || durationMs < 12_000 || durationMs > 60_000) {
      throw new ConflictException('video must contain audio and be 12-60 seconds');
    }
    return { durationMs };
  }

  private async sha256(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  async uploadPolicy(userId: string, voiceId: string) {
    await this.ownedVoice(userId, voiceId);
    const base = String(process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
    return {
      mode: 'server-upload',
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

  async confirmSourceMedia(userId: string, voiceId: string, mediaId: string) {
    await this.ownedVoice(userId, voiceId);
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
    const asset = await this.database.db.query.mediaAssets.findFirst({
      where: and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId), eq(mediaAssets.status, 'READY')),
    });
    if (!asset) throw new NotFoundException('media not found');
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
