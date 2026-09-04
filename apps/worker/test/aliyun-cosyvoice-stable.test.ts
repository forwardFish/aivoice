import assert from 'node:assert/strict';
import test from 'node:test';
import { AliyunCosyVoiceProvider } from '../src/providers/aliyun-cosyvoice.js';
import type { CosyVoiceProviderRequest } from '../src/stable-voice.js';

const ORIGINAL_ENV = {
  key: process.env.DASHSCOPE_API_KEY,
  host: process.env.DASHSCOPE_API_HOST,
  model: process.env.AIVOICE_TARGET_MODEL,
};
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  for (const [key, value] of Object.entries({
    DASHSCOPE_API_KEY: ORIGINAL_ENV.key,
    DASHSCOPE_API_HOST: ORIGINAL_ENV.host,
    AIVOICE_TARGET_MODEL: ORIGINAL_ENV.model,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

test('stable synthesis maps only the frozen CosyVoice request and omits legacy acoustic fields', async () => {
  process.env.DASHSCOPE_API_KEY = 'test-key';
  process.env.DASHSCOPE_API_HOST = 'https://dashscope.aliyuncs.com';
  process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';
  let providerBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes('SpeechSynthesizer')) {
      providerBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        output: { audio: { url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/stable.wav' } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 });
  }) as typeof fetch;

  const request: CosyVoiceProviderRequest = {
    jobId: 'job-stable',
    messageId: 'message-stable',
    model: 'cosyvoice-v3.5-plus',
    voice: 'registered-voice',
    text: '这次我想自己决定。',
    seed: 0,
    textType: 'PlainText',
    enableSsml: false,
    format: 'wav',
    sampleRate: 24000,
    languageHints: ['zh'],
  };
  const audio = await new AliyunCosyVoiceProvider().synthesizeStable(request);
  assert.equal(audio.length, 4);
  const input = (providerBody?.input || {}) as Record<string, unknown>;
  assert.deepEqual(input, {
    text: request.text,
    voice: request.voice,
    format: 'wav',
    sample_rate: 24000,
    language_hints: ['zh'],
    seed: 0,
    text_type: 'PlainText',
    enable_ssml: false,
  });
  for (const key of ['rate', 'pitch', 'volume', 'relationshipType', 'deliveryMode', 'speechAct', 'deliveryPlan']) {
    assert.equal(key in input, false);
  }
});

test('stable synthesis fails before fetch when the stored and runtime models differ', async () => {
  process.env.DASHSCOPE_API_KEY = 'test-key';
  process.env.DASHSCOPE_API_HOST = 'https://dashscope.aliyuncs.com';
  process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-flash';
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called');
  }) as typeof fetch;
  await assert.rejects(
    () => new AliyunCosyVoiceProvider().synthesizeStable({
      jobId: 'job-stable', messageId: 'message-stable', model: 'cosyvoice-v3.5-plus',
      voice: 'registered-voice', text: '我知道了。', seed: 0, textType: 'PlainText',
      enableSsml: false, format: 'wav', sampleRate: 24000,
    }),
    /Stable voice model mismatch/u,
  );
  assert.equal(fetchCalls, 0);
});
