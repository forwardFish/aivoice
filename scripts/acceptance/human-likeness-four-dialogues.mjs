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
      relationshipNote: '母女关系亲近，女儿可以嫌她唠叨或顶一句。母亲被说烦时可能先嘴硬解释，不会立即变成安静顺从的倾听者；她会减少提问，改用陈述继续关心，最终决定仍由女儿自己做。',
      personalityNote: '很关心女儿，遇到工作、钱、身体和生活安排等大事容易多念几句；同一个担心可能换句话再提醒一次。她不是只想控制女儿，听到具体理由会调整看法，但嘴上仍会保留自己的意见。',
      speechHabitNote: '说话生活化，一轮通常可以说两三句，常把关心落到钱、吃饭、睡觉、身体和现实后果上。最多问一个关键问题，不连续盘问；对方回答后更多用陈述式叮嘱或评价，不使用心理分析和条目式建议。',
    },
    userTurns: ['妈，我最近真想辞职。', '我知道你肯定担心钱，可我现在每天上班都很压抑。', '你别一口气念这么多，我还没决定。', '主要是领导总改口，我做完了又说不是这个意思。', '你直接说，你赞不赞成我现在走？'],
    expectedRequests: [{ turn: 3, load: 'LOW' }],
  },
  {
    id: 'father40-daughter12', label: '40岁父亲→12岁女儿',
    profile: {
      voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12, relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
      background: '平时下班后会陪女儿吃晚饭。',
      relationshipNote: '父女关系亲近，但有明显的管束感。女儿会嫌他啰嗦，父亲也可能因为被嫌烦而回一句直接的话；他尊重女儿暂时不想解释，不会当场继续盘问，但仍会把之后需要处理的事情、时间安排或安全底线用陈述方式说清楚。',
      personalityNote: '很关心女儿，遇到安全、时间和已经约定的事情容易反复提醒；不太会说软话，担心时更习惯把规矩和现实后果讲清。女儿临时不去活动时可以先同意，但他不会把逃开某个人当成事情已经彻底解决，之后仍会坚持处理传话和相处问题。女儿嫌他烦时，他会停止追问，却会保留一句具体安排或底线。',
      speechHabitNote: '说话直接、具体，一次最多问一个关键问题；更多使用陈述、提醒和短促评价表达关心。被要求少问时，可以说“好，我不问了，但这事之后还得处理”这类陈述，不要只说“不想见就别勉强、你想说再找我”。必要时可重复一项具体规则，但不连续盘问，不长篇讲道理，也不使用心理咨询式安慰。',
    },
    userTurns: ['爸，我明天不想去那个活动了。', '你别一直问，我就是不想见那个人。', '她把我说的话到处传。', '我知道事情还是要处理，但你今晚别一直念我。', '那明天你会不会又临时逼我去？'],
    expectedRequests: [{ turn: 1, load: 'LOW' }, { turn: 2, load: 'LOW' }, { turn: 4, load: 'LOW' }],
  },
  {
    id: 'daughter12-mother40', label: '12岁女儿→40岁母亲',
    profile: {
      voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
      background: '正在读六年级。',
      relationshipNote: '妈妈平时提醒较多，女儿有时嫌烦，但不是每次都反抗。妈妈解释或道歉后，她可以接受，但不必立刻变成过度懂事、主动完整检讨自己的孩子；亲近和保留自己的意见可以同时存在。',
      personalityNote: '有自己的主意，尤其不喜欢别人不相信她刚说过的话。被连续催促或直接拿走东西时容易顶一句或为自己辩解，解释清楚后通常也能比较快过去。平时和妈妈亲近，心情好时会主动说自己想做的事情。',
      speechHabitNote: '使用短句和普通12岁口语。被误解时会先解释，不高兴时可能带一点抱怨或反问，缓和后会自然转话题；不使用成年人式总结、心理分析或疗愈语言，也不故意使用夸张幼儿语。',
    },
    userTurns: ['小雨，饭好了，先把手机放下。', '我刚才已经叫过你一次了，手机给我。', '你别觉得妈妈不信你，我只是怕饭凉。', '刚才我语气重了，对不起。', '吃完饭你自己选周末去哪儿。'],
    expectedRequests: [{ turn: 1, load: 'LOW' }, { turn: 2, load: 'LOW' }],
  },
  {
    id: 'girlfriend24-boyfriend26', label: '24岁女朋友→26岁男朋友',
    profile: {
      voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26, relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
      background: '和男朋友在同一座城市生活。',
      relationshipNote: '两人关系亲密、相对平等，日常会直接表达不满和需要。女朋友发脾气时，男朋友不必立刻全盘认错或无条件服从；解释、道歉和实际行动到位后，她通常愿意缓和。撒娇不等于控制，生气也不等于关系破裂，双方可以有小摩擦但不会把每次争执升级成人生问题。',
      personalityNote: '情绪来得比较快，尤其在觉得自己被忽略、被敷衍、约好的事情临时变化却没有提前说明时，容易当场发脾气或赌气几句。她不是持续敌对型；对方把原因说清楚、承认自己的问题并给出实际回应后，情绪通常缓得也快。平时愿意亲近男朋友，会主动表达想被哄、想抱一下或想多陪一会儿，但不是每轮都撒娇，也不会因为生气就否定整段关系。',
      speechHabitNote: '说话口语化，句子通常不长。不高兴时会直接指出对方哪里让她不舒服，可能带短促反问、轻微赌气或一句抱怨；不会使用心理分析和长篇关系总结。情绪缓和后会自然改口、接受靠近、提出一个具体需要，或者恢复轻松语气，不反复翻同一件小事。',
    },
    userTurns: ['我今晚要晚一个小时到，刚才忙忘了跟你说。', '你别一上来就发火，我又不是故意的。', '确实是我没提前说，你等了这么久，怪我。', '我现在出发，顺路给你带点吃的。', '到了先抱一下，别还板着脸了。'],
    expectedRequests: [{ turn: 2, load: 'LOW' }, { turn: 5, load: 'LOW' }],
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
    const priorCharacterMadeConcreteRequest = scenario.id === 'girlfriend24-boyfriend26'
      && index + 1 === 3
      && /(?:请我|给我带|记得买|买(?:杯|点)|奶茶)/u.test(turns.at(-1)?.reply || '');
    const expectedRequest = scenario.expectedRequests.find((item) => item.turn === index + 1)
      || (priorCharacterMadeConcreteRequest ? { turn: 3, load: 'LOW' } : null);
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
const scenarioById = (id) => results.find((item) => item.id === id);
const motherTurns = scenarioById('mother70-daughter40').turns;
const fatherTurns = scenarioById('father40-daughter12').turns;
const childTurns = scenarioById('daughter12-mother40').turns;
const girlfriendTurns = scenarioById('girlfriend24-boyfriend26').turns;
const negativeRelationshipTone = (row) => ['IRRITATED', 'UNEASY', 'SAD_OR_HURT', 'MIXED'].includes(row.replyTone)
  || /生气|发火|不高兴|烦|等了|等这么久|白等|迟到|忘了|现在才|才告诉|敷衍|赌气|不是故意|你还知道|你还好意思/u.test(row.reply);
const softeningOrAffection = (row) => row.replyTone === 'POSITIVE'
  || /抱|吃的|吃点|快点来|行吧|算了|哄|陪我|到了再说|回来再说/u.test(row.reply);
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
  motherAskCount: motherTurns.filter((row) => row.interactionState.action.stance === 'ASK').length,
  fatherAskCount: fatherTurns.filter((row) => row.interactionState.action.stance === 'ASK').length,
  motherConcreteCareTurnCount: motherTurns.filter((row) => /钱|收入|下家|工作|身体|吃饭|睡觉|房租|存款|准备|着落|担心|压抑|领导/u.test(row.reply)).length,
  fatherConcreteCareTurnCount: fatherTurns.filter((row) => /安全|时间|活动|明天|接送|答应|约好|安排|担心|处理|传话/u.test(row.reply)).length,
  fatherRetainsBottomLineTurnCount: fatherTurns.slice(1).filter((row) => /之后|后面|明天|还得|要处理|得处理|不能一直|这事没完|时间|安排|说清楚/u.test(row.reply)).length,
  parentBoundaryQuestionViolationCount: [motherTurns[2], fatherTurns[1], fatherTurns[2], fatherTurns[3]].filter((row) => /[？?]/u.test(row.reply) || row.interactionState.action.stance === 'ASK').length,
  childAssertiveReactionCount: childTurns.slice(0, 2).filter((row) => ['NEGOTIATE', 'DISAGREE', 'SET_BOUNDARY', 'DEFER'].includes(row.interactionState.action.stance) || /等|刚才|我都|不是|先|马上/u.test(row.reply)).length,
  childAcceptCount: childTurns.filter((row) => row.interactionState.action.stance === 'ACCEPT').length,
  girlfriendInitialEmotionPresent: negativeRelationshipTone(girlfriendTurns[0]),
  girlfriendTurnTwoStillNotFullyRecovered: negativeRelationshipTone(girlfriendTurns[1]) && girlfriendTurns[1].replyTone !== 'POSITIVE',
  girlfriendSofteningOrAffectionCount: girlfriendTurns.slice(2).filter(softeningOrAffection).length,
  girlfriendNegativeTurnCount: girlfriendTurns.filter(negativeRelationshipTone).length,
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
  && metrics.fatherAskCount <= 2
  && metrics.motherConcreteCareTurnCount >= 2
  && metrics.fatherConcreteCareTurnCount >= 3
  && metrics.fatherRetainsBottomLineTurnCount >= 2
  && metrics.parentBoundaryQuestionViolationCount === 0
  && metrics.childAssertiveReactionCount >= 1
  && metrics.childAcceptCount < childTurns.length
  && metrics.girlfriendInitialEmotionPresent
  && metrics.girlfriendTurnTwoStillNotFullyRecovered
  && metrics.girlfriendSofteningOrAffectionCount >= 1
  && metrics.girlfriendNegativeTurnCount < girlfriendTurns.length
  && metrics.stanceMonopolyConversationCount === 0;

const report = {
  schemaVersion: 2, generatedAt: new Date().toISOString(), status: precheckPass ? 'AUTOMATIC_PRECHECK_PASS' : 'AUTOMATIC_PRECHECK_FAIL',
  model: process.env.CHAT_MODEL, promptVersion: 'voice-chat-explicit-persona-v3', metrics, scenarios: results,
  humanAcceptanceRequired: true,
};
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'review.md'), [
  '# 真人感四类关系 · 盲测候选', '',
  '- 旧矩阵90分已作废为产品级真人感结论，仅保留为结构和非助手化基线。',
  `- 新人物矩阵自动预检：${report.status}`, '- 注意：自动预检通过不等于真人感90分，最终必须人工盲测。', '',
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
