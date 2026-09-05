import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIdentityStableVoicePlan,
  toCosyVoiceProviderRequest,
  type VoiceRuntimeProfile,
} from '../src/stable-voice.js';

const runtime: VoiceRuntimeProfile = {
  provider: 'ALIYUN_COSYVOICE',
  region: 'cn-beijing',
  modelId: 'cosyvoice-v3.5-plus',
  enrolledForModelId: 'cosyvoice-v3.5-plus',
  voiceId: 'registered-real-dialogue-voice',
  origin: 'REGISTERED_CLONE',
  continuity: 'MULTI_TURN',
  languageHint: 'zh',
  audioFormat: 'wav',
  sampleRate: 24000,
};

const replies = [
  '刚看到，等会儿就弄。',
  '没事，我就是顺手问一句。',
  '这个我知道，你先别急。',
  '我觉得还是按原来的来比较稳。',
  '真的假的？那还挺意外的。',
  '不是那个意思，我只是觉得没必要。',
  '你刚才那句话，听着确实有点难受。',
  '行，那这次就听你的。',
  '今天有点累，晚点再聊。',
  '好，我记住了。',
];

test('ten different real-dialogue texts keep one OFF identity contract', async () => {
  const requests = replies.map((text, index) => {
    const plan = buildIdentityStableVoicePlan({
      text,
      delivery: { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'CONNECTED_SHORT' },
      runtime,
    });
    return {
      plan,
      request: toCosyVoiceProviderRequest({
        jobId: `job-${index + 1}`,
        messageId: `message-${index + 1}`,
        runtime,
        plan,
      }),
    };
  });
  const calls: string[] = [];
  for (const { request } of requests) calls.push(request.text);

  assert.equal(calls.length, 10);
  assert.equal(new Set(calls).size, 10);
  assert.equal(new Set(requests.map(({ plan }) => plan.identityFingerprint)).size, 1);
  for (const { plan, request } of requests) {
    assert.equal(plan.instruction, undefined);
    assert.equal(plan.instructionReason, 'NO_EMOTION_REQUESTED');
    assert.equal(request.instruction, undefined);
    assert.equal(request.seed, 0);
    assert.equal(request.textType, 'PlainText');
    assert.equal(request.enableSsml, false);
    assert.equal('rate' in request, false);
    assert.equal('pitch' in request, false);
    assert.equal('volume' in request, false);
  }
});
