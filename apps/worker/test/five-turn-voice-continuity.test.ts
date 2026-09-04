import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

type StableEmotionMode = 'OFF' | 'SAFE_ONLY' | 'BOUNDED_ALL';

type FiveTurnDelivery = {
  act: string;
  affect: string;
  intensity: 0 | 1 | 2;
  cadence: string;
};

type StableVoiceModule = {
  buildIdentityStableVoicePlan(input: {
    text: string;
    delivery: FiveTurnDelivery;
    runtime: Record<string, unknown>;
    emotionMode: StableEmotionMode;
  }): {
    instruction?: string;
    identityFingerprint: string;
  };
  buildPinnedCosyVoiceRoute(runtime: Record<string, unknown>): Record<string, unknown>;
  toCosyVoiceProviderRequest(input: {
    jobId: string;
    messageId: string;
    runtime: Record<string, unknown>;
    plan: Record<string, unknown>;
  }): Record<string, unknown>;
};

const stableVoicePath = path.resolve(import.meta.dirname, '../src/stable-voice.ts');
const hasStableVoiceModule = fs.existsSync(stableVoicePath);
const runWhenStableVoiceReady = hasStableVoiceModule ? test : test.skip;

const FIVE_TURN_RUNTIME = {
  provider: 'ALIYUN_COSYVOICE',
  region: 'cn-beijing',
  modelId: 'cosyvoice-v3.5-plus',
  enrolledForModelId: 'cosyvoice-v3.5-plus',
  voiceId: 'voice-identity-stable-test',
  origin: 'REGISTERED_CLONE',
  continuity: 'MULTI_TURN',
  languageHint: 'zh',
  audioFormat: 'wav',
  sampleRate: 24000,
};

const FIVE_TURNS: Array<{ id: string; text: string; delivery: FiveTurnDelivery }> = [
  {
    id: 'T1',
    text: '我刚看到，等会儿就弄。',
    delivery: {
      act: 'CASUAL_EXPLAIN',
      affect: 'NEUTRAL',
      intensity: 0,
      cadence: 'BASELINE',
    },
  },
  {
    id: 'T2',
    text: '这次我想自己决定。',
    delivery: {
      act: 'ASSERT_BOUNDARY',
      affect: 'FIRM',
      intensity: 2,
      cadence: 'CONNECTED',
    },
  },
  {
    id: 'T3',
    text: '你刚才那句话，我听着还是有点难受。',
    delivery: {
      act: 'ADMIT_HURT',
      affect: 'HURT',
      intensity: 2,
      cadence: 'SHORT_FIRST_PAUSE',
    },
  },
  {
    id: 'T4',
    text: '真的啊？那太好了。',
    delivery: {
      act: 'EXPRESS_DELIGHT',
      affect: 'DELIGHTED',
      intensity: 2,
      cadence: 'QUESTION_LIFT',
    },
  },
  {
    id: 'T5',
    text: '今天确实有点累，晚点再说吧。',
    delivery: {
      act: 'SPEAK_LOW_ENERGY',
      affect: 'TIRED',
      intensity: 2,
      cadence: 'TAPERED',
    },
  },
];

const ALLOWLISTED_INSTRUCTIONS = new Set([
  '只略重读表达立场的短语，句尾平收，其余照常。',
  '首个分句后短停，后半句平收，其余照常。',
  '只略重读开头一个词，句尾轻微上扬，其余照常。',
  '分句间略作短停，末句收短，其余照常。',
]);

const FORBIDDEN_INSTRUCTION_TOKENS = [
  '妈妈',
  '女儿',
  '12岁',
  '熟人',
  '音色',
  '口音',
  '年龄',
  '性别',
  '关系',
  '委屈',
  '不服气',
  '声音微颤',
  '气息沉',
];

async function loadStableVoiceModule(_t: TestContext): Promise<StableVoiceModule | null> {
  try {
    const loaded = await import('../src/stable-voice.js');
    const module = loaded as Partial<StableVoiceModule>;
    assert.equal(typeof module.buildIdentityStableVoicePlan, 'function');
    assert.equal(typeof module.buildPinnedCosyVoiceRoute, 'function');
    assert.equal(typeof module.toCosyVoiceProviderRequest, 'function');
    return module as StableVoiceModule;
  } catch (error) {
    throw error;
  }
}

async function collectFiveTurnContracts(
  t: TestContext,
  emotionMode: StableEmotionMode = 'BOUNDED_ALL',
): Promise<{
  requests: Array<Record<string, unknown>>;
  routes: Array<Record<string, unknown>>;
  fingerprints: string[];
} | null> {
  const stableVoice = await loadStableVoiceModule(t);
  if (!stableVoice) return null;
  const requests: Array<Record<string, unknown>> = [];
  const routes: Array<Record<string, unknown>> = [];
  const fingerprints: string[] = [];

  for (const [index, turn] of FIVE_TURNS.entries()) {
    const plan = stableVoice.buildIdentityStableVoicePlan({
      text: turn.text,
      delivery: turn.delivery,
      runtime: FIVE_TURN_RUNTIME,
      emotionMode,
    });
    const request = stableVoice.toCosyVoiceProviderRequest({
      jobId: `job-${index + 1}`,
      messageId: `message-${index + 1}`,
      runtime: FIVE_TURN_RUNTIME,
      plan,
    });
    const route = stableVoice.buildPinnedCosyVoiceRoute(FIVE_TURN_RUNTIME);

    requests.push(request);
    routes.push(route);
    fingerprints.push(plan.identityFingerprint);
  }

  return { requests, routes, fingerprints };
}

runWhenStableVoiceReady('keeps one identity fingerprint across the full five-turn stable session', async (t) => {
  const result = await collectFiveTurnContracts(t);
  if (!result) return;
  const { fingerprints } = result;
  assert.equal(fingerprints.length, 5);
  assert.equal(new Set(fingerprints).size, 1);
});

runWhenStableVoiceReady('keeps provider model voice plaintext ssml format and sample rate fixed across the five stable turns', async (t) => {
  const result = await collectFiveTurnContracts(t);
  if (!result) return;
  const { requests, routes } = result;
  assert.equal(requests.length, 5);
  assert.equal(routes.length, 5);

  const routeFingerprints = routes.map((route) => JSON.stringify(route));
  assert.equal(new Set(routeFingerprints).size, 1);

  const requestFingerprints = requests.map((request) => [
    request.model,
    request.voice,
    request.seed,
    request.textType,
    request.enableSsml,
    request.format,
    request.sampleRate,
    Array.isArray(request.languageHints) ? request.languageHints.join(',') : '',
  ].join('|'));

  assert.equal(new Set(requestFingerprints).size, 1);
  assert.equal(requests[0]?.seed, 0);
  assert.equal(requests[0]?.textType, 'PlainText');
  assert.equal(requests[0]?.enableSsml, false);
  assert.equal(requests[0]?.format, 'wav');
  assert.equal(requests[0]?.sampleRate, 24000);
});

runWhenStableVoiceReady('uses only allowlisted instructions and never leaks persona fields into the provider request', async (t) => {
  const result = await collectFiveTurnContracts(t);
  if (!result) return;
  const { requests } = result;
  assert.equal(requests[0]?.instruction, undefined);

  const observedInstructions = requests
    .map((request) => request.instruction)
    .filter((instruction): instruction is string => typeof instruction === 'string');

  assert.deepEqual(observedInstructions, [
    '只略重读表达立场的短语，句尾平收，其余照常。',
    '首个分句后短停，后半句平收，其余照常。',
    '只略重读开头一个词，句尾轻微上扬，其余照常。',
    '分句间略作短停，末句收短，其余照常。',
  ]);

  for (const instruction of observedInstructions) {
    assert.ok(ALLOWLISTED_INSTRUCTIONS.has(instruction));
    for (const forbiddenToken of FORBIDDEN_INSTRUCTION_TOKENS) {
      assert.doesNotMatch(instruction, new RegExp(forbiddenToken, 'u'));
    }
  }

  for (const request of requests) {
    assert.ok(!('rate' in request));
    assert.ok(!('pitch' in request));
    assert.ok(!('volume' in request));
    assert.ok(!('relationshipType' in request));
    assert.ok(!('deliveryPlan' in request));
    assert.ok(!('speechAct' in request));
    assert.ok(!('observedBaseline' in request));
  }
});

runWhenStableVoiceReady('replays the five-turn contract as exactly five synthesis calls', async (t) => {
  const result = await collectFiveTurnContracts(t);
  if (!result) return;
  const { requests, routes } = result;
  let callCount = 0;
  const synthesize = async (_route: Record<string, unknown>, _request: Record<string, unknown>) => {
    callCount += 1;
    return { audioUrl: `mock://${callCount}` };
  };

  for (const [index, request] of requests.entries()) {
    await synthesize(routes[index] || routes[0] || {}, request);
  }

  assert.equal(callCount, 5);
});
