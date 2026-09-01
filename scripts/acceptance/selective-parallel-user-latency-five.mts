import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/src/chat/voice-chat-context.js';
import { normalizeInteractionStateDetailed } from '../../apps/worker/src/chat/interaction-state.js';
import { buildEmotionExpressionPlan } from '../../apps/worker/src/emotion-expression.js';
import { observedSpeechPlanBaseline } from '../../apps/worker/src/observed-person-evidence.js';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import { DashscopeChatProvider } from '../../apps/worker/src/providers/dashscope-chat.js';
import { createVoiceProviderRegistry } from '../../apps/worker/src/providers/voice-provider-registry.js';
import { VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';
import { buildSpeechSynthesisPlan } from '../../apps/worker/src/speech-instruction.js';
import { VoiceGenerationCoordinator } from '../../apps/worker/src/voice-generation-coordinator.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(root, '.env.local'));
const aliyunEnv = readEnv('D:/lyh/secrets/aivoice/aliyun.env');
const seedEnv = readEnv('D:/lyh/secrets/aivoice/byteplus.env');
Object.assign(process.env, baseEnv, aliyunEnv, seedEnv, {
  AIVOICE_TARGET_MODEL: 'cosyvoice-v3.5-plus',
  CHAT_MODEL: baseEnv.CHAT_MODEL || 'qwen3.8-max',
});

const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const outputRoot = path.join(root, 'work/acceptance/selective-parallel-user-latency-five');
await fsp.mkdir(outputRoot, { recursive: true });

const profile = {
  voiceName: '小雨', ageYears: 12, gender: 'FEMALE' as const, userAgeYears: 40,
  relationshipType: 'CHILD' as const, relationshipLabel: '', userAddress: '妈妈',
  background: '正在读六年级。',
  relationshipNote: '母女关系亲近，妈妈平时提醒较多；女儿可能顶一句，但通常愿意把事情说清楚。',
  personalityNote: '有自己的主意，被误解时会马上解释；嘴硬心软；爱开玩笑；愿意亲近妈妈，但不喜欢被当成很小的孩子哄。',
  speechHabitNote: '日常多用短句，常说“等一下”“不是那个意思”；有时会改口，不使用完整礼貌收尾。',
};
const prompts = [
  '我今天可能会晚一点回来。',
  '我把你准备了很久的东西弄丢了，你别生气。',
  '你自己的事情不用解释，明天我替你决定。',
  '你今天这么听话，是不是有事求我？',
  '你哭也没用，我现在不想听你解释。',
];
const pageSubmitMs = 2_642;
const publishAndFirstPollMs = 1_100;
const primaryPersistAndPollMs = 1_200;
const upgradePersistMs = 400;

const chat = new DashscopeChatProvider();
const cosy = new AliyunCosyVoiceProvider();
const seed = new VolcengineSeedAudioProvider();
const registry = createVoiceProviderRegistry({ active: cosy, registered: cosy, companions: [seed] });
const coordinator = new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL');
const voiceId = await cosy.enroll(referencePath, `du${Date.now().toString(36)}`.slice(0, 10));
const observed = {
  transcriptExcerpt: '其实我也蛮开心的。', charactersPerSecond: 4.212, medianSentenceCharacters: 14,
  speechRate: 'MEDIUM' as const, pauseStyle: 'MEDIUM' as const, volumeStyle: 'MEDIUM' as const,
  pitchStyle: 'WIDE' as const, volumeDynamicsStyle: 'DYNAMIC' as const,
  sentenceEndingStyle: 'UNKNOWN' as const, sentenceEndingEnergyStyle: 'STRONGER' as const,
  pitchMedianHz: 233.01, pitchRangeSemitones: 10.914, volumeDynamicRangeDb: 15.433,
  sentenceFinalPitchDeltaSemitones: 0, sentenceFinalEnergyDeltaDb: 4.248,
  sampleAffectCues: [], recurringPhrases: [], activeSpeechRatio: 0.8, averagePauseMs: 320,
};
const baseline = observedSpeechPlanBaseline(observed);
const voiceObservedBaseline = {
  speechRate: observed.speechRate,
  pauseStyle: observed.pauseStyle,
  pitchStyle: observed.pitchStyle,
  sentenceEndingStyle: observed.sentenceEndingStyle,
  volumeDynamicsStyle: observed.volumeDynamicsStyle,
};
const results = [];
try {
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index];
    const context = compileVoiceChatMessages({
      structuredOutput: true,
      currentMessageId: `latency-${index + 1}`,
      ...profile,
      history: [],
      currentInput: prompt,
    });
    const qwenStartedAt = Date.now();
    const generated = await chat.reply(context.messages);
    const qwenMs = Date.now() - qwenStartedAt;
    const normalized = normalizeInteractionStateDetailed({
      candidate: generated.interactionState,
      replyTone: generated.replyTone,
      reply: generated.reply,
      currentTurn: context.currentTurn,
      recentTurns: context.recentTurns,
      previousState: context.previousInteractionState,
      control: context.runtimeDialogueControl,
      profile: {
        personalityNote: profile.personalityNote,
        speechHabitNote: profile.speechHabitNote,
        relationshipNote: profile.relationshipNote,
      },
    });
    const expression = buildEmotionExpressionPlan({
      replyTone: generated.replyTone,
      text: generated.reply,
      interactionState: normalized.state,
      personalityNote: profile.personalityNote,
      personalityTurnFocus: context.personalityTurnFocus,
    });
    const speechPlan = buildSpeechSynthesisPlan(generated.replyTone, generated.reply, baseline, expression);
    const session = await coordinator.generate({
      mode: 'CHAT',
      visibleText: generated.reply,
      synthesisText: speechPlan.text,
      expression,
      registeredBinding: voiceId,
      resolveReference: async () => referencePath,
      options: {
        instruction: speechPlan.instruction,
        rate: speechPlan.rate,
        pitch: speechPlan.pitch,
        volume: speechPlan.volume,
        enableSsml: speechPlan.enableSsml,
        relationshipType: profile.relationshipType,
        deliveryMode: expression.deliveryMode,
        speechAct: expression.speechAct,
        observedBaseline: voiceObservedBaseline,
      },
    });
    const primaryPath = path.join(outputRoot, `${index + 1}-primary-${session.primary.id}.wav`);
    await fsp.writeFile(primaryPath, session.primary.audio);
    const upgrade = await session.bestUpgrade;
    const upgradePath = upgrade ? path.join(outputRoot, `${index + 1}-upgrade-${upgrade.id}.wav`) : '';
    if (upgrade) await fsp.writeFile(upgradePath, upgrade.audio);

    const textVisibleMs = pageSubmitMs + qwenMs + publishAndFirstPollMs;
    const primaryAfterTextMs = session.primary.elapsedMs + primaryPersistAndPollMs;
    const upgradeAfterTextMs = upgrade ? upgrade.elapsedMs + upgradePersistMs : null;
    const readingMs = Math.max(2_500, Math.round(Array.from(generated.reply).length / 6 * 1_000));
    const providerAtClick = upgrade && upgradeAfterTextMs !== null && upgradeAfterTextMs <= readingMs
      ? upgrade.id
      : session.primary.id;
    const perceivedWaitAfterReadingMs = Math.max(0, primaryAfterTextMs - readingMs);
    const result = {
      round: index + 1,
      prompt,
      reply: generated.reply,
      replyTone: generated.replyTone,
      intensity: expression.intensity,
      deliveryMode: expression.deliveryMode,
      speechAct: expression.speechAct,
      parallelTriggered: Boolean(upgrade) || registry.companions.some((item) => item.id === session.primary.id),
      qwenMs,
      textVisibleMs,
      primaryProvider: session.primary.id,
      primaryProviderMs: session.primary.elapsedMs,
      primaryAfterTextMs,
      upgradeProvider: upgrade?.id || null,
      upgradeProviderMs: upgrade?.elapsedMs || null,
      upgradeAfterTextMs,
      simulatedReadingMs: readingMs,
      providerAtFirstClick: providerAtClick,
      perceivedWaitAfterReadingMs,
      primaryPath,
      upgradePath,
    };
    results.push(result);
    console.log(JSON.stringify({ event: 'selective_parallel_latency_round', ...result }));
  }
} finally {
  await cosy.deleteVoice(voiceId).catch(() => undefined);
}

const average = (key: keyof typeof results[number]) => {
  const values = results.map((item) => Number(item[key])).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  pageAssumptions: { pageSubmitMs, publishAndFirstPollMs, primaryPersistAndPollMs, upgradePersistMs },
  rounds: results,
  summary: {
    parallelRounds: results.filter((item) => item.parallelTriggered).length,
    averageTextVisibleMs: average('textVisibleMs'),
    averagePrimaryAfterTextMs: average('primaryAfterTextMs'),
    averagePerceivedWaitAfterReadingMs: average('perceivedWaitAfterReadingMs'),
    seedUsedAtFirstClick: results.filter((item) => item.providerAtFirstClick.includes('seed')).length,
  },
};
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ event: 'selective_parallel_latency_summary', ...report.summary }));
