import assert from 'node:assert/strict';
import test from 'node:test';
import { connectShortAcknowledgement } from '../src/chat/connected-phrasing.js';
import { buildIdentityStableVoicePlan, toCosyVoiceProviderRequest, type VoiceRuntimeProfile } from '../src/stable-voice.js';

const runtime: VoiceRuntimeProfile = {
  provider: 'ALIYUN_COSYVOICE', region: 'cn-beijing', modelId: 'cosyvoice-v3.5-plus',
  enrolledForModelId: 'cosyvoice-v3.5-plus', voiceId: 'cosyvoice-v3.5-plus-owner-test',
  origin: 'REGISTERED_CLONE', continuity: 'MULTI_TURN', languageHint: 'zh', audioFormat: 'wav', sampleRate: 24000,
};
const delivery = { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'CONNECTED_SHORT' } as const;

test('connected phrasing changes only the internal declarative boundary in three actual replies', () => {
  for (const text of [
    '知道了，今天重点就是这事。需要我配合什么就说。',
    '行，那你先忙。上线要是卡住了随时喊我。',
    '行，那就先看着。有结果了再说。',
  ]) {
    const result = connectShortAcknowledgement(text);
    assert.notEqual(result, text);
    assert.equal(result.replace(/[，。]/gu, ''), text.replace(/[，。]/gu, ''));
    assert.equal(connectShortAcknowledgement(result), result);
  }
});

test('questions, quotes, explicit boundaries, long answers and non-acknowledgements retain their original phrasing', () => {
  for (const text of [
    '行，那你先忙。还有什么事吗？', '行，那我不管了。你自己盯着点就行。',
    '知道了，别再说了。到此为止。', '行，先记下来。“不要动”是原话。',
    '好，‘明天见。后天再说’。',
    '我还没答应。先把情况说清楚。', '好，先这样。明天再说。现在去休息。',
  ]) assert.equal(connectShortAcknowledgement(text), text);
});

test('the candidate preserves the registered identity and every acoustic field and defaults to original', () => {
  const text = '行，那就先看着。有结果了再说。';
  const before = buildIdentityStableVoicePlan({ text, delivery, runtime });
  const after = buildIdentityStableVoicePlan({ text, delivery, runtime, connectedChatPhrasing: true });
  assert.equal(before.text, text);
  assert.notEqual(after.text, text);
  assert.equal(before.identityFingerprint, after.identityFingerprint);
  const a = toCosyVoiceProviderRequest({ jobId: 'same-job', messageId: 'same-message', runtime, plan: before });
  const b = toCosyVoiceProviderRequest({ jobId: 'same-job', messageId: 'same-message', runtime, plan: after });
  assert.deepEqual({ ...a, text: '' }, { ...b, text: '' });
  assert.equal(b.seed, 0);
  assert.equal(b.enableSsml, false);
  assert.equal(b.instruction, undefined);
  const boundary = buildIdentityStableVoicePlan({
    text, runtime, connectedChatPhrasing: true,
    delivery: { act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2, cadence: 'FIRM_TWO_BEAT' },
  });
  assert.equal(boundary.text, text);
});
