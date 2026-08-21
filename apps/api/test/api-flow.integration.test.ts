import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import test from 'node:test';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/db/database.service.js';
import { mediaAssets, voiceProfiles } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { QuotaService } from '../src/quota/quota.service.js';

const execFileAsync = promisify(execFile);
const hasDatabase = Boolean(process.env.DATABASE_URL);

async function createVideo(filePath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=12',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', filePath,
  ], { timeout: 30_000 });
}

test('HTTP flow keeps the server authoritative from login through quota exhaustion', { skip: !hasDatabase }, async () => {
  process.env.WECHAT_MOCK_LOGIN = 'true';
  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:8787';
  process.env.MEDIA_SIGNING_SECRET = 'http-flow-media-secret';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const database = app.get(DatabaseService);
  const quota = app.get(QuotaService);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-api-flow-'));
  const videoPath = path.join(tempDir, 'authorized.mp4');
  try {
    await database.pool.query(
      'TRUNCATE quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    await createVideo(videoPath);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/wechat')
      .send({ code: 'mock:owner-openid', profile: { nickname: 'Owner' } })
      .expect(201);
    const token = login.body.token as string;
    assert.ok(token);
    const auth = { Authorization: `Bearer ${token}` };
    const me = await request(app.getHttpServer()).get('/v1/me').set(auth).expect(200);
    assert.equal(me.body.voiceCount, 0);
    assert.equal(me.body.trialEligibility, 'ELIGIBLE');
    const updatedProfile = await request(app.getHttpServer())
      .patch('/v1/me/profile').set(auth).send({ nickname: '新昵称' }).expect(200);
    assert.equal(updatedProfile.body.user.nickname, '新昵称');

    const created = await request(app.getHttpServer())
      .post('/v1/voices').set(auth).send({ name: '' }).expect(201);
    const voiceId = created.body.id as string;
    const upload = await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/media-upload`)
      .set(auth)
      .attach('file', videoPath, { contentType: 'video/mp4' })
      .expect(201);
    assert.equal(upload.body.durationMs, 12_000);

    await request(app.getHttpServer())
      .put(`/v1/voices/${voiceId}/clip`).set(auth).send({ startMs: 0, endMs: 10_000 }).expect(200);
    const profile = await request(app.getHttpServer())
      .put(`/v1/voices/${voiceId}/profile`).set(auth)
      .send({ name: '家人的声音', permissionType: 'OTHER' }).expect(200);
    assert.match(profile.body.consentText, /明确同意/);
    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/consents`).set(auth)
      .send({ consentVersion: profile.body.consentVersion, consentText: profile.body.consentText, confirmed: true })
      .expect(201);
    await request(app.getHttpServer()).post(`/v1/voices/${voiceId}/process`).set(auth).send({}).expect(201);

    await database.db.update(voiceProfiles).set({
      status: 'READY',
      previewPlaybackStartedAt: new Date(),
      updatedAt: new Date(),
    })
      .where(eq(voiceProfiles.id, voiceId));
    await database.db.insert(mediaAssets).values({
      userId: login.body.user.id,
      voiceProfileId: voiceId,
      kind: 'PREVIEW_AUDIO',
      status: 'READY',
      objectKey: `preview/${voiceId}.wav`,
      mimeType: 'audio/wav',
      bytes: 1,
      durationMs: 3_000,
      sha256: 'test-preview-sha256',
    });
    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/accept-preview`).set(auth).send({}).expect(409);
    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/preview-played`).set(auth).send({}).expect(409);
    await database.db.update(voiceProfiles).set({ previewPlaybackStartedAt: new Date(Date.now() - 4_000) })
      .where(eq(voiceProfiles.id, voiceId));
    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/preview-played`).set(auth).send({}).expect(201);
    const accepted = await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/accept-preview`).set(auth).send({}).expect(201);
    assert.equal(accepted.body.trialQuotaRemaining, 1);
    const ledgers = await request(app.getHttpServer()).get('/v1/quota-ledgers').set(auth).expect(200);
    assert.equal(ledgers.body.ledgers[0].type, 'TRIAL_GRANT');

    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/exact-speech`)
      .set(auth).set('Idempotency-Key', 'http-flow-too-long')
      .send({ text: '这是一段超过五十个字符的测试文本，用于确认说一句模式会在服务端严格拒绝过长输入，而不是依赖客户端自己限制长度，避免绕过产品约束。' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/exact-speech`)
      .set(auth).set('Idempotency-Key', 'http-flow-blocked')
      .send({ text: '我是银行客服，请立即转账。' })
      .expect(422);

    const generated = await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/exact-speech`)
      .set(auth).set('Idempotency-Key', 'http-flow-message-1')
      .send({ text: '请照顾好自己。' }).expect(201);
    await quota.completeMessage({
      userId: login.body.user.id,
      voiceId,
      messageId: generated.body.messageId,
      outputText: '请照顾好自己。',
    });
    const ready = await request(app.getHttpServer())
      .get(`/v1/messages/${generated.body.messageId}`).set(auth).expect(200);
    assert.equal(ready.body.status, 'READY');

    const exhausted = await request(app.getHttpServer())
      .post(`/v1/voices/${voiceId}/exact-speech`)
      .set(auth).set('Idempotency-Key', 'http-flow-message-2')
      .send({ text: '下一次才出现购买框。' }).expect(402);
    assert.equal(exhausted.body.code, 'QUOTA_EXHAUSTED');
    assert.equal(exhausted.body.purchaseOption.amountFen, 990);

    const otherLogin = await request(app.getHttpServer())
      .post('/v1/auth/wechat').send({ code: 'mock:other-openid' }).expect(201);
    await request(app.getHttpServer())
      .get(`/v1/voices/${voiceId}`)
      .set('Authorization', `Bearer ${otherLogin.body.token}`)
      .expect(404);
  } finally {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
