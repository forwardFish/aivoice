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

test('builds a natural relationship scene without CosyVoice parameter instructions', () => {
  const prompt = buildSeedAudioPrompt('我知道啦，现在已经没事了。', {
    ageYears: 12,
    gender: 'FEMALE',
    userAgeYears: 40,
    relationshipType: 'CHILD',
    replyTone: 'MIXED',
  });
  assert.match(prompt, /使用@Audio1的声音/);
  assert.match(prompt, /12岁女孩先表达一点不满，随后自然把话收回来/);
  assert.match(prompt, /『我知道啦，现在已经没事了。』/);
  assert.doesNotMatch(prompt, /pitch|volume|SSML|音调提高/u);
});

test('accepts one shared semantic scene instruction for cross-provider comparison', () => {
  const prompt = buildSeedAudioPrompt('真的呀？', {
    sceneInstruction: '12岁女孩在家里和妈妈说话，听到好消息后自然开心，带一点笑意，不夸张，不表演。',
  });
  assert.match(prompt, /听到好消息后自然开心，带一点笑意，不夸张，不表演。只说这一句/);
  assert.doesNotMatch(prompt, /普通的日常交流|当前对话气氛/u);
});

test('plain replies describe the current speech act instead of an abstract relaxed emotion', () => {
  const prompt = buildSeedAudioPrompt('我知道啦，今天会早点回来的。', {
    ageYears: 12,
    gender: 'FEMALE',
    relationshipType: 'CHILD',
    replyTone: 'PLAIN',
    interactionStance: 'ACCEPT',
  });
  assert.match(prompt, /12岁女孩随口回应自己的父母一件小事/);
  assert.doesNotMatch(prompt, /自然放松|当前就是普通|真实的日常对话/u);
});

test('emotional replies describe concrete conversational actions and bounded intensity', () => {
  const concerned = buildSeedAudioPrompt('你是不是还没吃饭？', {
    ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'CONCERNED',
    interactionStance: 'ASK', emotionIntensity: 1,
  });
  const sad = buildSeedAudioPrompt('我心里有点难受。', {
    ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'SAD_OR_HURT',
    interactionStance: 'RESPOND', emotionIntensity: 2,
  });
  const mixed = buildSeedAudioPrompt('现在已经没事了。', {
    ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'MIXED',
    interactionStance: 'REPAIR', emotionIntensity: 2,
  });
  assert.match(concerned, /注意到自己的父母当前的情况，顺口关心地问一句/);
  assert.match(sad, /因为当前这件事有些难受，直接对自己的父母说出感受/);
  assert.match(mixed, /先表达一点不满，随后自然把话收回来/);
  assert.doesNotMatch(`${concerned}${sad}${mixed}`, /当前对话气氛|当前是在认真关心|逐渐缓下来/u);
});

test('anger, playful and teasing styles produce distinct identity-aware scenes', () => {
  const angry = buildSeedAudioPrompt('你怎么现在才说呀。', {
    ageYears: 24, gender: 'FEMALE', relationshipType: 'PARTNER', replyTone: 'IRRITATED',
    interactionStance: 'RESPOND', emotionIntensity: 2, personalityStyle: 'QUICK_DIRECT_IRRITATED',
  });
  const playful = buildSeedAudioPrompt('我就吃一口嘛。', {
    ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'PLAIN',
    interactionStance: 'RESPOND', emotionIntensity: 0, personalityStyle: 'PLAYFUL_PLAIN',
  });
  const teasing = buildSeedAudioPrompt('你今天这么好说话呀。', {
    ageYears: 24, gender: 'FEMALE', relationshipType: 'PARTNER', replyTone: 'POSITIVE',
    interactionStance: 'RESPOND', emotionIntensity: 1, personalityStyle: 'PLAYFUL_POSITIVE',
  });
  assert.match(angry, /突然不高兴，开头直接，语气短促/);
  assert.match(playful, /12岁女孩带一点调皮地调侃自己的父母一句/);
  assert.match(teasing, /24岁女性带着笑意调侃自己的伴侣一句/);
});

test('surprise, embarrassment and autonomy styles remain age-appropriate', () => {
  const surprise = buildSeedAudioPrompt('真的假的？', { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'POSITIVE', personalityStyle: 'SURPRISED_POSITIVE' });
  const embarrassed = buildSeedAudioPrompt('你别夸我啦。', { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'UNEASY', personalityStyle: 'EMBARRASSED_UNEASY' });
  const autonomy = buildSeedAudioPrompt('先听我说完。', { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'IRRITATED', personalityStyle: 'AUTONOMY_IRRITATED' });
  assert.match(surprise, /起句是真实惊喜，随后自然开心/);
  assert.match(embarrassed, /被自己的父母夸奖后有点不好意思/);
  assert.match(autonomy, /不喜欢自己的父母替自己决定/);
});

test('hard-mouth soft-heart keeps every spoken word but shortens an ellipsis pause', () => {
  const visible = '我才没有担心你……就是看你这么晚还没回来。';
  const synthesis = seedAudioSynthesisText(visible, { personalityStyle: 'HARD_SOFT_MIXED' });
  const prompt = buildSeedAudioPrompt(visible, {
    ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', replyTone: 'MIXED',
    personalityStyle: 'HARD_SOFT_MIXED',
  });
  assert.equal(synthesis, '我才没有担心你，就是看你这么晚还没回来。');
  assert.match(prompt, /先简短否认，紧接着说明自己在意的原因/);
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
      replyTone: 'PLAIN',
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
