import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { encryptProviderId } from '../src/crypto/provider-id.js';
import { WorkerDatabase } from '../src/db.js';
import { JobRunner } from '../src/job-runner.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

test('Worker deletes provider voices and private media for voice and account jobs', { skip: !hasDatabase }, async () => {
  const previousMediaRoot = process.env.MEDIA_LOCAL_ROOT;
  const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-worker-delete-'));
  process.env.MEDIA_LOCAL_ROOT = mediaRoot;
  const database = new WorkerDatabase();
  const deletedProviderIds: string[] = [];
  const fakeVoiceProvider = {
    targetModel: 'fake-model',
    async enroll() { return 'unused'; },
    async synthesize() { return Buffer.alloc(0); },
    async deleteVoice(providerVoiceId: string) { deletedProviderIds.push(providerVoiceId); },
  };
  const fakeChatProvider = { async reply() { return 'unused'; } };
  const runner = new JobRunner(database, { voiceProvider: fakeVoiceProvider, chatProvider: fakeChatProvider });
  const isolationLock = await database.pool.connect();
  await isolationLock.query('SELECT pg_advisory_lock(812345678)');

  const voiceUserId = crypto.randomUUID();
  const voiceId = crypto.randomUUID();
  const accountUserId = crypto.randomUUID();
  const accountVoiceIds = [crypto.randomUUID(), crypto.randomUUID()];
  const allMedia: Array<{ id: string; userId: string; voiceId: string; objectKey: string }> = [
    { id: crypto.randomUUID(), userId: voiceUserId, voiceId, objectKey: `preview/${voiceUserId}/${voiceId}.wav` },
    ...accountVoiceIds.map((id, index) => ({
      id: crypto.randomUUID(),
      userId: accountUserId,
      voiceId: id,
      objectKey: `generated/${accountUserId}/${id}/audio-${index}.wav`,
    })),
  ];

  try {
    await database.pool.query(
      'TRUNCATE quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    await database.pool.query(
      `INSERT INTO users (id,openid,nickname,avatar_url,created_at,updated_at,deleted_at)
       VALUES ($1,'delete-voice-user','','',NOW(),NOW(),NULL),($2,'delete-account-user','','',NOW(),NOW(),NOW())`,
      [voiceUserId, accountUserId],
    );
    await database.pool.query(
      `INSERT INTO voice_profiles (id,user_id,name,status,trial_quota_remaining,paid_quota_remaining,failure_code,failure_message,created_at,updated_at)
       VALUES ($1,$2,'voice-delete','DELETING',0,0,'','',NOW(),NOW()),
              ($3,$4,'account-delete-1','DELETING',0,0,'','',NOW(),NOW()),
              ($5,$4,'account-delete-2','DELETING',0,0,'','',NOW(),NOW())`,
      [voiceId, voiceUserId, accountVoiceIds[0], accountUserId, accountVoiceIds[1]],
    );
    const modelRows = [
      { voiceId, providerId: 'provider-voice-delete' },
      { voiceId: accountVoiceIds[0], providerId: 'provider-account-1' },
      { voiceId: accountVoiceIds[1], providerId: 'provider-account-2' },
    ];
    for (const row of modelRows) {
      await database.pool.query(
        `INSERT INTO voice_models
         (id,voice_profile_id,provider,target_model,provider_voice_id_encrypted,status,deletion_error,created_at,updated_at)
         VALUES ($1,$2,'fake','fake-model',$3,'READY','',NOW(),NOW())`,
        [crypto.randomUUID(), row.voiceId, encryptProviderId(row.providerId)],
      );
    }
    for (const media of allMedia) {
      const filePath = path.resolve(mediaRoot, media.objectKey);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'private audio');
      await database.pool.query(
        `INSERT INTO media_assets
         (id,user_id,voice_profile_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256,created_at,updated_at)
         VALUES ($1,$2,$3,'PREVIEW_AUDIO','READY',$4,'audio/wav',13,1000,'test-sha',NOW(),NOW())`,
        [media.id, media.userId, media.voiceId, media.objectKey],
      );
    }
    const voiceJobId = crypto.randomUUID();
    const accountJobId = crypto.randomUUID();
    await database.pool.query(
      `INSERT INTO jobs
       (id,user_id,voice_profile_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at,created_at,updated_at)
       VALUES ($1,$2,$3,'DELETE_VOICE','QUEUED',$4,$5::jsonb,0,5,NOW(),NOW(),NOW()),
              ($6,$7,NULL,'DELETE_ACCOUNT','QUEUED',$8,$9::jsonb,0,10,NOW(),NOW()+INTERVAL '1 second',NOW())`,
      [
        voiceJobId, voiceUserId, voiceId, `delete-voice:${voiceId}`, JSON.stringify({ voiceId }),
        accountJobId, accountUserId, `delete-account:${accountUserId}`, JSON.stringify({ userId: accountUserId }),
      ],
    );

    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), true);
    assert.deepEqual(deletedProviderIds.sort(), ['provider-account-1', 'provider-account-2', 'provider-voice-delete'].sort());

    for (const media of allMedia) {
      await assert.rejects(fs.access(path.resolve(mediaRoot, media.objectKey)), { code: 'ENOENT' });
    }
    const voiceStatuses = await database.pool.query<{ status: string; deleted_at: Date | null }>(
      `SELECT status,deleted_at FROM voice_profiles WHERE id=ANY($1::uuid[])`,
      [[voiceId, ...accountVoiceIds]],
    );
    assert.equal(voiceStatuses.rows.length, 3);
    assert.ok(voiceStatuses.rows.every((row) => row.status === 'DELETED' && row.deleted_at));
    const mediaStatuses = await database.pool.query<{ status: string }>(
      `SELECT status FROM media_assets WHERE id=ANY($1::uuid[])`,
      [allMedia.map((item) => item.id)],
    );
    assert.ok(mediaStatuses.rows.every((row) => row.status === 'DELETED'));
    const jobStatuses = await database.pool.query<{ status: string }>(
      `SELECT status FROM jobs WHERE id=ANY($1::uuid[])`,
      [[voiceJobId, accountJobId]],
    );
    assert.ok(jobStatuses.rows.every((row) => row.status === 'SUCCEEDED'));
  } finally {
    await isolationLock.query('SELECT pg_advisory_unlock(812345678)').catch(() => undefined);
    isolationLock.release();
    await database.close();
    await fs.rm(mediaRoot, { recursive: true, force: true });
    if (previousMediaRoot === undefined) delete process.env.MEDIA_LOCAL_ROOT;
    else process.env.MEDIA_LOCAL_ROOT = previousMediaRoot;
  }
});
