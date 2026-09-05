import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { compileVoiceChatMessages } from '../../apps/worker/src/chat/voice-chat-context.js';
import { evaluateCharacterGenerationQuality } from '../../apps/worker/src/chat/generation-quality.js';
import { DashscopeChatProvider } from '../../apps/worker/src/providers/dashscope-chat.js';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import { summarizeObservedSpeech } from '../../apps/worker/src/providers/aliyun-speaker-diarization.js';
import { observedPersonEvidenceFromQualityReport } from '../../apps/worker/src/observed-person-evidence.js';
import {
  buildIdentityStableVoicePlan,
  buildRegisteredCloneRuntime,
  toCosyVoiceProviderRequest,
} from '../../apps/worker/src/stable-voice.js';
import { probeWav } from '../../apps/worker/src/media/ffmpeg.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const beforeRoot = path.join(root, 'work/acceptance/self-real-dialogue-off-ten-20260905');
const outputRoot = path.resolve(
  process.env.AIVOICE_SPEECH_HABIT_AB_OUTPUT
    || path.join(root, 'work/acceptance/self-speech-habit-before-after-ten-20260905'),
);

if (process.argv.includes('--help')) {
  process.stdout.write([
    'speech-habit-before-after-ten.mts',
    '',
    'Builds a paired owner-listening package from the preserved ten OFF samples.',
    'It uses the already-retained ASR transcript, makes exactly ten text calls',
    'and ten OFF TTS calls, performs no ASR, enrollment, database write or point charge.',
  ].join('\n'));
  process.exit(0);
}

if (!fs.existsSync(path.join(beforeRoot, 'manifest.json'))) {
  throw new Error(`Preserved baseline package is missing: ${beforeRoot}`);
}
if (fs.existsSync(outputRoot) && (await fsp.readdir(outputRoot)).length) {
  throw new Error(`Output directory is not empty: ${outputRoot}`);
}

const readEnv = (filePath: string) => fs.existsSync(filePath)
  ? parseDotEnv(fs.readFileSync(filePath))
  : {};
const localEnv = readEnv(path.join(root, '.env.local'));
const aliyunEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
Object.assign(process.env, localEnv, aliyunEnv);
process.env.CHAT_MODEL = String(localEnv.CHAT_MODEL || process.env.CHAT_MODEL || 'qwen3.8-max').trim();
process.env.DASHSCOPE_API_HOST = String(localEnv.DASHSCOPE_API_HOST || process.env.DASHSCOPE_API_HOST || '').trim();
process.env.DASHSCOPE_API_KEY = String(aliyunEnv.DASHSCOPE_API_KEY || localEnv.DASHSCOPE_API_KEY || '').trim();
if (!process.env.DASHSCOPE_API_HOST || !process.env.DASHSCOPE_API_KEY) {
  throw new Error('DashScope configuration is missing');
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

function quoteUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return `'${value}'::uuid`;
}

function parsedJson(value: unknown): any {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function hanCount(value: string): number {
  return Array.from(value).filter((character) => /\p{Script=Han}/u.test(character)).length;
}

function sourceAssetId(qualityReport: Record<string, any>): string {
  return String(
    qualityReport.sourceSpeakerCheck?.sourceMediaId
      || qualityReport.source_speaker_check?.source_media_id
      || 'retained-reference-artifact',
  );
}

function offlineEvidence(input: {
  transcript: string;
  durationMs: number;
  profileId: string;
  clipStartMs: number;
  clipEndMs: number;
  assetId: string;
}) {
  const sentenceTexts = input.transcript.match(/[^。！？!?]+[。！？!?]?/gu)
    ?.map((value) => value.trim()).filter(Boolean) || [input.transcript];
  const totalCharacters = sentenceTexts.reduce((sum, value) => sum + Math.max(1, hanCount(value)), 0);
  let cursor = 0;
  const segments = sentenceTexts.map((sentence, index) => {
    const endMs = index === sentenceTexts.length - 1
      ? input.durationMs
      : cursor + Math.round(input.durationMs * Math.max(1, hanCount(sentence)) / totalCharacters);
    const segment = { speakerId: '0', beginMs: cursor, endMs, text: sentence };
    cursor = endMs;
    return segment;
  });
  const speechEvidence = summarizeObservedSpeech(segments, 0, input.durationMs);
  if (!speechEvidence) throw new Error('Retained transcript could not produce offline V2 evidence');
  return {
    sourceSpeakerCheck: {
      version: 'observed-evidence/2',
      passed: true,
      acceptable: true,
      provider: 'retained-acceptance-artifact',
      model: 'existing-transcript-only',
      scope: {
        assetId: input.assetId,
        selectionId: `${input.profileId}:${input.clipStartMs}-${input.clipEndMs}:offline-ab`,
        asrTaskId: 'retained:source-transcript.json',
        localSpeakerId: '0',
        selectionStartMs: input.clipStartMs,
        selectionEndMs: input.clipEndMs,
        windowStartMs: 0,
        windowEndMs: input.durationMs,
        targetOnly: true,
        knownOverlap: false,
        originalTimeline: false,
      },
      speechEvidence,
    },
  };
}

async function normalizeForBlind(inputPath: string, outputPath: string): Promise<void> {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const analysis = await execFileAsync(ffmpeg, [
    '-hide_banner', '-nostdin', '-i', inputPath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
  ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const statsText = analysis.stderr.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/u)?.[0];
  if (!statsText) throw new Error(`Could not measure loudness for ${inputPath}`);
  const stats = JSON.parse(statsText) as Record<string, string>;
  const measured = [
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
  ].join(':');
  await execFileAsync(ffmpeg, [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-af', `loudnorm=I=-16:TP=-1.5:LRA=11:${measured}:linear=true`,
    '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    outputPath,
  ], { timeout: 60_000 });
}

const technicalCalls = JSON.parse(await fsp.readFile(
  path.join(beforeRoot, '_private/technical-calls.json'),
  'utf8',
)) as Array<{ messageId: string }>;
const beforeManifest = JSON.parse(await fsp.readFile(path.join(beforeRoot, 'manifest.json'), 'utf8')) as {
  samples: Array<{ turn: number; file: string; userText: string; replyText: string }>;
};
if (technicalCalls.length !== 10 || beforeManifest.samples.length !== 10) {
  throw new Error('The preserved baseline must contain exactly ten turns');
}

const statePath = process.env.AIVOICE_CLOUDBASE_STATE || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
const credentialPath = process.env.CLOUDBASE_CREDENTIALS_FILE || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { envId: string; providerEncryptionKey: string };
const credentials = parseDotEnv(fs.readFileSync(credentialPath));
const manager = new CloudBase({
  envId: state.envId,
  region: 'ap-shanghai',
  secretId: credentials.TENCENTCLOUD_SECRETID,
  secretKey: credentials.TENCENTCLOUD_SECRETKEY,
});

const firstMessageId = technicalCalls[0].messageId;
const profileResult = await manager.database.executePGSql({
  Sql: `SELECT vp.id::text,vp.name,vp.relationship_type::text,vp.relationship_label,vp.user_address,
    vp.age_years,vp.gender::text,vp.user_age_years,vp.user_life_stage::text,vp.background,
    vp.relationship_note,vp.personality_note,vp.speech_habit_note,vp.quality_report::text,
    vp.clip_start_ms,vp.clip_end_ms,vm.provider,vm.target_model,vm.provider_voice_id_encrypted
    FROM messages m JOIN voice_profiles vp ON vp.id=m.voice_profile_id
    JOIN voice_models vm ON vm.voice_profile_id=vp.id AND vm.status='READY'
    WHERE m.id=${quoteUuid(firstMessageId)} LIMIT 1`,
});
if (!profileResult.Rows?.[0]) throw new Error('Profile for preserved dialogue was not found');
const [
  profileId, voiceName, relationshipType, relationshipLabel, userAddress,
  ageYears, gender, userAgeYears, userLifeStage, background,
  relationshipNote, personalityNote, speechHabitNote, qualityReportText,
  clipStartMs, clipEndMs, storedProvider, storedModel, encryptedVoiceId,
] = JSON.parse(profileResult.Rows[0]) as string[];

const allMessageResult = await manager.database.executePGSql({
  Sql: `SELECT id::text,created_at::text,conversation_id::text,input_text,output_text,interaction_state::text
    FROM messages WHERE voice_profile_id=${quoteUuid(profileId)} AND mode='CHAT' AND status='READY'
    ORDER BY created_at,id`,
});
const allMessages = (allMessageResult.Rows || []).map((row) => {
  const [messageId, createdAt, conversationId, inputText, outputText, interactionState] = JSON.parse(row) as string[];
  return { messageId, createdAt, conversationId, inputText, outputText, interactionState: parsedJson(interactionState) };
});

const qualityReport = parsedJson(qualityReportText) || {};
const referencePath = path.join(beforeRoot, '00-reference.wav');
const referenceProbe = await probeWav(referencePath);
const transcriptRows = JSON.parse(await fsp.readFile(
  path.join(root, 'work/acceptance/self-voice-five-blind-20260904/_private/source-transcript.json'),
  'utf8',
)) as Array<{ text: string }>;
const evidenceReport = offlineEvidence({
  transcript: String(transcriptRows[0]?.text || ''),
  durationMs: referenceProbe.durationMs,
  profileId,
  clipStartMs: Number(clipStartMs),
  clipEndMs: Number(clipEndMs),
  assetId: sourceAssetId(qualityReport),
});
const observedPersonEvidence = observedPersonEvidenceFromQualityReport(evidenceReport);
if (!observedPersonEvidence || observedPersonEvidence.clauseCharacters.use !== 'TEXT_SOFT') {
  throw new Error('The retained transcript did not qualify for the text-style A/B lane');
}

const voiceId = decryptProviderBinding(encryptedVoiceId, state.providerEncryptionKey);
const previousTargetModel = process.env.AIVOICE_TARGET_MODEL;
process.env.AIVOICE_TARGET_MODEL = storedModel;
const voiceProvider = new AliyunCosyVoiceProvider();
const chatProvider = new DashscopeChatProvider();
const runtime = buildRegisteredCloneRuntime({
  storedProvider,
  storedModel,
  providerName: voiceProvider.providerName,
  providerTargetModel: voiceProvider.targetModel,
  voiceId,
  continuity: 'MULTI_TURN',
  endpoint: process.env.DASHSCOPE_API_HOST,
});

await Promise.all([
  fsp.mkdir(path.join(outputRoot, 'before'), { recursive: true }),
  fsp.mkdir(path.join(outputRoot, 'after'), { recursive: true }),
  fsp.mkdir(path.join(outputRoot, 'blind'), { recursive: true }),
  fsp.mkdir(path.join(outputRoot, '_private'), { recursive: true }),
]);
await fsp.copyFile(referencePath, path.join(outputRoot, '00-reference.wav'));

const afterSamples: Array<Record<string, unknown>> = [];
const callEvidence: Array<Record<string, unknown>> = [];
const answerKey: Array<Record<string, unknown>> = [];
try {
  for (const [index, target] of technicalCalls.entries()) {
    const baseline = beforeManifest.samples[index];
    const targetIndex = allMessages.findIndex((message) => message.messageId === target.messageId);
    if (targetIndex < 0) throw new Error(`Frozen message not found: turn ${index + 1}`);
    const current = allMessages[targetIndex];
    const history = allMessages.slice(0, targetIndex)
      .filter((message) => message.conversationId === current.conversationId)
      .slice(-8)
      .map((message) => ({
        messageId: message.messageId,
        mode: 'CHAT' as const,
        inputText: message.inputText,
        outputText: message.outputText,
        interactionState: message.interactionState,
      }));
    const context = compileVoiceChatMessages({
      structuredOutput: true,
      currentMessageId: current.messageId,
      voiceName,
      ageYears: Number(ageYears),
      gender: gender as 'FEMALE' | 'MALE',
      userAgeYears: userAgeYears === null ? null : Number(userAgeYears),
      userLifeStage: (userLifeStage || null) as 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT' | null,
      relationshipType: relationshipType as 'SELF',
      relationshipLabel,
      userAddress,
      background,
      relationshipNote,
      personalityNote,
      speechHabitNote,
      observedPersonEvidence,
      persistedPersonCorrections: [],
      history,
      currentInput: current.inputText,
    });
    const freeze = {
      role: 'system' as const,
      content: [
        '<offline_ab_frozen_meaning>',
        `基线台词：${baseline.replyText}`,
        '这是离线前后对比的冻结语义目标。保持其中事实、否定、承诺、请求范围、人物关系和回答意图不变；只允许按speech_habit_text_style重新组织自然措辞和分句。不要逐字解释改写过程。',
        '</offline_ab_frozen_meaning>',
      ].join('\n'),
    };
    const messages = [...context.messages.slice(0, -1), freeze, context.messages.at(-1)!];
    const generated = await chatProvider.reply(messages, { maxAttempts: 1, temperature: 0.55 });
    const quality = evaluateCharacterGenerationQuality({
      generation: generated,
      currentUserText: current.inputText,
      relationshipType: relationshipType as 'SELF',
      subjectBackground: background,
      recentUserInputs: history.map((row) => row.inputText),
      recentCharacterReplies: history.map((row) => row.outputText),
      currentTurn: context.currentTurn,
      recentTurns: context.recentTurns,
      previousState: context.previousInteractionState,
      control: context.runtimeDialogueControl,
      personalityTurnFocus: context.personalityTurnFocus,
      profile: { personalityNote, speechHabitNote, relationshipNote },
    });
    if (quality.retryReasons.length) {
      throw new Error(`Turn ${index + 1} failed the existing no-retry quality gate: ${quality.retryReasons.join(',')}`);
    }

    const plan = buildIdentityStableVoicePlan({
      text: quality.outputText,
      delivery: { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'CONNECTED_SHORT' },
      runtime,
      emotionMode: 'OFF',
    });
    const request = toCosyVoiceProviderRequest({
      jobId: `speech-habit-ab-${index + 1}`,
      messageId: current.messageId,
      runtime,
      plan,
    });
    const startedAt = Date.now();
    const audio = await voiceProvider.synthesizeStable(request);
    const turn = String(index + 1).padStart(2, '0');
    const beforePath = path.join(outputRoot, 'before', `${turn}.wav`);
    const afterPath = path.join(outputRoot, 'after', `${turn}.wav`);
    const preservedBeforePath = path.join(beforeRoot, baseline.file);
    const beforeAudio = await fsp.readFile(preservedBeforePath);
    const beforeSha256 = crypto.createHash('sha256').update(beforeAudio).digest('hex');
    const afterSha256 = crypto.createHash('sha256').update(audio).digest('hex');
    await fsp.copyFile(preservedBeforePath, beforePath);
    await fsp.writeFile(afterPath, audio);
    const afterProbe = await probeWav(afterPath);

    const beforeIsX = crypto.randomInt(0, 2) === 0;
    const xSource = beforeIsX ? beforePath : afterPath;
    const ySource = beforeIsX ? afterPath : beforePath;
    await normalizeForBlind(xSource, path.join(outputRoot, 'blind', `${turn}-X.wav`));
    await normalizeForBlind(ySource, path.join(outputRoot, 'blind', `${turn}-Y.wav`));
    answerKey.push({ turn: index + 1, X: beforeIsX ? 'BEFORE' : 'AFTER', Y: beforeIsX ? 'AFTER' : 'BEFORE' });
    afterSamples.push({
      turn: index + 1,
      userText: current.inputText,
      beforeText: baseline.replyText,
      afterText: quality.outputText,
      textChanged: baseline.replyText !== quality.outputText,
      audioBitIdentical: beforeSha256 === afterSha256,
      beforeSha256,
      afterSha256,
      afterFile: `after/${turn}.wav`,
      durationMs: afterProbe.durationMs,
      bytes: audio.length,
      elapsedMs: Date.now() - startedAt,
      qualitySignals: quality.qualitySignals,
    });
    callEvidence.push({
      turn: index + 1,
      textCalls: 1,
      ttsCalls: 1,
      asrCalls: 0,
      enrollmentCalls: 0,
      pointCharges: 0,
      chatModel: chatProvider.modelName,
      ttsModel: request.model,
      voiceIdSha256: crypto.createHash('sha256').update(request.voice).digest('hex'),
      identityFingerprint: plan.identityFingerprint,
      seed: request.seed,
      textType: request.textType,
      enableSsml: request.enableSsml,
      instruction: request.instruction ?? null,
      format: request.format,
      sampleRate: request.sampleRate,
    });
  }
} finally {
  if (previousTargetModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousTargetModel;
}

const voiceHashes = new Set(callEvidence.map((row) => row.voiceIdSha256));
const identityFingerprints = new Set(callEvidence.map((row) => row.identityFingerprint));
const fixedOffContract = callEvidence.every((row) => row.seed === 0
  && row.textType === 'PlainText'
  && row.enableSsml === false
  && row.instruction === null
  && row.format === 'wav'
  && row.sampleRate === 24_000);
if (afterSamples.length !== 10 || callEvidence.length !== 10
  || voiceHashes.size !== 1 || identityFingerprints.size !== 1 || !fixedOffContract) {
  throw new Error('The paired package failed its call-count or stable-voice contract');
}

await fsp.writeFile(path.join(outputRoot, '_private/answer-key.json'), `${JSON.stringify(answerKey, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, '_private/technical-calls.json'), `${JSON.stringify(callEvidence, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'READY_FOR_OWNER_REVIEW',
  sourceBaseline: path.relative(root, beforeRoot).replaceAll('\\', '/'),
  preservedBaselineUntouched: true,
  textModelCalls: 10,
  ttsCalls: 10,
  asrCalls: 0,
  enrollmentCalls: 0,
  pointCharges: 0,
  evidenceSource: 'retained source-transcript.json; not written to production profile',
  textPolicyVersion: 'text-style/1',
  fingerprintVersion: 'shf/1.0',
  fixedOffContract,
  identityFingerprintStable: identityFingerprints.size === 1,
  registeredVoiceStable: voiceHashes.size === 1,
  changedTextCount: afterSamples.filter((row) => row.textChanged === true).length,
  bitIdenticalControlPairCount: afterSamples.filter((row) => row.audioBitIdentical === true).length,
  samples: afterSamples,
}, null, 2)}\n`);

const directRows = afterSamples.map((row) =>
  `| ${String(row.turn).padStart(2, '0')} | ${String(row.userText).replaceAll('|', '｜')} | ${String(row.beforeText).replaceAll('|', '｜')} | ${String(row.afterText).replaceAll('|', '｜')} |  |  |  |`,
).join('\n');
await fsp.writeFile(path.join(outputRoot, '前后对比与评分.md'), `# 本人声音10轮前后对比\n\n旧音频在 \`before/\`，新音频在 \`after/\`。两组都使用同一已注册音色、seed=0、PlainText、SSML=false、无 instruction。区别只来自回复文本是否使用安全 SpeechHabitFingerprint 文本策略。\n\n| 轮次 | 用户说 | 修改前台词 | 修改后台词 | 修改前 /100 | 修改后 /100 | 是否更像本人 |\n|---|---|---|---|---:|---:|---|\n${directRows}\n\n评分重点：音色身份、自然度、说话习惯相似度，以及是否始终像同一个人。\n`);

const blindRows = afterSamples.map((row) =>
  `| ${String(row.turn).padStart(2, '0')} | ${String(row.userText).replaceAll('|', '｜')} |  |  |  |  |  |`,
).join('\n');
await fsp.writeFile(path.join(outputRoot, '盲测评分.md'), `# 本人声音10轮 X/Y 盲测\n\n每轮的 X/Y 已统一到约 -16 LUFS，并随机隐藏修改前后。先不要打开 \`_private/answer-key.json\`。\n\n| 轮次 | 用户说 | X身份/自然/习惯 | Y身份/自然/习惯 | 更像本人 | 是否同一个人 | 备注 |\n|---|---|---|---|---|---|---|\n${blindRows}\n\n硬门槛：任何一轮听成不同的人，或出现明显年龄、性别、口音漂移，整组不通过。\n`);

process.stdout.write(`${JSON.stringify({
  status: 'READY_FOR_OWNER_REVIEW',
  outputRoot,
  preservedBaseline: beforeRoot,
  textModelCalls: 10,
  ttsCalls: 10,
  asrCalls: 0,
  enrollmentCalls: 0,
  fixedOffContract,
}, null, 2)}\n`);
