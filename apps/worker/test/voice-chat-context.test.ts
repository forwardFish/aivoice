import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVoiceChatMessages } from '../src/chat/voice-chat-context.js';

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
  assert.doesNotMatch(system, /本轮说话动作|SHORT|HESITANT|SOFT_RESISTANCE/);
});
