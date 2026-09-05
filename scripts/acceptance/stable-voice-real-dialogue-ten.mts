import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import {
  buildIdentityStableVoicePlan,
  buildRegisteredCloneRuntime,
  toCosyVoiceProviderRequest,
} from '../../apps/worker/src/stable-voice.js';
import { probeWav } from '../../apps/worker/src/media/ffmpeg.js';

if (process.argv.includes('--help')) {
  process.stdout.write([
    'stable-voice-real-dialogue-ten.mts',
    '',
    'Required env:',
    '  AIVOICE_STABLE_VOICE_PROFILE_ID',
    '',
    'Optional env:',
    '  AIVOICE_STABLE_REAL_DIALOGUE_OUTPUT',
    '',
    'Uses the ten most recent READY chat replies, makes no text-model call,',
    'and performs exactly ten OFF-mode TTS calls with the existing binding.',
  ].join('\n'));
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath)
  ? parseDotEnv(fs.readFileSync(filePath))
  : {};
Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env'),
);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

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

const profileId = required('AIVOICE_STABLE_VOICE_PROFILE_ID');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(profileId)) {
  throw new Error('AIVOICE_STABLE_VOICE_PROFILE_ID must be a UUID');
}
const outputRoot = path.resolve(
  process.env.AIVOICE_STABLE_REAL_DIALOGUE_OUTPUT
    || path.join(root, 'work/acceptance/self-real-dialogue-off-ten-20260905'),
);
await fsp.mkdir(outputRoot, { recursive: true });
if ((await fsp.readdir(outputRoot)).some((name) => /^\d{2}\.wav$/u.test(name))) {
  throw new Error(`output already contains generated WAV files: ${outputRoot}`);
}

const statePath = process.env.AIVOICE_CLOUDBASE_STATE
  || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
const credentialPath = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
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

const bindingResult = await manager.database.executePGSql({
  Sql: `SELECT provider,target_model,provider_voice_id_encrypted FROM voice_models WHERE voice_profile_id='${profileId}'::uuid AND status='READY' LIMIT 1`,
});
if (!bindingResult.Rows?.[0]) throw new Error('The requested voice profile has no READY provider binding');
const [storedProvider, storedModel, encryptedVoiceId] = JSON.parse(bindingResult.Rows[0]) as [string, string, string];
const voiceId = decryptProviderBinding(encryptedVoiceId, String(state.providerEncryptionKey || ''));

const dialogueResult = await manager.database.executePGSql({
  Sql: `SELECT id::text,created_at::text,input_text,output_text FROM messages WHERE voice_profile_id='${profileId}'::uuid AND mode='CHAT' AND status='READY' AND output_text<>'' ORDER BY created_at DESC LIMIT 10`,
});
const dialogue = (dialogueResult.Rows || []).map((raw) => {
  const [messageId, createdAt, userText, replyText] = JSON.parse(raw) as [string, string, string, string];
  return { messageId, createdAt, userText, replyText };
}).reverse();
if (dialogue.length !== 10) throw new Error(`Expected 10 ready chat turns, found ${dialogue.length}`);
if (new Set(dialogue.map((turn) => turn.replyText)).size !== 10) {
  throw new Error('The selected real dialogue replies are not ten distinct texts');
}

const previousTargetModel = process.env.AIVOICE_TARGET_MODEL;
process.env.AIVOICE_TARGET_MODEL = storedModel;
const provider = new AliyunCosyVoiceProvider();
const runtime = buildRegisteredCloneRuntime({
  storedProvider,
  storedModel,
  providerName: provider.providerName,
  providerTargetModel: provider.targetModel,
  voiceId,
  continuity: 'MULTI_TURN',
  endpoint: process.env.DASHSCOPE_API_HOST,
});

const technicalCalls: Array<Record<string, unknown>> = [];
const samples: Array<Record<string, unknown>> = [];
try {
  for (const [index, turn] of dialogue.entries()) {
    const turnNumber = index + 1;
    const plan = buildIdentityStableVoicePlan({
      text: turn.replyText,
      delivery: {
        act: 'CASUAL_EXPLAIN',
        affect: 'NEUTRAL',
        intensity: 0,
        cadence: 'CONNECTED_SHORT',
      },
      runtime,
      emotionMode: 'OFF',
    });
    const request = toCosyVoiceProviderRequest({
      jobId: `real-dialogue-off-${turnNumber}`,
      messageId: turn.messageId,
      runtime,
      plan,
    });
    const startedAt = Date.now();
    const audio = await provider.synthesizeStable(request);
    const outputPath = path.join(outputRoot, `${String(turnNumber).padStart(2, '0')}.wav`);
    await fsp.writeFile(outputPath, audio);
    const probe = await probeWav(outputPath);
    const audioSha256 = crypto.createHash('sha256').update(audio).digest('hex');
    technicalCalls.push({
      turn: turnNumber,
      messageId: turn.messageId,
      model: request.model,
      voiceIdSha256: crypto.createHash('sha256').update(request.voice).digest('hex'),
      identityFingerprint: plan.identityFingerprint,
      seed: request.seed,
      textType: request.textType,
      enableSsml: request.enableSsml,
      format: request.format,
      sampleRate: request.sampleRate,
      instruction: request.instruction ?? null,
      originalReplySha256: crypto.createHash('sha256').update(turn.replyText).digest('hex'),
      synthesisTextSha256: crypto.createHash('sha256').update(request.text).digest('hex'),
    });
    samples.push({
      turn: turnNumber,
      file: path.basename(outputPath),
      createdAt: turn.createdAt,
      userText: turn.userText,
      replyText: turn.replyText,
      synthesisText: request.text,
      durationMs: probe.durationMs,
      bytes: audio.length,
      sha256: audioSha256,
      elapsedMs: Date.now() - startedAt,
    });
  }
} finally {
  if (previousTargetModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousTargetModel;
}

const fingerprints = new Set(technicalCalls.map((row) => row.identityFingerprint));
const voiceHashes = new Set(technicalCalls.map((row) => row.voiceIdSha256));
const fixedRequests = technicalCalls.every((row) => row.seed === 0
  && row.textType === 'PlainText'
  && row.enableSsml === false
  && row.format === 'wav'
  && row.sampleRate === 24000
  && row.instruction === null);
if (technicalCalls.length !== 10 || fingerprints.size !== 1 || voiceHashes.size !== 1 || !fixedRequests) {
  throw new Error('Ten-turn stable voice contract failed after generation');
}

const referenceSource = path.join(
  root,
  'work/acceptance/self-voice-five-blind-20260904/_private/source-reference.wav',
);
if (fs.existsSync(referenceSource)) await fsp.copyFile(referenceSource, path.join(outputRoot, '00-reference.wav'));
await fsp.mkdir(path.join(outputRoot, '_private'), { recursive: true });
await fsp.writeFile(
  path.join(outputRoot, '_private', 'technical-calls.json'),
  `${JSON.stringify(technicalCalls, null, 2)}\n`,
);
await fsp.writeFile(
  path.join(outputRoot, 'manifest.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'READY_FOR_OWNER_REVIEW',
    mode: 'OFF',
    source: 'ten most recent ready real chat turns',
    noTextModelCalls: true,
    noNewEnrollment: true,
    noMiniProgramPoints: true,
    exactTtsCallCount: technicalCalls.length,
    distinctReplyTextCount: new Set(samples.map((row) => row.replyText)).size,
    identityFingerprintStable: fingerprints.size === 1,
    registeredVoiceStable: voiceHashes.size === 1,
    fixedRequestContract: fixedRequests,
    samples,
  }, null, 2)}\n`,
);
await fsp.writeFile(
  path.join(outputRoot, '真实对话与评分.md'),
  `# 本人音色真实对话十轮 OFF 验收\n\n本包直接复用最近十条真实聊天回复文本；没有调用文本模型。每轮只调用一次已注册音色合成，完全无 instruction、SSML、语速、音高或音量覆盖。\n\n| 轮次 | 用户说 | 回复文本 | 像不像本人 /100 | 与上一轮同一人 | 年龄感变化 | 性别感变化 | 口音变化 | 备注 |\n|---|---|---|---:|---|---|---|---|---|\n${samples.map((row) => `| ${String(row.turn).padStart(2, '0')} | ${String(row.userText).replaceAll('|', '｜')} | ${String(row.replyText).replaceAll('|', '｜')} |  |  |  |  |  |  |`).join('\n')}\n\n硬规则：任何一轮被判断为不同的人，或出现明显年龄、性别、口音变化，整组失败。\n`,
);

process.stdout.write(`${JSON.stringify({
  status: 'READY_FOR_OWNER_REVIEW',
  outputRoot,
  exactTtsCallCount: 10,
  noTextModelCalls: true,
  noNewEnrollment: true,
  noMiniProgramPoints: true,
  identityFingerprintStable: true,
  registeredVoiceStable: true,
}, null, 2)}\n`);
