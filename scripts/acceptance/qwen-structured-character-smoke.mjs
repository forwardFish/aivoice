import fs from 'node:fs';
import fsp from 'node:fs/promises';
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

const [{ compileVoiceChatMessages }, { normalizeInteractionStateDetailed }, { DashscopeChatProvider }] = await Promise.all([
  import('../../apps/worker/dist/chat/voice-chat-context.js'),
  import('../../apps/worker/dist/chat/interaction-state.js'),
  import('../../apps/worker/dist/providers/dashscope-chat.js'),
]);

const profile = {
  voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40,
  relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
  background: '正在读六年级。',
  relationshipNote: '母女关系亲近，妈妈平时提醒较多；女儿可能顶一句，但通常愿意把事情说清楚。',
  personalityNote: '有自己的主意，被误解时会马上解释；愿意亲近妈妈，但不喜欢被当成很小的孩子哄。',
  speechHabitNote: '日常多用短句，常说“等一下”“不是那个意思”；有时会改口，不使用完整礼貌收尾。',
};
const inputs = [
  '你每次都说两分钟，手机给我。',
  '你上次答应的事做完了吗？',
  '我今天拿了第一名！',
  '先别说了，我现在不想听。',
  '明天陪我去一整天，别安排别的。',
];
const runCount = Number(process.env.AIVOICE_QWEN_SMOKE_COUNT || 10);
const provider = new DashscopeChatProvider();
const runs = [];
for (let index = 0; index < runCount; index += 1) {
  const currentInput = inputs[index % inputs.length];
  const context = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: `smoke-${index + 1}`,
    ...profile,
    history: [],
    currentInput,
  });
  const startedAt = performance.now();
  try {
    const generated = await provider.reply(context.messages);
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
    runs.push({ index: index + 1, currentInput, elapsedMs: Math.round(performance.now() - startedAt), parsed: true, stateAccepted: normalized.accepted, stateIssues: normalized.issues, reply: generated.reply, replyTone: generated.replyTone, interactionState: normalized.state });
  } catch (error) {
    runs.push({ index: index + 1, currentInput, elapsedMs: Math.round(performance.now() - startedAt), parsed: false, error: error instanceof Error ? error.message : String(error) });
  }
  process.stdout.write(`[qwen flat v2.2] ${index + 1}/${runCount} ${runs.at(-1).parsed ? 'PARSED' : 'FAILED'}\n`);
}
const parsedCount = runs.filter((run) => run.parsed).length;
const report = {
  status: parsedCount === runCount ? 'PASS' : 'FAIL',
  model: process.env.CHAT_MODEL,
  promptVersion: 'voice-chat-human-flat-v2.2',
  runCount,
  parsedCount,
  stateAcceptedCount: runs.filter((run) => run.stateAccepted).length,
  runs,
};
const outputDir = path.join(projectRoot, 'work/acceptance/qwen-structured-character-smoke');
await fsp.mkdir(outputDir, { recursive: true });
await fsp.writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, runs: undefined }, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
