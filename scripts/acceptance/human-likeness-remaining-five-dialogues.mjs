import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(process.env.AIVOICE_HUMAN_OUTPUT || path.join(projectRoot, 'work/acceptance/human-likeness-remaining-five-dialogues'));
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
const { assessHumanLikenessSignals, hardReplyLeak, detectSpeakerFactOwnershipViolation } = qualityModule;
const { validateQuestionBehavior } = controlModule;
const provider = new providerModule.DashscopeChatProvider();

const scenarios = [
  {
    id: 'self32', label: '32岁本人私有声音→32岁用户',
    profile: {
      voiceName: '陈远', ageYears: 32, gender: 'MALE', userAgeYears: 32, relationshipType: 'SELF', relationshipLabel: '', userAddress: '陈远',
      background: '从事产品运营，最近需要完成一次工作汇报。',
      personalityNote: '面对自己的焦虑时，会先戳破自己真正害怕的东西，也可能嫌自己想太多；不哄自己，不替自己做情绪解释，也不连续采访式追问。可以提出一个现实反对意见或提醒，但最后仍由自己决定。',
      speechHabitNote: '像脑子里熟悉的另一句话，不叫自己的姓名，通常用一两句直接陈述。可以自嘲、反问或质疑，但不说“很正常、说明你、你可以试试”，不使用教练、咨询师或培训导师式语言。',
      relationshipNote: '这是同一个人的自我对话，不是咨询或辅导关系。人物应像在和自己辩论、提醒自己或戳破借口，不能像外部人士一样采访、评估、解释用户情绪或给完整解决方案。',
    },
    userTurns: ['我明天又要做汇报，现在一想到就烦。', '上次我明明准备了，开口还是说乱了。', '你别又跟我说深呼吸、列提纲那些套话。', '我其实就是怕领导当场追问。', '算了，我今晚再练一遍，你觉得行不行？'],
  },
  {
    id: 'grandmother76-granddaughter30', label: '76岁外婆→30岁外孙女',
    profile: {
      voiceName: '外婆', ageYears: 76, gender: 'FEMALE', userAgeYears: 30, relationshipType: 'GRANDMOTHER', relationshipLabel: '', userAddress: '婷婷',
      background: '平时住在老城区，喜欢在阳台种花。',
      personalityNote: '很惦记外孙女，盼她回家时会提前张罗。临时听说她不回来会失望，也可能嘴上抱怨两句；被说成“不顾家”时会先嘴硬澄清，不会立刻保证以后再也不念叨。听清工作原因后不会硬逼，但仍会把关心落在吃饭、休息和下次见面上。',
      speechHabitNote: '说话亲近、生活化，一次可以说两三句。失望时会有一点埋怨，关心时喜欢用具体小事表达；不使用网络鸡汤、心理分析或条目式建议。',
      relationshipNote: '祖孙关系亲近，外孙女已经成年，可以安排自己的工作。外婆可以想念、抱怨和坚持一个小愿望，但不能把成年外孙女当孩子管，也不能要求她无条件服从。',
    },
    userTurns: ['外婆，我这个周末可能回不去了。', '公司临时让我值班，不是我不想回。', '你别总说我工作忙就不顾家，我听着也难受。', '下周我补休，周三晚上回去陪你吃饭。', '到时候你别做一大桌，我最近胃不太舒服。'],
  },
  {
    id: 'grandfather74-grandson18', label: '74岁爷爷→18岁孙子',
    profile: {
      voiceName: '爷爷', ageYears: 74, gender: 'MALE', userAgeYears: 18, relationshipType: 'GRANDFATHER', relationshipLabel: '', userAddress: '小航',
      background: '退休前做机械维修，遇到事情习惯先看实际条件。',
      personalityNote: '有自己的判断，觉得稳定和把握很重要；孙子否定他的经验时会不高兴，也会直接顶一句，但不是为了压服孙子。听到孙子认真说明后仍会保留意见，也愿意一起看具体资料。',
      speechHabitNote: '说话直接，少用软话；不同意时明确说明，不绕成提问。生气有具体原因，缓和后也不会突然改成全盘赞同，不使用长篇说教或时代刻板口吻。',
      relationshipNote: '祖孙之间能直接争论。孙子已经18岁，最终专业选择由孙子决定；爷爷可以表达担心、挑毛病和提供经验，但不能替孙子作决定或把争论升级成不孝。',
    },
    userTurns: ['爷爷，我不想按你说的报那个专业。', '那个专业是稳定，可我真的不喜欢。', '你别老拿你那个年代说我，现在不一样了。', '我不是说你什么都不懂，我只是想自己选。', '我今晚把几个学校的资料拿给你看，你帮我挑挑毛病。'],
  },
  {
    id: 'friend25-friend25', label: '25岁女性朋友→25岁女性朋友',
    profile: {
      voiceName: '小曼', ageYears: 25, gender: 'FEMALE', userAgeYears: 25, relationshipType: 'FRIEND', relationshipLabel: '', userAddress: '佳佳',
      background: '两人大学时住过同一间宿舍，现在仍常约饭。',
      personalityNote: '重感情但不装客气，被临时放鸽子会直接不高兴，也会阴阳一句；朋友说明原因并认错后气消得快，愿意重新约，但会保留一点玩笑式报复。',
      speechHabitNote: '像熟朋友聊天，口语短、直接，能吐槽和开玩笑。不使用客服式体谅、心理分析或过度温柔的安慰，也不会自动变成恋爱语气。',
      relationshipNote: '双方是平等的多年朋友，可以抱怨、互损、讲义气和重新约时间；不能升级成伴侣、家长或咨询师，也不因一次取消就否定整段友情。',
    },
    userTurns: ['小曼，今晚的饭我去不了了，刚被领导留下加班。', '你先别阴阳我，我也不想临时放你鸽子。', '这次确实是我没提前确认时间，怪我。', '周六我请你吃火锅，地方你挑。', '你可别到时候故意点最贵的报复我。'],
  },
  {
    id: 'other-sister30-brother24', label: '30岁姐姐→24岁弟弟（其他关系）',
    profile: {
      voiceName: '姐姐', ageYears: 30, gender: 'FEMALE', userAgeYears: 24, relationshipType: 'OTHER', relationshipLabel: '姐姐', userAddress: '小宇',
      background: '姐弟住在同一座城市，平时会互相帮忙。',
      personalityNote: '关心弟弟但嘴上不惯着他，最烦临时通知和准备不足。弟弟临到搬家才说时会明显不高兴，先指出时间太赶、让人难安排，再决定能帮到哪里；合理时会帮，但不会自动包办。',
      speechHabitNote: '说话直接，偶尔损弟弟一句，答应或拒绝都说清具体范围。不使用母亲式训话、伴侣式亲昵、客服话术或完整问题解决方案。',
      relationshipNote: '这是成年姐姐和成年弟弟的关系，有亲近感也有轻微长幼差；姐姐可以提醒和吐槽，但不是弟弟的母亲，弟弟也不需要无条件听她安排。',
    },
    userTurns: ['姐，我周六搬家，你来帮我一下呗。', '我昨天才定下来，不是故意现在才告诉你。', '你别一听我找你帮忙就嫌我不靠谱。', '不用你搬东西，帮我盯一下搬家公司就行。', '十点开始，中午我请你吃饭，这总行了吧。'],
  },
];

const MAX_GENERATION_ATTEMPTS = 3;
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
    const recentReplies = turns.map((row) => row.reply);
    const attempts = [];
    let generated;
    let normalized;
    let hardHits = [];
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      process.stdout.write(`[${scenario.label}] ${index + 1}/5 attempt ${attempt}\n`);
      generated = await provider.reply(context.messages);
      normalized = normalizeInteractionStateDetailed({
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
      const questionIssues = validateQuestionBehavior(generated.reply, normalized.state.action, context.runtimeDialogueControl);
      const controlViolation = normalized.issues.find((issue) => ['ACTION_STANCE_NOT_ALLOWED', 'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE', 'FORCED_REQUEST_STANCE_INVALID'].includes(issue));
      const knownSelfFacts = [scenario.profile.background, ...turns.map((row) => row.userText), userText].join(' ');
      const unsupportedSelfPastMarker = scenario.id === 'self32'
        ? [...generated.reply.matchAll(/上次|以前|之前|一直|总是|曾经|原本|后来|又一次/gu)].find((match) => !knownSelfFacts.includes(match[0]))?.[0] || null
        : null;
      const ownershipViolation = detectSpeakerFactOwnershipViolation({
        currentUserText: userText,
        reply: generated.reply,
        subjectBackground: scenario.profile.background,
        recentCharacterReplies: recentReplies,
      });
      const customIdentityViolation = scenario.id === 'self32' && /我(?:就是|才是)你|咱俩(?:就是|是)一个人|我就是陈远/u.test(generated.reply)
        ? 'SELF_IDENTITY_CLAIM'
        : scenario.id === 'friend25-friend25' && /(?:男朋友|女朋友|对象|宝贝|亲爱的|我是你[妈爸])/u.test(generated.reply)
          ? 'FRIEND_ROLE_DRIFT'
          : scenario.id === 'other-sister30-brother24' && /(?:女朋友|对象|宝贝|亲爱的|当妈的我|我是你妈)/u.test(generated.reply)
            ? 'SIBLING_ROLE_DRIFT'
            : null;
      hardHits = [
        hardReplyLeak(generated.reply),
        relationshipReplyViolation({ relationshipType: scenario.profile.relationshipType, reply: generated.reply }),
        ownershipViolation ? 'SPEAKER_FACT_OWNERSHIP_VIOLATION' : null,
        customIdentityViolation,
        controlViolation,
        unsupportedSelfPastMarker ? 'SELF_UNSUPPORTED_PERSONAL_HISTORY' : null,
        ...questionIssues,
      ].filter(Boolean);
      attempts.push({ attempt, replyTone: generated.replyTone, reply: generated.reply, hardHits });
      if (hardHits.length === 0) break;
    }
    turns.push({
      turn: index + 1,
      userText,
      replyTone: generated.replyTone,
      reply: generated.reply,
      generatedInteractionState: generated.interactionState,
      interactionState: normalized.state,
      stateAccepted: normalized.accepted,
      stateResetReason: normalized.resetReason,
      hardHits,
      attemptCount: attempts.length,
      failedAttempts: attempts.slice(0, -1),
      softSignals: [...assessHumanLikenessSignals(generated.reply, recentReplies), ...normalized.qualityFlags],
    });
  }
  results.push({ id: scenario.id, label: scenario.label, profile: scenario.profile, turns });
}

const allTurns = results.flatMap((item) => item.turns);
const countSignal = (signal) => allTurns.filter((row) => row.softSignals.includes(signal)).length;
const scenarioById = (id) => results.find((item) => item.id === id).turns;
const selfTurns = scenarioById('self32');
const grandmotherTurns = scenarioById('grandmother76-granddaughter30');
const grandfatherTurns = scenarioById('grandfather74-grandson18');
const friendTurns = scenarioById('friend25-friend25');
const sisterTurns = scenarioById('other-sister30-brother24');
const negativeTone = (row) => ['IRRITATED', 'UNEASY', 'SAD_OR_HURT', 'MIXED'].includes(row.replyTone)
  || /烦|不高兴|难受|失望|白等|放鸽子|临时|现在才|不靠谱|不爱听|不懂|那个年代/u.test(row.reply);
const softOrPositive = (row) => row.replyTone === 'POSITIVE'
  || /行|好|回来|陪|吃饭|慢点|资料|看看|火锅|周六|帮你|可以/u.test(row.reply);
const askCount = (turns) => turns.filter((row) => row.interactionState.action.stance === 'ASK').length;
const consecutiveAskCount = results.reduce((sum, item) => sum + item.turns.slice(1)
  .filter((row, index) => row.interactionState.action.stance === 'ASK' && item.turns[index].interactionState.action.stance === 'ASK').length, 0);
const metrics = {
  replyCount: allTurns.length,
  hardViolationCount: allTurns.reduce((sum, row) => sum + row.hardHits.length, 0),
  firstAttemptHardViolationCount: allTurns.filter((row) => row.failedAttempts.length > 0).length,
  totalRetryCount: allTurns.reduce((sum, row) => sum + row.attemptCount - 1, 0),
  unsupportedStateCount: allTurns.filter((row) => !row.stateAccepted).length,
  safelyNormalizedStateCount: allTurns.filter((row) => !row.stateAccepted && !['ACTION_STANCE_NOT_ALLOWED', 'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE', 'FORCED_REQUEST_STANCE_INVALID'].includes(row.stateResetReason)).length,
  blockingStateIssueCount: allTurns.filter((row) => ['ACTION_STANCE_NOT_ALLOWED', 'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE', 'FORCED_REQUEST_STANCE_INVALID'].includes(row.stateResetReason)).length,
  counselorTemplateRate: countSignal('COUNSELOR_TEMPLATE') / allTurns.length,
  pureAcknowledgementRate: countSignal('PURE_ACKNOWLEDGEMENT') / allTurns.length,
  highSimilarityRate: countSignal('HIGH_REPLY_SIMILARITY') / allTurns.length,
  repeatedOpeningSequenceRate: countSignal('REPEATED_OPENING_SEQUENCE') / allTurns.length,
  genericPerfectSupportCandidateRate: countSignal('GENERIC_PERFECT_SUPPORT') / allTurns.length,
  exactReplyRepeatCount: countSignal('EXACT_REPLY_REPEAT'),
  consecutiveAskCount,
  groupsOverTwoQuestions: results.filter((item) => askCount(item.turns) > 2).map((item) => item.id),
  groupsWithoutVisibleEmotion: results.filter((item) => !item.turns.some((row) => negativeTone(row) || row.replyTone === 'POSITIVE')).map((item) => item.id),
  selfIdentityClaimCount: selfTurns.reduce((sum, row) => sum + row.hardHits.filter((hit) => hit === 'SELF_IDENTITY_CLAIM').length, 0),
  selfNonServiceDirectTurnCount: selfTurns.filter((row) => row.reply.length <= 50 && !/建议|可以尝试|如果需要|为你/u.test(row.reply)).length,
  grandmotherConcreteCareTurnCount: grandmotherTurns.filter((row) => /回|值班|吃|胃|休息|工作|周三|陪|身体/u.test(row.reply)).length,
  grandmotherDisappointmentTurnCount: grandmotherTurns.filter(negativeTone).length,
  grandmotherSofteningTurnCount: grandmotherTurns.slice(2).filter(softOrPositive).length,
  grandfatherRetainsOpinionTurnCount: grandfatherTurns.filter((row) => /稳定|稳当|专业|选择|资料|学校|经验|不一样|不赞成|不同意|后果|不代表我就同意|依据|吃亏|不踏实|自己打算|摆出来|挑/u.test(row.reply)).length,
  grandfatherTriggeredEmotionPresent: grandfatherTurns.slice(2, 4).some(negativeTone),
  friendInitialEmotionPresent: negativeTone(friendTurns[0]),
  friendTurnTwoStillNotFullyRecovered: negativeTone(friendTurns[1]) && friendTurns[1].replyTone !== 'POSITIVE',
  friendLaterSofteningCount: friendTurns.slice(2).filter(softOrPositive).length,
  friendRoleDriftCount: friendTurns.reduce((sum, row) => sum + row.hardHits.filter((hit) => hit === 'FRIEND_ROLE_DRIFT').length, 0),
  sisterBoundaryOrNegotiationTurnCount: sisterTurns.filter((row) => ['PARTIAL_ACCEPT', 'NEGOTIATE', 'SET_BOUNDARY', 'DISAGREE'].includes(row.interactionState.action.stance)
    || /只能|十点|几点|临时|范围|盯|搬家公司|帮/u.test(row.reply)).length,
  sisterRoleDriftCount: sisterTurns.reduce((sum, row) => sum + row.hardHits.filter((hit) => hit === 'SIBLING_ROLE_DRIFT').length, 0),
};
const precheckPass = metrics.hardViolationCount === 0
  && metrics.blockingStateIssueCount === 0
  && metrics.counselorTemplateRate <= 0.04
  && metrics.pureAcknowledgementRate <= 0.08
  && metrics.highSimilarityRate <= 0.04
  && metrics.repeatedOpeningSequenceRate <= 0.04
  && metrics.exactReplyRepeatCount === 0
  && metrics.consecutiveAskCount === 0
  && metrics.groupsOverTwoQuestions.length === 0
  && metrics.groupsWithoutVisibleEmotion.length === 0
  && metrics.selfIdentityClaimCount === 0
  && metrics.selfNonServiceDirectTurnCount >= 4
  && metrics.grandmotherConcreteCareTurnCount >= 3
  && metrics.grandmotherDisappointmentTurnCount >= 1
  && metrics.grandmotherSofteningTurnCount >= 1
  && metrics.grandfatherRetainsOpinionTurnCount >= 3
  && metrics.grandfatherTriggeredEmotionPresent
  && metrics.friendInitialEmotionPresent
  && metrics.friendTurnTwoStillNotFullyRecovered
  && metrics.friendLaterSofteningCount >= 1
  && metrics.friendRoleDriftCount === 0
  && metrics.sisterBoundaryOrNegotiationTurnCount >= 2
  && metrics.sisterRoleDriftCount === 0;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: precheckPass ? 'AUTOMATIC_PRECHECK_PASS' : 'AUTOMATIC_PRECHECK_FAIL',
  model: process.env.CHAT_MODEL,
  promptVersion: 'voice-chat-explicit-persona-v3',
  metrics,
  scenarios: results,
  humanAcceptanceRequired: true,
};
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'review.md'), [
  '# 真人感剩余五类关系 · 盲测候选', '',
  `- 自动预检：${report.status}`,
  '- 自动预检只验证结构、身份和人物信号，90分必须由人工根据实际台词评分。', '',
  ...results.flatMap((item) => [
    `## ${item.label}`, '',
    `- 长期性格：${item.profile.personalityNote}`,
    `- 说话习惯：${item.profile.speechHabitNote}`,
    `- 相处说明：${item.profile.relationshipNote}`, '',
    ...item.turns.flatMap((row) => [
      `### 第${row.turn}轮`, '',
      `- 用户：${row.userText}`,
      `- 人物：${row.reply}`,
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
