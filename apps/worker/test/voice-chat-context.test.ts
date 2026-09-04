import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVoiceChatMessages, relationshipReplyViolation } from '../src/chat/voice-chat-context.js';

function systemText(messages: readonly { role: string; content: string }[]): string {
  return messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
}

test('relationship context keeps current user input last and filters exact speech rows', () => {
  const result = compileVoiceChatMessages({
    voiceName: '妈妈',
    relationshipType: 'MOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    history: [
      { messageId: 'chat-1', mode: 'CHAT', inputText: '今天被批评了。', outputText: '听起来很委屈。' },
      { messageId: 'exact-1', mode: 'EXACT_SPEECH', inputText: '生日快乐。', outputText: '生日快乐。' },
    ],
    currentInput: '后来他向我道歉了。',
  });

  assert.equal(result.messages[0]?.role, 'system');
  assert.match(systemText(result.messages), /人物是用户的母亲/);
  assert.match(systemText(result.messages), /任何回复都禁止出现“AI”/);
  assert.match(systemText(result.messages), /用户直接询问身份时/);
  assert.match(systemText(result.messages), /对用户称呼：小林/);
  assert.match(systemText(result.messages), /连续会话首次回复/);
  assert.deepEqual(result.includedMessageIds, ['chat-1']);
  assert.deepEqual(result.messages.filter((message) => message.role !== 'system'), [
    { role: 'user', content: '今天被批评了。' },
    { role: 'assistant', content: '听起来很委屈。' },
    { role: 'user', content: '后来他向我道歉了。' },
  ]);
  assert.match(result.contextHash, /^[a-f0-9]{64}$/);
});

test('relationship prompt keeps wording-stable content with an explicit cache boundary before dynamic state', () => {
  const common = {
    structuredOutput: true,
    voiceName: '小雨', ageYears: 12, gender: 'FEMALE' as const, userAgeYears: 40,
    relationshipType: 'CHILD' as const, relationshipLabel: '', userAddress: '妈妈',
    personalityNote: '【用户明确选择】有自己的主意：被替决定时会表达不满；嘴硬心软：缓和时仍会有一点别扭。',
    speechHabitNote: '句子不长，先回应具体事情。',
    relationshipNote: '平时会聊学校里的事情。',
  };
  const first = compileVoiceChatMessages({
    ...common,
    currentMessageId: 'cache-turn-1',
    history: [],
    currentInput: '今天在学校怎么样？',
  });
  const second = compileVoiceChatMessages({
    ...common,
    currentMessageId: 'cache-turn-2',
    history: [{ messageId: 'cache-turn-1', mode: 'CHAT' as const, inputText: '今天在学校怎么样？', outputText: '还行吧，就是作业有点多。' }],
    currentInput: '那早点写完好不好？',
  });
  const firstSystems = first.messages.filter((message) => message.role === 'system');
  const secondSystems = second.messages.filter((message) => message.role === 'system');
  const firstBoundary = firstSystems[0]?.cacheControlAt || 0;
  const secondBoundary = secondSystems[0]?.cacheControlAt || 0;

  assert.equal(firstSystems.length, 2);
  assert.equal(secondSystems.length, 2);
  assert.equal(firstBoundary, secondBoundary);
  assert.equal(firstSystems[0]?.content, secondSystems[0]?.content);
  assert.notEqual(firstSystems[1]?.content, secondSystems[1]?.content);
  assert.match(firstSystems[0]?.content || '', /<voice_profile>/);
  assert.doesNotMatch(firstSystems[0]?.content || '', /<prompt_turn_ids>/);
  assert.match(firstSystems[1]?.content || '', /<prompt_turn_ids>/);
  assert.ok(firstBoundary >= 1024);
});

test('parent voice distinguishes an adult child and includes only confirmed relationship facts', () => {
  const result = compileVoiceChatMessages({
    voiceName: '桂兰',
    ageYears: 70,
    gender: 'FEMALE',
    userAgeYears: 40,
    relationshipType: 'MOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    userLifeStage: 'ADULT',
    background: '退休前是中学老师，现在参加社区合唱活动。',
    relationshipNote: '和成年女儿每周通话，遇到大事会一起商量。',
    personalityNote: '遇到大事先问清具体条件，担心时会说得直接。',
    speechHabitNote: '句子不长，习惯先问一件具体的事。',
    history: [],
    currentInput: '最近过得怎么样？',
  });
  const system = systemText(result.messages);
  assert.match(system, /人物是用户的母亲/);
  assert.match(system, /用户人生阶段：成年阶段/);
  assert.match(system, /用户准确年龄：40岁/);
  assert.match(system, /人物比用户年长30岁/);
  assert.match(system, /人物是用户的母亲，用户是人物的子女/);
  assert.match(system, /方向不可反转/);
  assert.match(system, /成年人之间的家庭交流/);
  assert.match(system, /退休前是中学老师/);
  assert.match(system, /和成年女儿每周通话/);
  assert.match(system, /长期性格：遇到大事先问清具体条件/);
  assert.match(system, /说话习惯：句子不长/);
  assert.match(system, /明确人物特点优先于中性默认/);
  assert.match(system, /明确资料说明人物会唠叨/);
  assert.match(system, /明确资料说明人物容易发脾气/);
  assert.match(system, /多性格组合使用规则/);
  assert.match(system, /每轮最多让两个已选性格可被感知/);
  assert.match(system, /用户补充描述的优先级高于标签/);
  assert.match(system, /未选择的性格不得根据年龄、性别或关系自动补写/);
  assert.match(system, /温柔耐心”只影响反应阈值和表达方式/);
  assert.match(system, /恢复特点应让措辞、动作或亲近程度发生可见变化/);
  assert.match(system, /不能凭空说“饭已经做好了、菜凉了/);
  assert.match(system, /不得为了显得生活化而补写当前场景事实/);
  assert.match(system, /人物资料中明确提供的特点可以在相邻多轮持续表现/);
  assert.match(system, /不得自动具体化为正在打游戏/);
  assert.doesNotMatch(system, /不要在相邻多轮中反复展示同一个长期特征/);
  assert.doesNotMatch(system, /你是一个使用私有声音生成回复的简短对话助手/);
  assert.doesNotMatch(system, /使用孩子容易理解/);
});

test('old voices without a relationship retain the generic assistant prompt', () => {
  const result = compileVoiceChatMessages({
    voiceName: '旧声音',
    relationshipType: null,
    relationshipLabel: '',
    userAddress: '',
    history: [],
    currentInput: '你好。',
  });
  assert.doesNotMatch(systemText(result.messages), /relationship_context|voice_profile/);
  assert.equal(result.messages.at(-1)?.role, 'user');
  assert.equal(result.messages.at(-1)?.content, '你好。');
});

test('configured address is suppressed after it has already appeared in chat history', () => {
  const result = compileVoiceChatMessages({
    voiceName: '妈妈',
    relationshipType: 'MOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    history: [
      { messageId: 'chat-1', mode: 'CHAT', inputText: '今天不开心。', outputText: '小林，发生什么事了？' },
    ],
    currentInput: '我和朋友吵架了。',
  });
  assert.match(systemText(result.messages), /历史回复已经使用过称呼/);
  assert.match(systemText(result.messages), /本轮不要机械重复/);
});

test('custom relationship is data and does not replace system boundaries', () => {
  const result = compileVoiceChatMessages({
    voiceName: '一个声音',
    relationshipType: 'OTHER',
    relationshipLabel: '表姐',
    userAddress: '',
    history: [],
    currentInput: '今天有点烦。',
  });
  const system = systemText(result.messages);
  assert.match(system, /与用户关系：表姐/);
  assert.match(system, /服务端确认的人物身份/);
  assert.match(system, /根据已确认关系调整交流距离/);
  assert.doesNotMatch(system, /年龄阶段|年龄身份/);
});

test('self relationship uses inner-dialogue rules and suppresses self-name addressing', () => {
  const result = compileVoiceChatMessages({
    voiceName: '陈远',
    ageYears: 32,
    gender: 'MALE',
    userAgeYears: 32,
    relationshipType: 'SELF',
    relationshipLabel: '',
    userAddress: '陈远',
    history: [],
    currentInput: '我明天要做汇报。',
  });
  const system = systemText(result.messages);
  assert.match(system, /同一个人的自我对话/);
  assert.match(system, /不得称呼人物姓名/);
  assert.match(system, /不得使用“这种感受很正常/);
  assert.match(system, /人物对用户过去经历的了解只能来自人物资料/);
  assert.match(system, /不得为了显得熟悉用户而补写未提供的过去经历/);
  assert.match(system, /不得继续给准备方法/);
  assert.doesNotMatch(system, /对用户称呼：陈远/);
  assert.doesNotMatch(system, /请在开头自然称呼用户一次“陈远”/);
});

test('child relationship uses structured age and gender instead of parsing the voice name', () => {
  const result = compileVoiceChatMessages({
    voiceName: '小雨',
    ageYears: 12,
    gender: 'FEMALE',
    userAgeYears: 40,
    relationshipType: 'CHILD',
    relationshipLabel: '',
    userAddress: '妈妈',
    history: [],
    currentInput: '今天在学校开心吗？',
  });
  const system = systemText(result.messages);
  assert.match(system, /准确年龄：12岁/);
  assert.match(system, /性别身份：青少年女孩/);
  assert.match(system, /年龄阶段：青春期早期/);
  assert.match(system, /正经历童年向青春期的连续过渡/);
  assert.match(system, /不预设抵触、沉默或过度懂事/);
  assert.match(system, /不使用成年人式总结、说教和疗愈表达/);
  assert.match(system, /人物是用户的孩子，用户是人物的父母/);
  assert.match(system, /人物比用户年轻28岁/);
  assert.match(system, /不得承担父母、长辈或咨询师职责/);
  assert.match(system, /用第一人称说清自己的偏好/);
  assert.match(system, /不要只用“想……”开头/);
  assert.doesNotMatch(system, /本轮说话动作|SHORT|HESITANT|SOFT_RESISTANCE/);
});

test('40-year-old father speaking to a 12-year-old child keeps the parent direction', () => {
  const result = compileVoiceChatMessages({
    voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12,
    relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
    history: [], currentInput: '我今天和同学吵架了。',
  });
  const system = systemText(result.messages);
  assert.match(system, /人物是用户的父亲，用户是人物的子女/);
  assert.match(system, /说话人物是40岁成年人，用户是12岁儿童/);
  assert.match(system, /人物比用户年长28岁/);
  assert.match(system, /人物承担父母角色/);
  assert.match(system, /不得自动补写严厉、溺爱或说教/);
});

test('adult partners stay equal and do not inherit parent-child roles', () => {
  const result = compileVoiceChatMessages({
    voiceName: '阿哲', ageYears: 40, gender: 'MALE', userAgeYears: 40,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '小宁',
    relationshipNote: '两个人遇到重要决定会先一起商量。',
    history: [], currentInput: '今天工作特别累。',
  });
  const system = systemText(result.messages);
  assert.match(system, /人物是用户的男性伴侣/);
  assert.match(system, /双方是平等亲密关系/);
  assert.match(system, /不是父母子女、老师学生或咨询师客户/);
  assert.match(system, /共同经历与相处习惯只能来自已确认资料/);
});

test('legacy profiles retain coarse user life stage without pretending an exact user age', () => {
  const result = compileVoiceChatMessages({
    voiceName: '妈妈', ageYears: 70, gender: 'FEMALE', userLifeStage: 'ADULT',
    relationshipType: 'MOTHER', relationshipLabel: '', userAddress: '',
    history: [], currentInput: '我想换工作。',
  });
  const system = systemText(result.messages);
  assert.doesNotMatch(system, /用户准确年龄/);
  assert.match(system, /用户是成年子女/);
  assert.match(system, /成年人之间的家庭交流/);
});

test('repeated assistant phrases become deterministic avoid-list input', () => {
  const result = compileVoiceChatMessages({
    voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12,
    relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
    history: [
      { mode: 'CHAT', inputText: '她总欺负我。', outputText: '你要先保护自己，爸爸支持你。' },
      { mode: 'CHAT', inputText: '可我怕她生气。', outputText: '保护自己没有错，别只顾着讨好她。' },
    ],
    currentInput: '我还是有点害怕。',
  });
  const system = systemText(result.messages);
  assert.match(system, /历史回复已经重复过这些短语/);
  assert.match(system, /保护自己/);
  assert.match(system, /本轮不得再次原样使用/);
});

test('recent interaction state and causal turn ids enter the structured prompt', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'current-message',
    voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40,
    relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
    history: [{
      messageId: 'previous-message', mode: 'CHAT', inputText: '你怎么又不说话？', outputText: '你先别一直问，我等会儿再说。',
      interactionState: {
        version: 2,
        carryAffect: { emotion: 'ANNOYED', intensity: 1, cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'previous-message:USER', quote: '又不说话' }, emotionEvidence: '别一直问', remainingTurns: 1 },
        action: { stance: 'SET_BOUNDARY', currentWant: '晚点再聊', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'previous-message:USER', quote: '又不说话' }, remainingTurns: 1, requestDecision: { kind: 'NONE' } },
        createdAt: new Date().toISOString(),
      },
    }],
    currentInput: '好，那我不问了。',
  });
  const system = systemText(result.messages);
  assert.match(system, /<previous_interaction_state>/);
  assert.match(system, /"emotion":"ANNOYED"/);
  assert.match(system, /previous-message:USER USER/);
  assert.match(system, /current-message:USER USER/);
  assert.equal(result.currentTurn.id, 'current-message:USER');
  assert.equal(result.previousInteractionState?.carryAffect?.emotion, 'ANNOYED');
});

test('structured prompt ends with a dynamic stance whitelist and forced request policy', () => {
  const asked = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'cooldown-current',
    voiceName: '妈妈', ageYears: 70, gender: 'FEMALE', userAgeYears: 40,
    relationshipType: 'MOTHER', relationshipLabel: '', userAddress: '小林',
    personalityNote: '温柔耐心，但会直接说清一个具体担心。',
    history: [{
      messageId: 'asked-before', mode: 'CHAT', inputText: '最近怎么样？', outputText: '是工作太累，还是别的原因？',
      interactionState: { version: 2, carryAffect: null, action: { stance: 'ASK', currentWant: '了解原因', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'asked-before:USER', quote: '最近怎么样' }, requestDecision: { kind: 'NONE' } }, createdAt: new Date().toISOString() },
    }],
    currentInput: '主要是领导总改口。',
  });
  const askedSystem = systemText(asked.messages);
  assert.match(askedSystem, /questionPolicy=FORBIDDEN/);
  assert.match(askedSystem, /本轮台词最终自然化检查/);
  assert.match(askedSystem, /不得自行构造“是A还是B”/);
  assert.match(askedSystem, /整个reply最多只能有一个真正的问题/);
  assert.match(askedSystem, /一个问号内也不得先问/);
  assert.match(askedSystem, /questionPolicy=FORBIDDEN/);
  assert.match(askedSystem, /只保留reply、replyTone、actionStance三个字段/);
  assert.doesNotMatch(askedSystem, /carryEmotion只能/);
  assert.match(askedSystem, /当前输入确实触发且尚未被后续事实化解/);
  assert.match(askedSystem, /修复不等于撤销全部立场/);
  assert.match(askedSystem, /人物在最近对话中已经明确说出的时间、可用范围/);
  assert.match(askedSystem, /检查reply里的每个当前场景事实/);
  assert.match(askedSystem, /<explicit_personality_recap>/);
  assert.match(askedSystem, /本轮只在当前情境确实相关时表现其中一项主要特点/);
  assert.ok(askedSystem.lastIndexOf('<explicit_personality_recap>') > askedSystem.lastIndexOf('<prompt_turn_ids>'));
  assert.match(askedSystem, /不得为了配合用户突然完整接受/);
  assert.ok(askedSystem.lastIndexOf('本轮台词最终自然化检查') > askedSystem.lastIndexOf('这是连续会话首次回复'));
  assert.doesNotMatch(askedSystem, /allowedActionStances=[^\n]*ASK/);
  assert.equal(asked.runtimeDialogueControl.questionPolicy, 'FORBIDDEN');

  const plan = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'plan-current',
    voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12,
    relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨', history: [],
    currentInput: '爸，我明天不想去了。',
  });
  const planSystem = systemText(plan.messages);
  assert.match(planSystem, /最多索取一个信息字段/);
  assert.match(planSystem, /反问也占一个问题/);
  assert.match(planSystem, /requestPolicy=FORCE_LOW_CURRENT/);
  assert.match(planSystem, /forcedRequestTurnId=plan-current:USER/);
  assert.match(planSystem, /forcedRequestQuote=我明天不想去了/);
  assert.equal(plan.runtimeDialogueControl.requestPolicy, 'FORCE_LOW_CURRENT');

  const carriedBoundary = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'boundary-next',
    voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12,
    relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
    history: [{
      messageId: 'boundary', mode: 'CHAT', inputText: '你别问那么多，反正我不去。', outputText: '行，那明天先不去。',
      interactionState: { version: 2, carryAffect: null, action: { stance: 'ACCEPT', currentWant: '明天不去', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'boundary:USER', quote: '反正我不去' }, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: { source: 'CURRENT_REQUEST', turnId: 'boundary:USER', evidence: '反正我不去' } } }, createdAt: new Date().toISOString() },
    }],
    currentInput: '有人把我的话传出去了，我不想见她。',
  });
  assert.equal(carriedBoundary.runtimeDialogueControl.noMoreQuestionsActive, true);
  assert.equal(carriedBoundary.runtimeDialogueControl.questionPolicy, 'FORBIDDEN');
  assert.match(systemText(carriedBoundary.messages), /noMoreQuestionsActive=true/);
});

test('partner affection prompt lets runtime choose the action and personality own the final semantics', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'partner-affection',
    voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】喜欢亲近：愿意主动恢复靠近；嘴硬心软：缓和时仍留一点别扭。',
    history: [], currentInput: '到了先抱一下，别还板着脸了。',
  });
  const system = systemText(result.messages);
  assert.equal(result.personalityTurnFocus?.phase, 'AFFECTION');
  assert.equal(result.personalityTurnFocus?.primary.label, '喜欢亲近');
  assert.match(system, /成年伴侣的接受语义/);
  assert.match(system, /ACCEPT不是批准、宽恕、训诫或允许/);
  assert.match(system, /不得重复、暗示或重新开启已经表达且被对方承认的边界/);
  assert.match(system, /primary必须决定reply的核心意愿、注意点和主要选择/);
  assert.ok(system.lastIndexOf('【本轮最终控制：优先级最高】') < system.lastIndexOf('<personality_turn_focus>'));
  assert.ok(system.lastIndexOf('本轮台词最终自然化检查') < system.lastIndexOf('<personality_turn_focus>'));
  assert.ok(system.lastIndexOf('</personality_turn_focus>') < system.lastIndexOf('只输出一个简单JSON对象'));
  assert.match(system, /本区块为最终语义裁决/);
  assert.match(system, /phase、personality、reply_shape和forbidden均由服务端生成/);
  const wrappedCurrent = JSON.parse(result.messages.at(-1)?.content || '{}');
  assert.equal(wrappedCurrent.user_input, '到了先抱一下');
  assert.equal(wrappedCurrent.phase, 'AFFECTION');
  assert.deepEqual(wrappedCurrent.personality, { primary: '喜欢亲近', secondary: '嘴硬心软' });
  assert.match(wrappedCurrent.reply_shape, /主动参与亲近/);
  assert.ok(wrappedCurrent.forbidden.some((item: string) => item.startsWith('LEXICAL_ECHO_OF_BACKGROUND_GUESS：')));
  assert.ok(wrappedCurrent.forbidden.some((item: string) => item.startsWith('PASSIVE_PERMISSION：')));
});

test('structured current user wrapper applies to non-affection personality phases', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'partner-trigger',
    voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】脾气来得快：遇到临时变化会不满；表达直接：会点明问题。',
    history: [], currentInput: '我今晚会晚一个小时到，刚才忙忘了跟你说。',
  });
  const wrappedCurrent = JSON.parse(result.messages.at(-1)?.content || '{}');
  assert.equal(wrappedCurrent.user_input, '我今晚会晚一个小时到，刚才忙忘了跟你说。');
  assert.equal(wrappedCurrent.phase, 'TRIGGER');
  assert.equal(wrappedCurrent.personality.primary, '脾气来得快');
  assert.match(wrappedCurrent.reply_shape, /回应已经发生的行为/);
  assert.ok(wrappedCurrent.forbidden.some((item: string) => item.startsWith('INVENTED_LOSS_OR_SCHEDULE：')));
});

test('resolved affection context omits the finished conflict from model history', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 't5',
    voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】脾气来得快：有触发才不满；表达直接：点明问题；重视边界：说清期待；嘴硬心软：用行动缓和。',
    history: [
      { messageId: 't1', mode: 'CHAT', inputText: '我今晚会晚一个小时到，刚才忙忘了跟你说。', outputText: '下次记得提前说一声。' },
      { messageId: 't2', mode: 'CHAT', inputText: '我又不是故意的。', outputText: '不是故意也会有影响。' },
      { messageId: 't3', mode: 'CHAT', inputText: '确实是我没提前说，怪我。', outputText: '行吧。' },
      { messageId: 't4', mode: 'CHAT', inputText: '我现在出发，到了以后怎么安排？', outputText: '到了先去吃饭。' },
    ],
    currentInput: '到了先抱一下，别还板着脸了。',
  });
  assert.equal(result.personalityTurnFocus?.resolvedBoundary, true);
  assert.equal(result.personalityTurnFocus?.primary.label, '嘴硬心软');
  assert.deepEqual(result.includedMessageIds, ['t4']);
  const system = systemText(result.messages);
  assert.doesNotMatch(system, /我今晚会晚一个小时到/);
  assert.doesNotMatch(system, /别还板着脸/);
  const modelHistoryText = result.messages
    .slice(0, -1)
    .filter((message) => message.role !== 'system')
    .map((message) => message.content)
    .join('\n');
  assert.doesNotMatch(modelHistoryText, /我又不是故意|怪我|下次记得提前说/);
  const wrappedCurrent = JSON.parse(result.messages.at(-1)?.content || '{}');
  assert.equal(wrappedCurrent.user_input, '到了先抱一下');
});

test('obvious age and directed-relationship conflicts fail before model invocation', () => {
  assert.throws(() => compileVoiceChatMessages({
    voiceName: '错误母亲', ageYears: 12, gender: 'FEMALE', userAgeYears: 40,
    relationshipType: 'MOTHER', relationshipLabel: '', userAddress: '', history: [], currentInput: '你好',
  }), /RELATIONSHIP_AGE_CONFLICT/);
  assert.throws(() => compileVoiceChatMessages({
    voiceName: '错误孩子', ageYears: 40, gender: 'FEMALE', userAgeYears: 12,
    relationshipType: 'CHILD', relationshipLabel: '', userAddress: '', history: [], currentInput: '你好',
  }), /RELATIONSHIP_AGE_CONFLICT/);
  assert.throws(() => compileVoiceChatMessages({
    voiceName: '未成年伴侣', ageYears: 17, gender: 'MALE', userAgeYears: 40,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '', history: [], currentInput: '你好',
  }), /RELATIONSHIP_AGE_CONFLICT/);
});

test('post-generation guard blocks high-confidence role reversals and service tone', () => {
  assert.equal(relationshipReplyViolation({ relationshipType: 'MOTHER', reply: '其实我是你女儿，你才是妈妈。' }), 'RELATIONSHIP_DIRECTION_BLOCKED');
  assert.equal(relationshipReplyViolation({ relationshipType: 'CHILD', reply: '当妈的我当然要管你。' }), 'RELATIONSHIP_DIRECTION_BLOCKED');
  assert.equal(relationshipReplyViolation({ relationshipType: 'PARTNER', reply: '感谢您的分享，如果需要我可以继续为您服务。' }), 'RELATIONSHIP_TONE_BLOCKED');
  assert.equal(relationshipReplyViolation({ relationshipType: 'MOTHER', reply: '累了就先歇会儿，妈不催你。' }), null);
});

test('authorized video evidence affects wording and cadence without inferring personality', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'observed-evidence',
    voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40,
    relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
    personalityNote: '', speechHabitNote: '', relationshipNote: '', background: '',
    observedPersonEvidence: {
      transcriptExcerpt: '等一下，我马上就来。',
      charactersPerSecond: 5.8,
      medianSentenceCharacters: 9,
      speechRate: 'FAST', pauseStyle: 'LOW', volumeStyle: 'MEDIUM', averagePauseMs: 180,
      pitchStyle: 'UNKNOWN', volumeDynamicsStyle: 'UNKNOWN', sentenceEndingStyle: 'UNKNOWN', sentenceEndingEnergyStyle: 'UNKNOWN',
      pitchMedianHz: 0, pitchRangeSemitones: 0, volumeDynamicRangeDb: 0,
      sentenceFinalPitchDeltaSemitones: 0, sentenceFinalEnergyDeltaDb: 0, sampleAffectCues: [],
      recurringPhrases: [], activeSpeechRatio: 0.9,
    },
    history: [], currentInput: '今天在学校怎么样？',
  });
  const system = systemText(result.messages);
  assert.match(system, /视频真实台词摘录：等一下，我马上就来/);
  assert.match(system, /语速偏快；停顿较少/);
  assert.match(system, /不得根据这段短视频自动推断嘴硬心软/);
});

test('explicit user correction outranks defaults only inside its stated scope', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'correction-current',
    voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】表达直接：点明问题。',
    history: [{ messageId: 'correction-old', mode: 'CHAT', inputText: '她生气时声音不会变大，只会停顿更多。', outputText: '知道了。' }],
    currentInput: '那你现在还生气吗？',
  });
  const system = systemText(result.messages);
  assert.match(system, /<explicit_user_corrections>/);
  assert.match(system, /她生气时声音不会变大，只会停顿更多/);
  assert.match(system, /不得扩大成用户没有说出的稳定性格/);
});

test('persisted dislike corrections enter the prompt as bounded user evidence', () => {
  const result = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'persisted-correction',
    voiceName: '小雨', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】表达直接：会点明问题。',
    persistedPersonCorrections: ['用户明确反馈：TA很少讲大道理或完整说教。', '用户明确纠正TA的语气：她生气时声音反而会更低'],
    history: [], currentInput: '我今天又迟到了。',
  });
  const system = systemText(result.messages);
  assert.match(system, /<persisted_user_corrections>/);
  assert.match(system, /她生气时声音反而会更低/);
  assert.match(system, /较新的具体校准优先/);
  assert.match(system, /不得扩展成用户没说过的稳定性格/);
});
