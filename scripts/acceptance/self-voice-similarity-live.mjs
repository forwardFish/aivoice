import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim();
process.env.CHAT_MODEL = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY is missing');

const [{ compileVoiceChatMessages }, { DashscopeChatProvider }, generationQualityModule] = await Promise.all([
  import('../../apps/worker/dist/chat/voice-chat-context.js'),
  import('../../apps/worker/dist/providers/dashscope-chat.js'),
  import('../../apps/worker/dist/chat/generation-quality.js'),
]);
const {
  chatTemperatureForFocus,
  evaluateCharacterGenerationQuality,
  qualityRetryMessages,
  withOneQualityRetry,
} = generationQualityModule;
const provider = new DashscopeChatProvider();

const profile = {
  voiceName: '本人', ageYears: 40, gender: 'MALE', userAgeYears: 40,
  relationshipType: 'SELF', relationshipLabel: '', userAddress: '',
  background: '', relationshipNote: '', personalityNote: '',
  speechHabitNote: '说话直接，偶尔顺口调侃。',
};
const userTurns = ['不像本人声音。', '为什么呀？'];
const turns = [];

for (const [index, currentInput] of userTurns.entries()) {
  const context = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: `self-voice-similarity-${index + 1}`,
    ...profile,
    history: turns.map((turn, historyIndex) => ({
      messageId: `self-voice-similarity-${historyIndex + 1}`,
      mode: 'CHAT',
      inputText: turn.user,
      outputText: turn.reply,
      interactionState: turn.interactionState,
    })),
    currentInput,
  });
  const result = await withOneQualityRetry({
    generate: (attempt, previousReasons) => provider.reply(
      attempt === 1 ? context.messages : qualityRetryMessages(context.messages, previousReasons),
      { maxAttempts: 1, temperature: chatTemperatureForFocus(context.personalityTurnFocus) },
    ),
    evaluate: (generation) => evaluateCharacterGenerationQuality({
      generation,
      currentUserText: currentInput,
      relationshipType: profile.relationshipType,
      subjectBackground: profile.background,
      recentUserInputs: turns.map((turn) => turn.user),
      recentCharacterReplies: turns.map((turn) => turn.reply),
      currentTurn: context.currentTurn,
      recentTurns: context.recentTurns,
      previousState: context.previousInteractionState,
      control: context.runtimeDialogueControl,
      personalityTurnFocus: context.personalityTurnFocus,
      profile: {
        personalityNote: profile.personalityNote,
        speechHabitNote: profile.speechHabitNote,
        relationshipNote: profile.relationshipNote,
      },
    }),
    onRetry: (reasons) => process.stdout.write(`turn ${index + 1} retry: ${reasons.join('、')}\n`),
  });
  turns.push({
    user: currentInput,
    reply: result.outputText,
    replyTone: result.replyTone,
    attemptCount: result.attemptCount,
    firstAttemptReasons: result.firstAttemptReasons,
    qualitySignals: result.qualitySignals,
    interactionState: result.interactionState,
  });
}

process.stdout.write(`${JSON.stringify({ model: provider.modelName, turns }, null, 2)}\n`);
