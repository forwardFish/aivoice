import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, trigramJaccard } from '../src/chat/human-likeness.js';

test('human-likeness signals flag compound counselor templates without blocking natural emotion', () => {
  assert.deepEqual(
    assessHumanLikenessSignals('你的感受很正常，给自己一点时间，我会一直陪着你。', []),
    ['COUNSELOR_TEMPLATE'],
  );
  assert.equal(assessHumanLikenessSignals('你别一直替我下结论，我听着真有点烦。', []).length, 0);
});

test('human-likeness signals detect pure acknowledgements and repeated structure', () => {
  assert.ok(assessHumanLikenessSignals('嗯，知道了。', []).includes('PURE_ACKNOWLEDGEMENT'));
  assert.ok(assessHumanLikenessSignals('我先看看再说。', ['我先看看再说。']).includes('EXACT_REPLY_REPEAT'));
  assert.equal(trigramJaccard('你先别急，我问清楚再说。', '你先别急，我问清楚再说。'), 1);
  assert.ok(trigramJaccard('你先别急，我问清楚再说。', '今天特别开心。') < 0.2);
});

test('hard reply leak blocks internal state and assistant identity but allows justified anger', () => {
  assert.equal(hardReplyLeak('{"interactionState":{"emotion":"ANGRY"}}'), 'INTERNAL_STATE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('我是你的对话助手。'), 'ASSISTANT_IDENTITY_BLOCKED');
  assert.equal(hardReplyLeak('你都第三遍催了，我听见了，别一直说。'), null);
});

test('speaker fact ownership guard blocks copied user facts without misreading quotes or shared plans', () => {
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我今天拿了第一名！', reply: '妈妈！我今天拿了第一名！', subjectBackground: '正在读六年级。', recentCharacterReplies: [] }), true);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我今天拿了第一名！', reply: '真的？你拿第一名了？', subjectBackground: '正在读六年级。', recentCharacterReplies: [] }), false);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '他说“我不去了”，然后就走了。', reply: '他说不去了？', subjectBackground: null, recentCharacterReplies: [] }), false);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我们明天一起去看看吧。', reply: '行，明天一起去。', subjectBackground: null, recentCharacterReplies: [] }), false);
});
