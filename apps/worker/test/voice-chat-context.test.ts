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
  assert.match(result.messages[0]?.content || '', /母亲与自己的孩子交流/);
  assert.match(result.messages[0]?.content || '', /不得自称妈妈/);
  assert.match(result.messages[0]?.content || '', /普通对话中不得主动出现“我是AI”/);
  assert.match(result.messages[0]?.content || '', /TA对用户的称呼：小林/);
  assert.match(result.messages[0]?.content || '', /当前连续会话首次回复/);
  assert.deepEqual(result.includedMessageIds, ['chat-1']);
  assert.deepEqual(result.messages.slice(1), [
    { role: 'user', content: '今天被批评了。' },
    { role: 'assistant', content: '听起来很委屈。' },
    { role: 'user', content: '后来他向我道歉了。' },
  ]);
  assert.match(result.contextHash, /^[a-f0-9]{64}$/);
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
  assert.match(result.messages[0]?.content || '', /历史assistant回复已经使用过称呼/);
  assert.match(result.messages[0]?.content || '', /本轮不得再次使用/);
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
  assert.match(system, /TA与用户的关系：表姐/);
  assert.match(system, /只是服务端确认的资料/);
  assert.match(system, /不代表你是真实人物/);
});
