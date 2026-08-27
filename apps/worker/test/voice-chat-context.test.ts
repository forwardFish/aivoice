import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVoiceChatMessages, relationshipReplyViolation } from '../src/chat/voice-chat-context.js';

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
  assert.match(result.messages[0]?.content || '', /人物是用户的母亲/);
  assert.match(result.messages[0]?.content || '', /任何回复都禁止出现“AI”/);
  assert.match(result.messages[0]?.content || '', /用户询问身份时/);
  assert.match(result.messages[0]?.content || '', /对用户称呼：小林/);
  assert.match(result.messages[0]?.content || '', /连续会话首次回复/);
  assert.deepEqual(result.includedMessageIds, ['chat-1']);
  assert.deepEqual(result.messages.slice(1), [
    { role: 'user', content: '今天被批评了。' },
    { role: 'assistant', content: '听起来很委屈。' },
    { role: 'user', content: '后来他向我道歉了。' },
  ]);
  assert.match(result.contextHash, /^[a-f0-9]{64}$/);
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
    history: [],
    currentInput: '最近过得怎么样？',
  });
  const system = result.messages[0]?.content || '';
  assert.match(system, /人物是用户的母亲/);
  assert.match(system, /用户人生阶段：成年阶段/);
  assert.match(system, /用户准确年龄：40岁/);
  assert.match(system, /人物比用户年长30岁/);
  assert.match(system, /人物是用户的母亲，用户是人物的子女/);
  assert.match(system, /方向不可反转/);
  assert.match(system, /成年人之间的家庭交流/);
  assert.match(system, /退休前是中学老师/);
  assert.match(system, /和成年女儿每周通话/);
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
  assert.doesNotMatch(result.messages[0]?.content || '', /relationship_context|voice_profile/);
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
  assert.match(result.messages[0]?.content || '', /历史回复已经使用过称呼/);
  assert.match(result.messages[0]?.content || '', /本轮不要机械重复/);
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
  const system = result.messages[0]?.content || '';
  assert.match(system, /与用户关系：表姐/);
  assert.match(system, /服务端确认的人物身份/);
  assert.match(system, /根据已确认关系调整交流距离/);
  assert.doesNotMatch(system, /年龄阶段|年龄身份/);
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
  const system = result.messages[0]?.content || '';
  assert.match(system, /准确年龄：12岁/);
  assert.match(system, /性别身份：青少年女孩/);
  assert.match(system, /年龄阶段：青春期早期/);
  assert.match(system, /正经历童年向青春期的连续过渡/);
  assert.match(system, /不预设抵触、沉默或过度懂事/);
  assert.match(system, /不使用成年人式总结、说教和疗愈表达/);
  assert.match(system, /人物是用户的孩子，用户是人物的父母/);
  assert.match(system, /人物比用户年轻28岁/);
  assert.match(system, /不得承担父母、长辈或咨询师职责/);
  assert.doesNotMatch(system, /本轮说话动作|SHORT|HESITANT|SOFT_RESISTANCE/);
});

test('40-year-old father speaking to a 12-year-old child keeps the parent direction', () => {
  const result = compileVoiceChatMessages({
    voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12,
    relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨',
    history: [], currentInput: '我今天和同学吵架了。',
  });
  const system = result.messages[0]?.content || '';
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
  const system = result.messages[0]?.content || '';
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
  const system = result.messages[0]?.content || '';
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
  const system = result.messages[0]?.content || '';
  assert.match(system, /历史回复已经重复过这些短语/);
  assert.match(system, /保护自己/);
  assert.match(system, /本轮不得再次原样使用/);
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
