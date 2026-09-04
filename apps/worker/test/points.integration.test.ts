import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { encryptProviderId } from '../src/crypto/provider-id.js';
import { WorkerDatabase } from '../src/db.js';
import { JobRunner } from '../src/job-runner.js';
import { readAigcChunks } from '../src/media/aigc.js';
import { probeWav } from '../src/media/ffmpeg.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

function silentPcmWav(durationMs = 100): Buffer {
  const sampleRate = 24_000;
  const sampleCount = Math.round(sampleRate * durationMs / 1000);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

test('GENERATION_POINT_COST must be a positive integer', () => {
  const previous = process.env.GENERATION_POINT_COST;
  const fakeDatabase = {} as WorkerDatabase;
  const dependencies = {
    voiceProvider: {
      targetModel: 'fake',
      async enroll() { return 'unused'; },
      async synthesize() { return Buffer.alloc(0); },
      async deleteVoice() { return undefined; },
    },
    chatProvider: { async reply() { return 'unused'; } },
  };
  try {
    for (const invalid of ['0', '-1', '1.5', 'abc']) {
      process.env.GENERATION_POINT_COST = invalid;
      assert.throws(() => new JobRunner(fakeDatabase, dependencies), /positive integer/);
    }
    delete process.env.GENERATION_POINT_COST;
    assert.doesNotThrow(() => new JobRunner(fakeDatabase, dependencies));
  } finally {
    if (previous === undefined) delete process.env.GENERATION_POINT_COST;
    else process.env.GENERATION_POINT_COST = previous;
  }
});

test('successful generation consumes points once while provider and disk failures consume none', { skip: !hasDatabase }, async () => {
  const previousMediaRoot = process.env.MEDIA_LOCAL_ROOT;
  const previousPointCost = process.env.GENERATION_POINT_COST;
  const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-worker-points-'));
  process.env.MEDIA_LOCAL_ROOT = mediaRoot;
  process.env.GENERATION_POINT_COST = '1';
  const database = new WorkerDatabase();
  const userId = crypto.randomUUID();
  const voiceId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const successMessageId = crypto.randomUUID();
  const failedMessageId = crypto.randomUUID();
  const diskFailureMessageId = crypto.randomUUID();
  const metadataFailureMessageId = crypto.randomUUID();
  const fakeVoiceProvider = {
    targetModel: 'fake-model',
    async enroll() { return 'unused'; },
    async synthesize(_providerVoiceId: string, text: string) {
      if (text === 'FAIL_PROVIDER') throw new Error('provider unavailable');
      if (text === 'FAIL_AIGC') return Buffer.from('invalid wav');
      return silentPcmWav();
    },
    async deleteVoice() { return undefined; },
  };
  const runner = new JobRunner(database, {
    voiceProvider: fakeVoiceProvider,
    chatProvider: { async reply() { return 'unused'; } },
  });
  const isolationLock = await database.pool.connect();
  await isolationLock.query('SELECT pg_advisory_lock(812345678)');

  try {
    await database.pool.query(
      'TRUNCATE point_ledgers, point_accounts, quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    await database.pool.query(
      `INSERT INTO users (id,openid,nickname,avatar_url,created_at,updated_at)
       VALUES ($1,$2,'','',NOW(),NOW())`,
      [userId, `points-worker-${userId}`],
    );
    await database.pool.query(
      `INSERT INTO point_accounts (user_id,balance,signup_granted_at,created_at,updated_at)
       VALUES ($1,2,NOW(),NOW(),NOW())`,
      [userId],
    );
    await database.pool.query(
      `INSERT INTO voice_profiles
       (id,user_id,name,status,trial_quota_remaining,paid_quota_remaining,failure_code,failure_message,created_at,updated_at)
       VALUES ($1,$2,'points voice','READY',0,0,'','',NOW(),NOW())`,
      [voiceId, userId],
    );
    await database.pool.query(
      `INSERT INTO voice_models
       (id,voice_profile_id,provider,target_model,provider_voice_id_encrypted,status,deletion_error,created_at,updated_at)
       VALUES ($1,$2,'fake','fake-model',$3,'READY','',NOW(),NOW())`,
      [crypto.randomUUID(), voiceId, encryptProviderId('provider-points-test')],
    );
    const referenceObjectKey = path.join('reference', userId, voiceId, 'reference.wav').replaceAll('\\', '/');
    const referencePath = path.resolve(mediaRoot, referenceObjectKey);
    const referenceAudio = silentPcmWav();
    await fs.mkdir(path.dirname(referencePath), { recursive: true });
    await fs.writeFile(referencePath, referenceAudio);
    await database.pool.query(
      `INSERT INTO media_assets
       (id,user_id,voice_profile_id,kind,status,object_key,mime_type,bytes,duration_ms,sha256,created_at,updated_at)
       VALUES ($1,$2,$3,'REFERENCE_AUDIO','READY',$4,'audio/wav',$5,100,'reference-test-sha',NOW(),NOW())`,
      [crypto.randomUUID(), userId, voiceId, referenceObjectKey, referenceAudio.length],
    );
    await database.pool.query(
      `INSERT INTO conversations (id,voice_profile_id,created_at,updated_at)
       VALUES ($1,$2,NOW(),NOW())`,
      [conversationId, voiceId],
    );
    await database.pool.query(
      `INSERT INTO messages
       (id,conversation_id,user_id,voice_profile_id,idempotency_key,mode,status,input_text,output_text,error_code,error_message,created_at,updated_at)
       VALUES ($1,$2,$3,$4,'success','EXACT_SPEECH','PENDING','你好','','','',NOW(),NOW()),
              ($5,$2,$3,$4,'failure','EXACT_SPEECH','PENDING','FAIL_PROVIDER','','','',NOW(),NOW()),
              ($6,$2,$3,$4,'disk-failure','EXACT_SPEECH','PENDING','FAIL_DISK','','','',NOW(),NOW()),
              ($7,$2,$3,$4,'metadata-failure','EXACT_SPEECH','PENDING','FAIL_AIGC','','','',NOW(),NOW())`,
      [successMessageId, conversationId, userId, voiceId, failedMessageId, diskFailureMessageId, metadataFailureMessageId],
    );
    const diskFailurePath = path.resolve(
      mediaRoot,
      'generated',
      userId,
      voiceId,
      `${diskFailureMessageId}.wav`,
    );
    await fs.mkdir(diskFailurePath, { recursive: true });
    const jobs = [
      { id: crypto.randomUUID(), messageId: successMessageId, dedupe: `generation:${successMessageId}` },
      { id: crypto.randomUUID(), messageId: successMessageId, dedupe: `generation-duplicate:${successMessageId}` },
      { id: crypto.randomUUID(), messageId: failedMessageId, dedupe: `generation:${failedMessageId}` },
      { id: crypto.randomUUID(), messageId: diskFailureMessageId, dedupe: `generation:${diskFailureMessageId}` },
      { id: crypto.randomUUID(), messageId: metadataFailureMessageId, dedupe: `generation:${metadataFailureMessageId}` },
    ];
    for (const job of jobs) {
      await database.pool.query(
        `INSERT INTO jobs
         (id,user_id,voice_profile_id,message_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'GENERATE_MESSAGE','QUEUED',$5,'{}'::jsonb,0,1,NOW(),NOW(),NOW())`,
        [job.id, userId, voiceId, job.messageId, job.dedupe],
      );
    }

    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), true);
    assert.equal(await runner.runOnce(), true);

    const account = await database.pool.query<{ balance: number }>(
      'SELECT balance FROM point_accounts WHERE user_id=$1',
      [userId],
    );
    assert.equal(account.rows[0]?.balance, 1);
    const ledgers = await database.pool.query<{
      amount: number;
      balance_after: number;
      message_id: string;
      voice_profile_id: string;
      request_key: string;
    }>(
      `SELECT amount,balance_after,message_id,voice_profile_id,request_key
       FROM point_ledgers WHERE type='GENERATION_CONSUME'`,
    );
    assert.deepEqual(ledgers.rows, [{
      amount: -1,
      balance_after: 1,
      message_id: successMessageId,
      voice_profile_id: voiceId,
      request_key: `generation:${successMessageId}`,
    }]);
    const messages = await database.pool.query<{ id: string; status: string }>(
      'SELECT id,status FROM messages WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[successMessageId, failedMessageId, diskFailureMessageId]],
    );
    assert.equal(messages.rows.find((row) => row.id === successMessageId)?.status, 'READY');
    assert.equal(messages.rows.find((row) => row.id === failedMessageId)?.status, 'FAILED');
    assert.equal(messages.rows.find((row) => row.id === diskFailureMessageId)?.status, 'FAILED');
    const metadataFailure = await database.pool.query<{ status: string }>(
      'SELECT status FROM messages WHERE id=$1',
      [metadataFailureMessageId],
    );
    assert.equal(metadataFailure.rows[0]?.status, 'FAILED');
    const metadataFailurePath = path.resolve(mediaRoot, 'generated', userId, voiceId, `${metadataFailureMessageId}.wav`);
    await assert.rejects(fs.access(metadataFailurePath));

    const generatedPath = path.resolve(mediaRoot, 'generated', userId, voiceId, `${successMessageId}.wav`);
    const taggedWav = await fs.readFile(generatedPath);
    const chunks = readAigcChunks(taggedWav);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.AIGC.ProduceID, successMessageId);
    assert.equal(chunks[0]?.AIGC.PropagateID, successMessageId);
    const probe = await probeWav(generatedPath);
    assert.ok(probe.durationMs > 0);
  } finally {
    await isolationLock.query('SELECT pg_advisory_unlock(812345678)').catch(() => undefined);
    isolationLock.release();
    await database.close();
    await fs.rm(mediaRoot, { recursive: true, force: true });
    if (previousMediaRoot === undefined) delete process.env.MEDIA_LOCAL_ROOT;
    else process.env.MEDIA_LOCAL_ROOT = previousMediaRoot;
    if (previousPointCost === undefined) delete process.env.GENERATION_POINT_COST;
    else process.env.GENERATION_POINT_COST = previousPointCost;
  }
});
