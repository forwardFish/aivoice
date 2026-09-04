import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatProviderFromEnv } from '../src/providers/chat-provider-factory.js';
import { createSpeakerAnalysisProviderFromEnv } from '../src/providers/speaker-analysis-provider.js';
import { createVoiceProviderFromEnv } from '../src/providers/voice-provider-factory.js';

const KEYS = [
  'AIVOICE_CHAT_PROVIDER', 'DASHSCOPE_API_KEY', 'DASHSCOPE_API_HOST', 'CHAT_MODEL', 'AIVOICE_QWEN_EXPLICIT_PROMPT_CACHE',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_API_HOST', 'DEEPSEEK_CHAT_MODEL',
  'AIVOICE_VOICE_PROVIDER', 'AIVOICE_SPEAKER_ANALYSIS_PROVIDER',
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('switches text, voice and analysis providers through environment configuration', () => {
  process.env.AIVOICE_CHAT_PROVIDER = 'dashscope';
  process.env.DASHSCOPE_API_KEY = 'qwen-key';
  process.env.DASHSCOPE_API_HOST = 'https://dashscope.aliyuncs.com';
  process.env.CHAT_MODEL = 'qwen3.8-max';
  assert.equal(createChatProviderFromEnv().providerName, 'dashscope');

  process.env.AIVOICE_CHAT_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'deepseek-key';
  process.env.DEEPSEEK_CHAT_MODEL = 'deepseek-chat';
  assert.equal(createChatProviderFromEnv().providerName, 'deepseek');

  process.env.AIVOICE_VOICE_PROVIDER = 'volcengine-seed-audio';
  assert.equal(createVoiceProviderFromEnv().referenceMode, 'REFERENCE_AUDIO');
  process.env.AIVOICE_VOICE_PROVIDER = 'aliyun-cosyvoice';
  assert.equal(createVoiceProviderFromEnv().referenceMode, 'REGISTERED_VOICE');

  process.env.AIVOICE_SPEAKER_ANALYSIS_PROVIDER = 'aliyun';
  assert.equal(createSpeakerAnalysisProviderFromEnv().providerName, 'aliyun');
});

test('defaults chat audio to the low-latency registered voice provider', () => {
  delete process.env.AIVOICE_VOICE_PROVIDER;
  process.env.DASHSCOPE_API_KEY = 'cosy-key';
  process.env.DASHSCOPE_API_HOST = 'https://dashscope.aliyuncs.com';
  const provider = createVoiceProviderFromEnv();
  assert.equal(provider.providerName, 'aliyun-cosyvoice');
  assert.equal(provider.referenceMode, 'REGISTERED_VOICE');
});

test('rejects unknown providers instead of silently using the wrong model', () => {
  process.env.AIVOICE_VOICE_PROVIDER = 'unknown';
  assert.throws(() => createVoiceProviderFromEnv(), /Unsupported AIVOICE_VOICE_PROVIDER/);
});
