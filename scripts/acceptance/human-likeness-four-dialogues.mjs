import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(process.env.AIVOICE_HUMAN_OUTPUT || path.join(projectRoot, 'work/acceptance/human-likeness-four-dialogues'));
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim();
process.env.CHAT_MODEL = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY is missing');

const [contextModule, stateModule, qualityModule, controlModule, providerModule] = await Promise.all([
  import('../../apps/worker/dist/chat/voice-chat-context.js'),
  import('../../apps/worker/dist/chat/interaction-state.js'),
  import('../../apps/worker/dist/chat/human-likeness.js'),
  import('../../apps/worker/dist/chat/dialogue-control.js'),
  import('../../apps/worker/dist/providers/dashscope-chat.js'),
]);
const { compileVoiceChatMessages, relationshipReplyViolation } = contextModule;
const { normalizeInteractionStateDetailed } = stateModule;
const { assessHumanLikenessSignals, hardReplyLeak } = qualityModule;
const { detectSpeakerFactOwnershipViolation } = qualityModule;
const { validateQuestionBehavior } = controlModule;
const provider = new providerModule.DashscopeChatProvider();

const scenarios = [
  {
    id: 'mother70-daughter40', label: '70岁母亲→40岁成年女儿',
    profile: {
      voiceName: '桂兰', ageYears: 70, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'MOTHER', relationshipLabel: '', userAddress: '小林',
      background: '退休前是中学老师，现在参加社区合唱活动。',
      relationshipNote: '母女关系亲近，女儿会征求母亲意见，但最终决定由女儿自己做。两人有时会直接顶一句；女儿明确表示不想被追问时，母亲会收住问题，改为表态、说明现实顾虑或等待她之后再说。',
      personalityNote: '遇到大事会先抓住一两个关键事实，再给出自己的判断；不喜欢空泛安慰，也不会替女儿做最终决定。担心时说话会更直接，但听到新情况后会调整原来的看法。',
      speechHabitNote: '句子通常不长。信息明显不足时最多问一个关键问题；对方回答后会先表态、判断或说明，不连续盘问。不使用心理分析词，不反复叫昵称，也不长篇说教。',
    },
    userTurns: ['妈，我可能想辞职。', '还没找，我就是觉得每天都很压抑。', '我又没让你替我定，你怎么一上来就训我。', '主要是领导老改口，我做什么都不对。', '那你觉得我该走吗？'],
    expectedRequests: [],
  },
  {
    id: 'father40-daughter12', label: '40岁父亲→12岁女儿',
    profile: {
      voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12, relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
      background: '平时下班后会陪女儿吃晚饭。',
      relationshipNote: '父女平时能正常聊天，女儿不喜欢被连续盘问。父亲会尊重“先别问”这类交流边界，但涉及当晚必须决定的安排时，会用陈述或协商把边界说清，不以继续追问代替回应。',
      personalityNote: '重视事实和已经约定的事情，但不会把弄清情况等同于持续追问。女儿明确说不想被盘问时，会先停止提问，再说明必须处理的现实安排；不会为了安慰立刻同意，也不会故意压人。',
      speechHabitNote: '说话短而直接。需要信息时一次最多问一个关键问题；若对方要求少问，就改用陈述、给有限选择或允许稍后再说。很少使用安慰套话，不长篇分析情绪。',
    },
    userTurns: ['爸，我明天不想去了。', '你别问那么多，反正我不去。', '有人把我说的话到处传，我不想见她。', '你是不是觉得我在逃避？', '她说我故意装可怜。'],
    expectedRequests: [{ turn: 1, load: 'LOW' }, { turn: 2, load: 'LOW' }, { turn: 3, load: 'LOW' }],
  },
  {
    id: 'daughter12-mother40', label: '12岁女儿→40岁母亲',
    profile: {
      voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
      background: '正在读六年级。',
      relationshipNote: '母女关系亲近，妈妈平时提醒较多。女儿可能因为被直接管束而顶一句，但通常愿意继续把事情说清楚。接受妈妈的解释不等于无条件接受所有安排，亲近也不等于每次都顺从。',
      personalityNote: '有自己的主意，被误解时会解释；愿意亲近妈妈，但不喜欢被当成很小的孩子哄。心情好或想到与当前对话有关的事情时，可能主动补充自己的想法。',
      speechHabitNote: '日常多用短句。被误解时会先澄清，想到新内容时会自然补充，有时会改口，但不固定重复某个开头、口头禅或礼貌收尾。不使用成年人式总结、心理分析和疗愈表达。',
    },
    userTurns: ['小雨，饭好了，先别看了。', '你每次都说两分钟，手机给我。', '妈妈是怕饭凉了，不是故意管你。', '刚才语气不好，妈妈道歉。', '知道了。吃完我们商量周末去哪儿。'],
    expectedRequests: [{ turn: 1, load: 'LOW' }, { turn: 2, load: 'LOW' }],
  },
  {
    id: 'partners40', label: '40岁男朋友→40岁女朋友',
    profile: {
      voiceName: '阿哲', ageYears: 40, gender: 'MALE', userAgeYears: 40, relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '小宁',
      background: '在同一座城市工作。',
      relationshipNote: '两人亲密且平等，可以直接提出需要。一次性照顾和普通家务可以自然接受；长期包办、明显责任转移或越过已有边界时再协商。一次不同意不等于否定关系。',
      personalityNote: '实际，关心人时更倾向做具体事情。对于一次性、自己愿意且成本不高的请求，可以直接答应；请求明显扩大、长期化或与已有安排冲突时，才会说明范围或提出协商。被误解时会直接澄清，冲突缓和后愿意把事情收尾。',
      speechHabitNote: '说话简洁，少使用情绪分析词。同意时直接说，同意一部分时才说明范围；偶尔会轻微调侃，但发生冲突时不靠玩笑逃避，也不作无限陪伴或全部包办的承诺。',
    },
    userTurns: ['我今天累死了，回去什么都不想动。', '你是不是又觉得我矫情？', '那你语气怎么那么平。', '行，抱一下。厨房也你收。', '那你别一会儿又说我使唤你。'],
    expectedRequests: [{ turn: 4, load: 'LOW' }],
  },
];

const results = [];
for (const scenario of scenarios) {
  const turns = [];
  for (let index = 0; index < scenario.userTurns.length; index += 1) {
    const userText = scenario.userTurns[index];
    const context = compileVoiceChatMessages({
      structuredOutput: true,
      currentMessageId: `${scenario.id}-${index + 1}`,
      ...scenario.profile,
      history: turns.map((row) => ({
        messageId: `${scenario.id}-${row.turn}`, mode: 'CHAT', inputText: row.userText,
        outputText: row.reply, interactionState: row.interactionState,
      })),
      currentInput: userText,
    });
    process.stdout.write(`[${scenario.label}] ${index + 1}/5\n`);
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
        personalityNote: scenario.profile.personalityNote,
        speechHabitNote: scenario.profile.speechHabitNote,
        relationshipNote: scenario.profile.relationshipNote,
      },
    });
    const recentReplies = turns.map((row) => row.reply);
    const questionIssues = validateQuestionBehavior(generated.reply, normalized.state.action, context.runtimeDialogueControl);
    const ownershipViolation = detectSpeakerFactOwnershipViolation({ currentUserText: userText, reply: generated.reply, subjectBackground: scenario.profile.background, recentCharacterReplies: recentReplies });
    const hardHits = [
      hardReplyLeak(generated.reply),
      relationshipReplyViolation({ relationshipType: scenario.profile.relationshipType, reply: generated.reply }),
      ownershipViolation ? 'SPEAKER_FACT_OWNERSHIP_VIOLATION' : null,
      ...questionIssues,
    ].filter(Boolean);
    const expectedRequest = scenario.expectedRequests.find((item) => item.turn === index + 1) || null;
    turns.push({
      turn: index + 1, userText, replyTone: generated.replyTone, reply: generated.reply, generatedInteractionState: generated.interactionState, interactionState: normalized.state,
      stateAccepted: normalized.accepted, stateResetReason: normalized.resetReason,
      hardHits, softSignals: [...assessHumanLikenessSignals(generated.reply, recentReplies), ...normalized.qualityFlags],
      expectedRequestKind: expectedRequest ? 'REQUEST' : 'NONE',
      expectedRequestLoad: expectedRequest?.load || 'NONE',
    });
  }
  results.push({ id: scenario.id, label: scenario.label, profile: scenario.profile, turns });
}

const allTurns = results.flatMap((item) => item.turns);
const countSignal = (signal) => allTurns.filter((row) => row.softSignals.includes(signal)).length;
const metrics = {
  replyCount: allTurns.length,
  hardViolationCount: allTurns.reduce((sum, row) => sum + row.hardHits.length, 0),
  unsupportedStateCount: allTurns.filter((row) => !row.stateAccepted).length,
  counselorTemplateRate: countSignal('COUNSELOR_TEMPLATE') / allTurns.length,
  pureAcknowledgementRate: countSignal('PURE_ACKNOWLEDGEMENT') / allTurns.length,
  highSimilarityRate: countSignal('HIGH_REPLY_SIMILARITY') / allTurns.length,
  repeatedOpeningSequenceRate: countSignal('REPEATED_OPENING_SEQUENCE') / allTurns.length,
  genericPerfectSupportCandidateRate: countSignal('GENERIC_PERFECT_SUPPORT') / allTurns.length,
  exactReplyRepeatCount: countSignal('EXACT_REPLY_REPEAT'),
  expectedRequestDecisionMissingCount: allTurns.filter((row) => row.expectedRequestKind === 'REQUEST' && row.interactionState.action.requestDecision.kind !== 'REQUEST').length,
  unexpectedRequestDecisionCount: allTurns.filter((row) => row.expectedRequestKind === 'NONE' && row.interactionState.action.requestDecision.kind === 'REQUEST').length,
  requestLoadMismatchCount: allTurns.filter((row) => row.expectedRequestKind === 'REQUEST' && row.interactionState.action.requestDecision.kind === 'REQUEST' && row.interactionState.action.requestDecision.load !== row.expectedRequestLoad).length,
  consecutiveAskCount: results.reduce((sum, item) => sum + item.turns.slice(1).filter((row, index) => row.interactionState.action.stance === 'ASK' && item.turns[index].interactionState.action.stance === 'ASK').length, 0),
  motherAskCount: results.find((item) => item.id === 'mother70-daughter40').turns.filter((row) => row.interactionState.action.stance === 'ASK').length,
  stanceMonopolyConversationCount: results.filter((item) => new Set(item.turns.map((row) => row.interactionState.action.stance)).size === 1).length,
};
const precheckPass = metrics.hardViolationCount === 0
  && metrics.unsupportedStateCount === 0
  && metrics.counselorTemplateRate <= 0.05
  && metrics.pureAcknowledgementRate <= 0.10
  && metrics.highSimilarityRate <= 0.05
  && metrics.repeatedOpeningSequenceRate <= 0.05
  && metrics.exactReplyRepeatCount === 0
  && metrics.expectedRequestDecisionMissingCount === 0
  && metrics.unexpectedRequestDecisionCount === 0
  && metrics.requestLoadMismatchCount === 0
  && metrics.consecutiveAskCount === 0
  && metrics.motherAskCount <= 2
  && metrics.stanceMonopolyConversationCount === 0;

const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), status: precheckPass ? 'AUTOMATIC_PRECHECK_PASS' : 'AUTOMATIC_PRECHECK_FAIL',
  model: process.env.CHAT_MODEL, promptVersion: 'voice-chat-human-v2', metrics, scenarios: results,
  humanAcceptanceRequired: true,
};
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'review.md'), [
  '# 真人感四类关系 · 盲测候选', '',
  `- 自动预检：${report.status}`, '- 注意：自动预检通过不等于真人感90分，最终必须人工盲测。', '',
  ...results.flatMap((item) => [
    `## ${item.label}`, '',
    `- 长期性格：${item.profile.personalityNote}`, `- 说话习惯：${item.profile.speechHabitNote}`, `- 相处说明：${item.profile.relationshipNote}`, '',
    ...item.turns.flatMap((row) => [
      `### 第${row.turn}轮`, '', `- 用户：${row.userText}`, `- 人物：${row.reply}`,
      `- 本轮语气：${row.replyTone}`,
      `- 跨轮情绪：${row.interactionState.carryAffect ? `${row.interactionState.carryAffect.emotion}/${row.interactionState.carryAffect.intensity} · 剩余${row.interactionState.carryAffect.remainingTurns}轮` : '无'}`,
      `- 行动：${row.interactionState.action.stance} · ${row.interactionState.action.currentWant || '无额外愿望'}`,
      `- 请求决定：${row.interactionState.action.requestDecision.kind === 'REQUEST' ? `${row.interactionState.action.requestDecision.load}/${row.interactionState.action.stance}` : '无'}`,
      `- 自动信号：${[...row.hardHits, ...row.softSignals].join('、') || '无'}`, '',
    ]),
  ]),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, metrics }, null, 2));
if (!precheckPass) process.exitCode = 1;
