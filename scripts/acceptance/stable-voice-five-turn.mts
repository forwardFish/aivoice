import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

if (process.argv.includes('--help')) {
  process.stdout.write(
    [
      'stable-voice-five-turn.mts',
      '',
      'Required env:',
      '  AIVOICE_STABLE_VOICE_ID + AIVOICE_STABLE_MODEL_ID',
      '  or AIVOICE_STABLE_VOICE_PROFILE_ID (reads the existing CloudBase binding)',
      '',
      'Optional env:',
      '  AIVOICE_STABLE_FIVE_TURN_MODE=OFF|SAFE_ONLY|BOUNDED_ALL',
      '  AIVOICE_STABLE_FIVE_TURN_OUTPUT',
      '  AIVOICE_STABLE_FIVE_TURN_REFERENCE_PATH',
      '  AIVOICE_STABLE_LANGUAGE_HINT=zh',
      '  AIVOICE_STABLE_SAMPLE_RATE=24000',
      '',
      'This script reuses one existing registered clone binding for five fixed QA turns.',
    ].join('\n'),
  );
  process.exit(0);
}

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
  toCosyVoiceProviderRequest(input: {
    jobId: string;
    messageId: string;
    runtime: Record<string, unknown>;
    plan: Record<string, unknown>;
  }): Record<string, unknown>;
};

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath)
  ? parseDotEnv(fs.readFileSync(filePath))
  : {};

Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env'),
);

function decryptProviderBinding(value: string, keyText: string): string {
  const key = Buffer.from(keyText, 'base64');
  if (key.length !== 32) throw new Error('CloudBase provider encryption key is invalid');
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('Stored provider binding is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function resolveStoredBinding(): Promise<{
  voiceId: string;
  modelId: string;
  provider: string;
  profileId: string | null;
}> {
  const directVoiceId = process.env.AIVOICE_STABLE_VOICE_ID?.trim();
  const directModelId = process.env.AIVOICE_STABLE_MODEL_ID?.trim();
  if (directVoiceId && directModelId) {
    return { voiceId: directVoiceId, modelId: directModelId, provider: 'aliyun-cosyvoice', profileId: null };
  }
  const profileId = process.env.AIVOICE_STABLE_VOICE_PROFILE_ID?.trim() || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(profileId)) {
    throw new Error('Provide a valid AIVOICE_STABLE_VOICE_PROFILE_ID or the direct voice/model pair');
  }
  const statePath = process.env.AIVOICE_CLOUDBASE_STATE
    || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
  const credentialPath = process.env.CLOUDBASE_CREDENTIALS_FILE
    || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
  if (!fs.existsSync(statePath) || !fs.existsSync(credentialPath)) {
    throw new Error('CloudBase state or credentials are unavailable for stored binding lookup');
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
    envId?: string;
    providerEncryptionKey?: string;
  };
  const credentials = parseDotEnv(fs.readFileSync(credentialPath));
  const manager = new CloudBase({
    envId: state.envId || 'aivoice-d1g94bgoh67c6b974',
    region: 'ap-shanghai',
    secretId: credentials.TENCENTCLOUD_SECRETID,
    secretKey: credentials.TENCENTCLOUD_SECRETKEY,
  });
  const selected = await manager.database.executePGSql({
    Sql: `SELECT provider,target_model,provider_voice_id_encrypted FROM voice_models WHERE voice_profile_id='${profileId}'::uuid AND status='READY' LIMIT 1`,
  });
  if (!selected.Rows?.[0]) throw new Error('The requested voice profile has no READY provider binding');
  const [provider, modelId, encrypted] = JSON.parse(selected.Rows[0]) as [string, string, string];
  return {
    voiceId: decryptProviderBinding(String(encrypted), String(state.providerEncryptionKey || '')),
    modelId: String(modelId),
    provider: String(provider),
    profileId,
  };
}

function modeFromEnvironment(): StableEmotionMode {
  const raw = (process.env.AIVOICE_STABLE_FIVE_TURN_MODE || 'OFF').trim().toUpperCase();
  if (raw === 'OFF' || raw === 'SAFE_ONLY' || raw === 'BOUNDED_ALL') return raw;
  throw new Error(`unsupported AIVOICE_STABLE_FIVE_TURN_MODE: ${raw}`);
}

async function loadStableVoiceModule(): Promise<StableVoiceModule> {
  try {
    const loaded = await import('../../apps/worker/src/stable-voice.js');
    return loaded as StableVoiceModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`stable-voice module is not ready yet: ${message}`);
  }
}

const [
  stableVoice,
  { AliyunCosyVoiceProvider },
  { probeWav },
] = await Promise.all([
  loadStableVoiceModule(),
  import('../../apps/worker/src/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/src/media/ffmpeg.js'),
]);

const mode = modeFromEnvironment();
const outputRoot = path.resolve(
  process.env.AIVOICE_STABLE_FIVE_TURN_OUTPUT
    || path.join(root, `work/acceptance/stable-voice-five-turn-${mode.toLowerCase()}`),
);
const resultsRoot = path.join(outputRoot, mode.toLowerCase());

await fsp.mkdir(resultsRoot, { recursive: true });

const storedBinding = await resolveStoredBinding();
if (storedBinding.provider !== 'aliyun-cosyvoice') {
  throw new Error(`unsupported stored provider: ${storedBinding.provider}`);
}
const previousTargetModel = process.env.AIVOICE_TARGET_MODEL;
const modelId = storedBinding.modelId;
process.env.AIVOICE_TARGET_MODEL = modelId;

const runtime = {
  provider: 'ALIYUN_COSYVOICE',
  region: (process.env.AIVOICE_STABLE_REGION || 'cn-beijing').trim(),
  modelId,
  enrolledForModelId: modelId,
  voiceId: storedBinding.voiceId,
  origin: 'REGISTERED_CLONE',
  continuity: 'MULTI_TURN',
  languageHint: (process.env.AIVOICE_STABLE_LANGUAGE_HINT || 'zh').trim(),
  audioFormat: 'wav',
  sampleRate: Number(process.env.AIVOICE_STABLE_SAMPLE_RATE || '24000'),
};

const FIVE_TURNS: Array<{ id: string; slug: string; text: string; delivery: FiveTurnDelivery }> = [
  {
    id: 'T1',
    slug: 'casual-explain',
    text: '我刚看到，等会儿就弄。',
    delivery: { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'BASELINE' },
  },
  {
    id: 'T2',
    slug: 'assert-boundary',
    text: '这次我想自己决定。',
    delivery: { act: 'ASSERT_BOUNDARY', affect: 'FIRM', intensity: 2, cadence: 'CONNECTED' },
  },
  {
    id: 'T3',
    slug: 'admit-hurt',
    text: '你刚才那句话，我听着还是有点难受。',
    delivery: { act: 'ADMIT_HURT', affect: 'HURT', intensity: 2, cadence: 'SHORT_FIRST_PAUSE' },
  },
  {
    id: 'T4',
    slug: 'express-delight',
    text: '真的啊？那太好了。',
    delivery: { act: 'EXPRESS_DELIGHT', affect: 'DELIGHTED', intensity: 2, cadence: 'QUESTION_LIFT' },
  },
  {
    id: 'T5',
    slug: 'speak-low-energy',
    text: '今天确实有点累，晚点再说吧。',
    delivery: { act: 'SPEAK_LOW_ENERGY', affect: 'TIRED', intensity: 2, cadence: 'TAPERED' },
  },
];

const provider = new AliyunCosyVoiceProvider();
const callLog: Array<Record<string, unknown>> = [];
const outputs: Array<Record<string, unknown>> = [];

try {
  for (const [index, turn] of FIVE_TURNS.entries()) {
    const plan = stableVoice.buildIdentityStableVoicePlan({
      text: turn.text,
      delivery: turn.delivery,
      runtime,
      emotionMode: mode,
    });
    const request = stableVoice.toCosyVoiceProviderRequest({
      jobId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      runtime,
      plan,
    });
    const voiceIdSha256 = crypto.createHash('sha256').update(String(request.voice)).digest('hex');
    const providerContractHash = crypto.createHash('sha256').update(JSON.stringify({
      model: request.model,
      voiceIdSha256,
      text: request.text,
      seed: request.seed,
      textType: request.textType,
      enableSsml: request.enableSsml,
      format: request.format,
      sampleRate: request.sampleRate,
      languageHints: request.languageHints,
      instruction: request.instruction ?? null,
    })).digest('hex');

    const startedAt = Date.now();
    const audio = await provider.synthesizeStable(request as never);

    const outputPath = path.join(resultsRoot, `${turn.id}-${turn.slug}.wav`);
    await fsp.writeFile(outputPath, audio);
    const probe = await probeWav(outputPath);
    const blindSha256 = crypto.createHash('sha256').update(audio).digest('hex');

    callLog.push({
      turnId: turn.id,
      text: turn.text,
      requestModel: request.model,
      requestVoiceIdSha256: voiceIdSha256,
      instruction: request.instruction ?? null,
      requestSeed: request.seed ?? 0,
      requestTextType: request.textType ?? null,
      requestEnableSsml: request.enableSsml ?? false,
      requestFormat: request.format ?? null,
      requestSampleRate: request.sampleRate ?? null,
      requestLanguageHints: request.languageHints ?? null,
      providerContractHash,
      identityFingerprint: plan.identityFingerprint,
    });

    outputs.push({
      turnId: turn.id,
      file: path.basename(outputPath),
      outputPath,
      bytes: audio.length,
      sha256: blindSha256,
      durationMs: probe.durationMs,
      elapsedMs: Date.now() - startedAt,
      act: turn.delivery.act,
      affect: turn.delivery.affect,
      intensity: turn.delivery.intensity,
      instruction: request.instruction ?? null,
      providerContractHash,
      identityFingerprint: plan.identityFingerprint,
    });
  }
} finally {
  if (previousTargetModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousTargetModel;
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'READY_FOR_OWNER_REVIEW',
  mode,
  noMiniProgramPoints: true,
  provider: provider.providerName,
  runtime: {
    ...runtime,
    voiceId: '<redacted>',
    voiceIdSha256: crypto.createHash('sha256').update(runtime.voiceId).digest('hex'),
    profileId: storedBinding.profileId,
  },
  referencePath: process.env.AIVOICE_STABLE_FIVE_TURN_REFERENCE_PATH || null,
  turnCount: FIVE_TURNS.length,
  exactCallCount: callLog.length,
  identityFingerprintStable: new Set(outputs.map((row) => row.identityFingerprint)).size === 1,
  samples: outputs,
};

await fsp.writeFile(
  path.join(resultsRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

await fsp.writeFile(
  path.join(resultsRoot, 'calls.json'),
  `${JSON.stringify(callLog, null, 2)}\n`,
);

await fsp.writeFile(
  path.join(resultsRoot, '评分表.md'),
  [
    '# Stable Voice 五轮评分表',
    '',
    `模式：${mode}`,
    '硬门槛：T1 >= 83；T2-T5 不得比 T1 低 3 分以上；任何一轮都不能被判断为“不是同一个人”。',
    '',
    '| 轮次 | 台词 | 音色身份 /40 | 韵律 /30 | 自然度 /20 | 情绪 /10 | 总分 /100 | 与上一轮是否同一人 | 年龄感变化 | 性别感变化 | 口音变化 | 情绪是否能盲听识别 | 备注 |',
    '|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|---|',
    ...FIVE_TURNS.map((turn) => `| ${turn.id} | ${turn.text} |  |  |  |  |  |  |  |  |  |  |  |`),
    '',
    'DRIFT_AT_T2：如果 T1 像本人但 T2 被判断为不是同一个人，则整组直接失败。',
    '',
    '盲听建议：参考音频 -> T1 -> T2 -> T3 -> T4 -> T5；再做一遍乱序复听。',
  ].join('\n'),
);

process.stdout.write(
  `${JSON.stringify({
    status: manifest.status,
    mode,
    outputRoot: resultsRoot,
    exactCallCount: manifest.exactCallCount,
    identityFingerprintStable: manifest.identityFingerprintStable,
    noMiniProgramPoints: true,
  }, null, 2)}\n`,
);
