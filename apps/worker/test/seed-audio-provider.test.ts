import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildSeedAudioPrompt,
  seedAudioSynthesisText,
  SeedAudioGenerationError,
  VolcengineSeedAudioProvider,
} from '../src/providers/volcengine-seed-audio.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  key: process.env.VOLCENGINE_SEED_AUDIO_API_KEY,
  alias: process.env.BYTEPLUS_SEED_AUDIO_API_KEY,
  base: process.env.VOLCENGINE_SEED_AUDIO_BASE_URL,
  model: process.env.SEED_AUDIO_MODEL,
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
});

test('builds one compact delivery prompt without age, gender or raw personality labels', () => {
  const prompt = buildSeedAudioPrompt('我知道啦，现在已经没事了。', {
    relationshipType: 'CHILD',
    deliveryMode: 'DIRECT_TENSE',
    speechAct: 'EXPLAIN',
  });
  assert.match(prompt, /使用@Audio1的声音/);
  assert.match(prompt, /直接向父母补一句原因/);
  assert.match(prompt, /轻微不满，关键词稍重/);
  assert.match(prompt, /『我知道啦，现在已经没事了。』/);
  assert.doesNotMatch(prompt, /12岁|女孩|女性|HARD_SOFT|嘴硬心软|pitch|volume|SSML/u);
});

test('keeps only compact observable reference habits and one explicit correction', () => {
  const prompt = buildSeedAudioPrompt('我知道了。', {
    relationshipType: 'CHILD',
    deliveryMode: 'CASUAL',
    speechAct: 'REPLY',
    observedBaseline: {
      speechRate: 'FAST',
      pauseStyle: 'LOW',
      pitchStyle: 'WIDE',
      sentenceEndingStyle: 'FALLING',
      volumeDynamicsStyle: 'DYNAMIC',
      correction: 'VOLUME_SOFTER',
    },
  });
  assert.match(prompt, /本人语速偏快、少停顿、语调自然起伏的说话习惯/);
  assert.match(prompt, /情绪起来时音量不要变大/);
  assert.match(prompt, /语调自然起伏/u);
  assert.doesNotMatch(prompt, /句尾下收|保留自然强弱/u);
});

test('plain replies use one concrete speech act', () => {
  const prompt = buildSeedAudioPrompt('我知道啦，今天会早点回来的。', {
    relationshipType: 'CHILD',
    deliveryMode: 'CASUAL',
    speechAct: 'AGREE',
  });
  assert.match(prompt, /接住父母的话并自然回应/);
  assert.match(prompt, /连贯地说，句尾干净/);
  assert.doesNotMatch(prompt, /12岁|女孩|自然放松|当前就是普通/u);
});

test('emotional replies use one delivery mode and one speech act', () => {
  const concerned = buildSeedAudioPrompt('你是不是还没吃饭？', {
    relationshipType: 'CHILD', deliveryMode: 'PRACTICAL_CARE', speechAct: 'ASK',
  });
  const sad = buildSeedAudioPrompt('我心里有点难受。', {
    relationshipType: 'CHILD', deliveryMode: 'SOFT_HURT', speechAct: 'REPLY',
  });
  const mixed = buildSeedAudioPrompt('现在已经没事了。', {
    relationshipType: 'CHILD', deliveryMode: 'CASUAL', speechAct: 'AGREE',
  });
  assert.match(concerned, /顺口问父母一句。认真但自然/);
  assert.match(sad, /直接回应父母。有点难受/);
  assert.match(mixed, /接住父母的话并自然回应。连贯地说/);
  assert.doesNotMatch(`${concerned}${sad}${mixed}`, /当前对话气氛|逐渐缓下来|情绪退得快/u);
});

test('anger, playful and teasing use bounded delivery modes rather than raw personality scenes', () => {
  const angry = buildSeedAudioPrompt('你怎么现在才说呀。', {
    relationshipType: 'PARTNER',
    deliveryMode: 'DIRECT_TENSE', speechAct: 'REPLY',
  });
  const playful = buildSeedAudioPrompt('我就吃一口嘛。', {
    relationshipType: 'CHILD',
    deliveryMode: 'PLAYFUL_LIGHT', speechAct: 'TEASE',
  });
  const teasing = buildSeedAudioPrompt('你今天这么好说话呀。', {
    relationshipType: 'PARTNER',
    deliveryMode: 'PLAYFUL_LIGHT', speechAct: 'TEASE',
  });
  assert.match(angry, /轻微不满，关键词稍重/);
  assert.match(playful, /顺口调侃父母一句/);
  assert.match(teasing, /顺口调侃伴侣一句/);
  assert.doesNotMatch(`${angry}${playful}${teasing}`, /QUICK_DIRECT|PLAYFUL_PLAIN|PLAYFUL_POSITIVE|12岁|24岁/u);
});

test('delivery prompt never receives age-stage or personality psychology prose', () => {
  const prompt = buildSeedAudioPrompt('先听我说完。', {
    relationshipType: 'CHILD',
    deliveryMode: 'DIRECT_TENSE', speechAct: 'EXPLAIN',
  });
  assert.match(prompt, /直接向父母补一句原因/);
  assert.doesNotMatch(prompt, /12岁|女孩|自主|自己的主意|被尊重|AUTONOMY/u);
});

test('direct explanation keeps every spoken word but shortens an ellipsis pause', () => {
  const visible = '我才没有担心你……就是看你这么晚还没回来。';
  const synthesis = seedAudioSynthesisText(visible, { deliveryMode: 'DIRECT_TENSE', speechAct: 'EXPLAIN' });
  const prompt = buildSeedAudioPrompt(visible, {
    relationshipType: 'CHILD',
    deliveryMode: 'DIRECT_TENSE', speechAct: 'EXPLAIN',
  });
  assert.equal(synthesis, '我才没有担心你，就是看你这么晚还没回来。');
  assert.match(prompt, /直接向父母补一句原因/);
  assert.doesNotMatch(prompt, /嘴硬|心软|先简短否认/u);
  assert.doesNotMatch(prompt, /……/u);
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
