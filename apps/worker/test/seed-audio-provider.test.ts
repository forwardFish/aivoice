import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildSeedAudioPrompt,
  estimateSeedAudioCostUsd,
  seedAudioSynthesisText,
  seedAudioUsdPerMinute,
  SeedAudioGenerationError,
  VolcengineSeedAudioProvider,
} from '../src/providers/volcengine-seed-audio.js';
import type { VoiceDeliveryPlan } from '../src/providers/voice-provider.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  key: process.env.VOLCENGINE_SEED_AUDIO_API_KEY,
  alias: process.env.BYTEPLUS_SEED_AUDIO_API_KEY,
  base: process.env.VOLCENGINE_SEED_AUDIO_BASE_URL,
  model: process.env.SEED_AUDIO_MODEL,
  price: process.env.BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv.key === undefined) delete process.env.VOLCENGINE_SEED_AUDIO_API_KEY;
  else process.env.VOLCENGINE_SEED_AUDIO_API_KEY = originalEnv.key;
  if (originalEnv.alias === undefined) delete process.env.BYTEPLUS_SEED_AUDIO_API_KEY;
  else process.env.BYTEPLUS_SEED_AUDIO_API_KEY = originalEnv.alias;
  if (originalEnv.base === undefined) delete process.env.VOLCENGINE_SEED_AUDIO_BASE_URL;
  else process.env.VOLCENGINE_SEED_AUDIO_BASE_URL = originalEnv.base;
  if (originalEnv.model === undefined) delete process.env.SEED_AUDIO_MODEL;
  else process.env.SEED_AUDIO_MODEL = originalEnv.model;
  if (originalEnv.price === undefined) delete process.env.BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE;
  else process.env.BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE = originalEnv.price;
});

test('estimates Seed Audio billing in the provider account currency without a hard-coded RMB conversion', () => {
  const env = { BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE: '0.15' } as NodeJS.ProcessEnv;
  assert.equal(seedAudioUsdPerMinute(env), 0.15);
  assert.equal(estimateSeedAudioCostUsd(5.4, 0.15), 0.0135);
  assert.equal(estimateSeedAudioCostUsd(-1, 0.15), 0);
  assert.throws(
    () => seedAudioUsdPerMinute({ BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE: '0' } as NodeJS.ProcessEnv),
    /positive number/,
  );
});

const plans: Record<string, VoiceDeliveryPlan> = {
  casual: { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'CONNECTED_SHORT' },
  deny: { act: 'DENY_THEN_EXPLAIN', affect: 'IRRITATED', intensity: 1, cadence: 'NO_SLOWDOWN_AFTER_COMMA' },
  boundary: { act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2, cadence: 'FIRM_TWO_BEAT' },
  playful: { act: 'PLAYFUL_PROBE', affect: 'PLAYFUL', intensity: 1, cadence: 'LIGHT_FINAL_RISE' },
  hurt: { act: 'ADMIT_HURT', affect: 'HURT', intensity: 2, cadence: 'SOFT_FALL' },
};

test('builds one positive micro-scene instead of a generic instruction stack', () => {
  const prompt = buildSeedAudioPrompt('我知道啦，刚才就是有点忙。', {
    relationshipType: 'CHILD', deliveryPlan: plans.casual,
  });
  assert.match(prompt, /使用@Audio1里同一个人的声音/);
  assert.match(prompt, /顺嘴解释一句/);
  assert.match(prompt, /语气词快速带过/);
  assert.match(prompt, /只说：“我知道啦，刚才就是有点忙。”/);
  assert.doesNotMatch(prompt, /对方刚说|保持本人原来|不播报|不过度表演|嘴硬心软/u);
});

test('four-field plans produce distinct observable speaking actions', () => {
  const deny = buildSeedAudioPrompt('我才没有担心你，就是看你这么晚还没回来。', {
    relationshipType: 'CHILD', deliveryPlan: plans.deny,
  });
  const boundary = buildSeedAudioPrompt('你先听我说完，这是我的事，我想自己决定。', {
    relationshipType: 'CHILD', deliveryPlan: plans.boundary,
  });
  const playful = buildSeedAudioPrompt('你今天这么好说话呀，是不是有事求我？', {
    relationshipType: 'CHILD', deliveryPlan: plans.playful,
  });
  const hurt = buildSeedAudioPrompt('你刚才那样说，我心里真的有点难受。', {
    relationshipType: 'CHILD', deliveryPlan: plans.hurt,
  });
  assert.match(deny, /先急着否认，紧接着把原因说出来/);
  assert.match(boundary, /父母正替说话人做决定，马上顶回去/);
  assert.match(boundary, /边界句说重，后半不放软/);
  assert.match(playful, /父母今天反常好说话，顺口逗一句/);
  assert.doesNotMatch(`${boundary}${playful}`, /妈妈|她/u);
  assert.match(hurt, /委屈但认真说出来/);
  assert.match(hurt, /表达真实感受的语义单元稍微加重/);
  assert.equal(boundary.match(/这是我的事/gu)?.length, 1);
  assert.equal(hurt.match(/真的/gu)?.length, 1);
});

test('internal punctuation changes rhythm without changing words or visible text', () => {
  const visible = '你先听我说完，这是我的事，我想自己决定。';
  assert.equal(
    seedAudioSynthesisText(visible, { deliveryPlan: plans.boundary }),
    '你先听我说完。这是我的事，我想自己决定。',
  );
  assert.equal(
    seedAudioSynthesisText('我才没有担心你……就是看你这么晚还没回来。', { deliveryPlan: plans.deny }),
    '我才没有担心你，就是看你这么晚还没回来。',
  );
});

test('the exact same text and four-field plan produce the exact same Seed prompt', () => {
  const options = { relationshipType: 'CHILD' as const, deliveryPlan: plans.playful };
  const left = buildSeedAudioPrompt('你今天这么好说话呀，是不是有事求我？', options);
  const right = buildSeedAudioPrompt('你今天这么好说话呀，是不是有事求我？', options);
  assert.equal(left, right);
});

test('sends one Seed Audio request with the reference audio and returns WAV bytes', async () => {
  process.env.VOLCENGINE_SEED_AUDIO_API_KEY = 'test-seed-key';
  process.env.VOLCENGINE_SEED_AUDIO_BASE_URL = 'https://openspeech.bytedance.com';
  process.env.SEED_AUDIO_MODEL = 'seed-audio-1.0';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-audio-provider-'));
  const referencePath = path.join(directory, 'reference.wav');
  await fs.writeFile(referencePath, Buffer.from('RIFF-reference'));
  const expected = Buffer.from('RIFF-generated');
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), 'https://openspeech.bytedance.com/api/v3/tts/create');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'test-seed-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'seed-audio-1.0');
    assert.equal(body.references.length, 1);
    assert.equal(Buffer.from(body.references[0].audio_data, 'base64').toString(), 'RIFF-reference');
    assert.deepEqual(body.audio_config, {
      format: 'wav', sample_rate: 24_000, speech_rate: 0, loudness_rate: 0, pitch_rate: 0,
    });
    return new Response(JSON.stringify({
      audio: expected.toString('base64'), duration: 3.2, original_duration: 3.2,
    }), { status: 200, headers: { 'X-Tt-Logid': 'seed-log-1' } });
  };
  try {
    const provider = new VolcengineSeedAudioProvider();
    const result = await provider.synthesize(referencePath, '你好。', {
      messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deliveryMode: 'CASUAL',
      speechAct: 'REPLY',
    });
    assert.deepEqual(result, expected);
    assert.equal(calls, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('does not retry a failed Seed Audio request', async () => {
  process.env.VOLCENGINE_SEED_AUDIO_API_KEY = 'test-seed-key';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-audio-failure-'));
  const referencePath = path.join(directory, 'reference.wav');
  await fs.writeFile(referencePath, Buffer.from('RIFF-reference'));
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: 45000030, message: 'resource not granted' }), { status: 403 });
  };
  try {
    const provider = new VolcengineSeedAudioProvider();
    await assert.rejects(
      provider.synthesize(referencePath, '你好。'),
      (error: unknown) => error instanceof SeedAudioGenerationError
        && error.code === '45000030'
        && error.retryable === false,
    );
    assert.equal(calls, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
