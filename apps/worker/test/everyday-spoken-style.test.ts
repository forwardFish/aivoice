import assert from 'node:assert/strict';
import test from 'node:test';
import { compileVoiceChatMessages } from '../src/chat/voice-chat-context.js';
import { EVERYDAY_SPOKEN_STYLE } from '../src/chat/everyday-spoken-style.js';

const input = {
  voiceName: '本人', relationshipType: 'SELF', relationshipLabel: '', userAddress: '',
  ageYears: 43, userAgeYears: 43, gender: 'MALE', structuredOutput: true,
  currentMessageId: 'style-current', currentInput: '别再问了。',
  history: [{ messageId: 'style-previous', mode: 'CHAT', inputText: '没啥', outputText: '好，先这样。' }],
} as const;

test('spoken style is opt-in and changes only the cacheable text guidance, never dialogue authority or history', () => {
  const base = { ...input, history: [...input.history] };
  const original = compileVoiceChatMessages(base);
  const candidate = compileVoiceChatMessages({ ...base, everydaySpokenStyle: true });
  assert.ok(!original.messages[0].content.includes(EVERYDAY_SPOKEN_STYLE));
  assert.ok(candidate.messages[0].content.endsWith(EVERYDAY_SPOKEN_STYLE));
  assert.equal(candidate.messages[0].cacheControlAt, candidate.messages[0].content.length);
  assert.deepEqual(candidate.messages.slice(1), original.messages.slice(1));
  assert.deepEqual(candidate.runtimeDialogueControl, original.runtimeDialogueControl);
  assert.deepEqual(candidate.currentTurn, original.currentTurn);
  assert.deepEqual(candidate.includedMessageIds, original.includedMessageIds);
  assert.notEqual(candidate.contextHash, original.contextHash);
  assert.deepEqual(compileVoiceChatMessages({ ...base, everydaySpokenStyle: false }), original);
});
