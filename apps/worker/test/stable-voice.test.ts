import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VOICE_ACTS,
  assertIdentityStableProviderPayload,
  buildBoundedEmotionOverlay,
  buildIdentityStableVoicePlan,
  buildPinnedCosyVoiceRoute,
  buildRegisteredCloneRuntime,
  cosyVoiceInstructionUnits,
  normalizeStableTtsText,
  parseStableEmotionMode,
  shouldLockVoiceIdentity,
  supportsBoundedInstruction,
  toCosyVoiceProviderRequest,
  type CosyVoiceProviderRequest,
  type StableEmotionMode,
  type VoiceAct,
  type VoiceDeliveryPlan,
  type VoiceIntensity,
  type VoiceRuntimeProfile,
} from '../src/stable-voice.js';

const runtime: VoiceRuntimeProfile = {
  provider: 'ALIYUN_COSYVOICE',
  region: 'cn-beijing',
  modelId: 'cosyvoice-v3.5-flash',
  enrolledForModelId: 'cosyvoice-v3.5-flash',
  voiceId: 'cosyvoice-v3.5-flash-test-voice',
  origin: 'REGISTERED_CLONE',
  continuity: 'MULTI_TURN',
  languageHint: 'zh',
  audioFormat: 'wav',
  sampleRate: 24000,
};

const cadenceByAct: Record<VoiceAct, VoiceDeliveryPlan['cadence']> = {
  CASUAL_EXPLAIN: 'CONNECTED_SHORT',
  DENY_THEN_EXPLAIN: 'NO_SLOWDOWN_AFTER_COMMA',
  ASSERT_BOUNDARY: 'FIRM_TWO_BEAT',
  PLAYFUL_PROBE: 'LIGHT_FINAL_RISE',
  ADMIT_HURT: 'SOFT_FALL',
  EXPRESS_DELIGHT: 'BRIGHT_BOUNCE',
  SHOW_PRACTICAL_CARE: 'CAREFUL_STEADY',
  HESITATE_OR_SHY: 'HESITANT_SHORT',
  SPEAK_LOW_ENERGY: 'LOW_ENERGY_SPARSE',
  SOFTEN_AFTER_TENSION: 'TENSE_TO_SOFT',
};

function delivery(act: VoiceAct, intensity: VoiceIntensity): VoiceDeliveryPlan {
  return { act, intensity, affect: 'NEUTRAL', cadence: cadenceByAct[act] };
}

test('identity lock fails closed and covers every registered clone and multi-turn voice', () => {
  assert.equal(shouldLockVoiceIdentity(undefined, undefined), true);
  assert.equal(shouldLockVoiceIdentity(null, null), true);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD' },
    { origin: 'SYSTEM', continuity: 'MULTI_TURN' },
  ), true);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD' },
    { origin: 'REGISTERED_CLONE', continuity: 'SINGLE_TURN' },
  ), true);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: 30, gender: 'MALE', relationshipType: 'SELF' },
    { origin: 'SYSTEM', continuity: 'SINGLE_TURN' },
  ), true);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD' },
    { origin: 'SYSTEM', continuity: 'SINGLE_TURN' },
  ), false);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: -1, gender: null, relationshipType: 'OTHER' },
    { origin: 'SYSTEM', continuity: 'SINGLE_TURN' },
  ), true);
  assert.equal(shouldLockVoiceIdentity(
    { ageYears: 12, gender: null, relationshipType: 'OTHER' },
    { origin: 'UNKNOWN', continuity: 'UNKNOWN' } as never,
  ), true);
});

test('OFF emits no instruction for every act and intensity', () => {
  for (const act of VOICE_ACTS) {
    for (const intensity of [0, 1, 2] as const) {
      const overlay = buildBoundedEmotionOverlay(delivery(act, intensity), runtime, 'OFF');
      assert.equal(overlay.instruction, undefined, `${act}/${intensity}`);
      assert.equal(overlay.appliedCueCount, 0, `${act}/${intensity}`);
    }
  }
});

test('SAFE_ONLY enables only low-risk acts at intensity 1 or 2', () => {
  const lowRisk = new Set<VoiceAct>([
    'PLAYFUL_PROBE',
    'EXPRESS_DELIGHT',
    'HESITATE_OR_SHY',
    'SOFTEN_AFTER_TENSION',
  ]);
  for (const act of VOICE_ACTS) {
    for (const intensity of [0, 1, 2] as const) {
      const overlay = buildBoundedEmotionOverlay(delivery(act, intensity), runtime, 'SAFE_ONLY');
      assert.equal(Boolean(overlay.instruction), lowRisk.has(act) && intensity >= 1, `${act}/${intensity}`);
    }
  }
});

test('BOUNDED_ALL gates medium/high acts to intensity 2 and keeps casual text-only', () => {
  const lowRisk = new Set<VoiceAct>([
    'PLAYFUL_PROBE',
    'EXPRESS_DELIGHT',
    'HESITATE_OR_SHY',
    'SOFTEN_AFTER_TENSION',
  ]);
  for (const act of VOICE_ACTS) {
    for (const intensity of [0, 1, 2] as const) {
      const overlay = buildBoundedEmotionOverlay(delivery(act, intensity), runtime, 'BOUNDED_ALL');
      const expected = act !== 'CASUAL_EXPLAIN'
        && (lowRisk.has(act) ? intensity >= 1 : intensity === 2);
      assert.equal(Boolean(overlay.instruction), expected, `${act}/${intensity}`);
      if (overlay.instruction) {
        assert.ok(cosyVoiceInstructionUnits(overlay.instruction) <= 100);
        assert.doesNotMatch(
          overlay.instruction,
          /妈妈|女儿|熟人|岁|音色|声纹|口音|气息|微颤|哭腔|委屈|悲伤|兴奋|愤怒/u,
        );
      }
    }
  }
});

test('bounded instruction capability is model and voice-origin specific', () => {
  assert.equal(supportsBoundedInstruction(runtime), true);
  assert.equal(supportsBoundedInstruction({ modelId: 'cosyvoice-v3.5-plus', origin: 'DESIGNED' }), true);
  assert.equal(supportsBoundedInstruction({ modelId: 'cosyvoice-v3-plus', origin: 'REGISTERED_CLONE' }), false);
  assert.equal(supportsBoundedInstruction({ modelId: 'cosyvoice-v3.5-flash', origin: 'SYSTEM' }), false);
});

test('stable text normalization removes control channels but preserves spoken text', () => {
  assert.equal(
    normalizeStableTtsText(' （叹气）[sad]<speak>我知道了！！！</speak> '),
    '我知道了！',
  );
  assert.equal(normalizeStableTtsText('【紧张】（小声）真的吗？？？'), '真的吗？');
  assert.throws(() => normalizeStableTtsText('[sad]<speak></speak>'), /empty/u);
});

test('voice/model mismatch and malformed runtime fail before a request can be built', () => {
  assert.throws(() => buildIdentityStableVoicePlan({
    text: '测试。',
    delivery: delivery('CASUAL_EXPLAIN', 0),
    runtime: { ...runtime, modelId: 'cosyvoice-v3.5-plus' },
  }), /Voice\/model mismatch/u);
  assert.throws(() => buildPinnedCosyVoiceRoute({ ...runtime, voiceId: '   ' }), /voiceId/u);
});

test('provider request is strict, omits empty instruction, and pins the route', () => {
  const plan = buildIdentityStableVoicePlan({
    text: '我刚看到，等会儿就弄。',
    delivery: delivery('CASUAL_EXPLAIN', 2),
    runtime,
    emotionMode: 'BOUNDED_ALL',
  });
  const request = toCosyVoiceProviderRequest({
    jobId: 'job-1', messageId: 'message-1', runtime, plan,
  });
  assert.equal(request.instruction, undefined);
  assert.equal(request.seed, 0);
  assert.equal(request.enableSsml, false);
  assert.equal(request.textType, 'PlainText');
  for (const key of [
    'rate', 'pitch', 'volume', 'relationshipType', 'deliveryMode',
    'speechAct', 'observedBaseline', 'deliveryPlan', 'ageYears', 'gender', 'effectiveTone',
  ]) {
    assert.equal(key in request, false, key);
  }
  assert.deepEqual(buildPinnedCosyVoiceRoute(runtime), {
    strategy: 'PINNED_SINGLE',
    provider: 'ALIYUN_COSYVOICE',
    modelId: runtime.modelId,
    voiceId: runtime.voiceId,
    allowSelectiveParallel: false,
    allowProviderFallback: false,
    allowModelFallback: false,
  });
});

test('runtime provider payload guard rejects forbidden, unexpected, and arbitrary instructions', () => {
  const plan = buildIdentityStableVoicePlan({
    text: '真的啊？那太好了。',
    delivery: delivery('EXPRESS_DELIGHT', 2),
    runtime,
    emotionMode: 'SAFE_ONLY',
  });
  const valid = toCosyVoiceProviderRequest({ jobId: 'job-2', messageId: 'message-2', runtime, plan });
  assert.doesNotThrow(() => assertIdentityStableProviderPayload(valid));
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, pitch: 0.97 } as CosyVoiceProviderRequest),
    /Forbidden.*pitch/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, relationship: 'MOTHER' } as CosyVoiceProviderRequest),
    /Unexpected.*relationship/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, fingerprint: { version: 'shf/1.0' } } as CosyVoiceProviderRequest),
    /Unexpected.*fingerprint/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, speechEvidence: {} } as CosyVoiceProviderRequest),
    /Unexpected.*speechEvidence/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, instruction: '更悲伤地说。' } as CosyVoiceProviderRequest),
    /allowlist/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, instruction: '' } as CosyVoiceProviderRequest),
    /Omit instruction/u,
  );
  assert.throws(
    () => assertIdentityStableProviderPayload({ ...valid, text: '<speak>测试。</speak>' } as CosyVoiceProviderRequest),
    /normalized/u,
  );
});

test('five turns keep one identity baseline while bounded cues vary', () => {
  const turns: Array<{ text: string; delivery: VoiceDeliveryPlan }> = [
    { text: '我刚看到，等会儿就弄。', delivery: delivery('CASUAL_EXPLAIN', 0) },
    { text: '这次我想自己决定。', delivery: delivery('ASSERT_BOUNDARY', 2) },
    { text: '你刚才那句话，我听着还是有点难受。', delivery: delivery('ADMIT_HURT', 2) },
    { text: '真的啊？那太好了。', delivery: delivery('EXPRESS_DELIGHT', 2) },
    { text: '今天确实有点累，晚点再说吧。', delivery: delivery('SPEAK_LOW_ENERGY', 2) },
  ];
  const requests = turns.map((turn, index) => {
    const plan = buildIdentityStableVoicePlan({
      ...turn, runtime, emotionMode: 'BOUNDED_ALL',
    });
    return {
      fingerprint: plan.identityFingerprint,
      request: toCosyVoiceProviderRequest({
        jobId: `job-${index + 1}`,
        messageId: `message-${index + 1}`,
        runtime,
        plan,
      }),
    };
  });
  assert.equal(new Set(requests.map(({ fingerprint }) => fingerprint)).size, 1);
  assert.equal(new Set(requests.map(({ request }) => [
    request.model,
    request.voice,
    request.seed,
    request.textType,
    request.enableSsml,
    request.format,
    request.sampleRate,
    request.languageHints?.[0] ?? '',
  ].join('|'))).size, 1);
  assert.deepEqual(requests.map(({ request }) => request.instruction), [
    undefined,
    '只略重读表达立场的短语，句尾平收，其余照常。',
    '首个分句后短停，后半句平收，其余照常。',
    '只略重读开头一个词，句尾轻微上扬，其余照常。',
    '分句间略作短停，末句收短，其余照常。',
  ]);
});

test('plan/runtime fingerprints prevent cross-voice request substitution', () => {
  const plan = buildIdentityStableVoicePlan({
    text: '测试。', delivery: delivery('CASUAL_EXPLAIN', 0), runtime,
  });
  assert.throws(() => toCosyVoiceProviderRequest({
    jobId: 'job-3',
    messageId: 'message-3',
    runtime: { ...runtime, voiceId: 'another-voice' },
    plan,
  }), /plan\/runtime identity mismatch/u);
});

test('default stable emotion mode is OFF after owner no-instruction calibration', () => {
  const plan = buildIdentityStableVoicePlan({
    text: '真的啊？', delivery: delivery('EXPRESS_DELIGHT', 1), runtime,
  });
  assert.equal(plan.instruction, undefined);
  assert.equal(plan.instructionReason, 'POLICY_DISABLED');
  assert.equal(plan.appliedEmotionCueCount, 0);
});

test('all supported modes preserve the fixed acoustic baseline', () => {
  for (const emotionMode of ['OFF', 'SAFE_ONLY', 'BOUNDED_ALL'] satisfies StableEmotionMode[]) {
    const plan = buildIdentityStableVoicePlan({
      text: '这次我想自己决定。',
      delivery: delivery('ASSERT_BOUNDARY', 2),
      runtime,
      emotionMode,
    });
    assert.equal(plan.seed, 0);
    assert.equal(plan.enableSsml, false);
    assert.equal(plan.applyAcousticOverrides, false);
    assert.equal('rate' in plan, false);
    assert.equal('pitch' in plan, false);
    assert.equal('volume' in plan, false);
  }
});

test('invalid emotion modes fail closed even when an act would emit no instruction', () => {
  assert.throws(
    () => buildBoundedEmotionOverlay(
      delivery('CASUAL_EXPLAIN', 0),
      runtime,
      'UNKNOWN' as StableEmotionMode,
    ),
    /Unsupported stable emotion mode/u,
  );
});

test('stored registered binding pins provider model region and voice without profile semantics', () => {
  const built = buildRegisteredCloneRuntime({
    storedProvider: 'aliyun-cosyvoice',
    storedModel: 'cosyvoice-v3.5-plus',
    providerName: 'aliyun-cosyvoice',
    providerTargetModel: 'cosyvoice-v3.5-plus',
    voiceId: 'registered-voice-id',
    continuity: 'MULTI_TURN',
    endpoint: 'https://ws.example.cn-beijing.maas.aliyuncs.com',
  });
  assert.deepEqual(built, {
    provider: 'ALIYUN_COSYVOICE', region: 'cn-beijing',
    modelId: 'cosyvoice-v3.5-plus', enrolledForModelId: 'cosyvoice-v3.5-plus',
    voiceId: 'registered-voice-id', origin: 'REGISTERED_CLONE', continuity: 'MULTI_TURN',
    languageHint: 'zh', audioFormat: 'wav', sampleRate: 24000,
  });
  assert.throws(() => buildRegisteredCloneRuntime({
    storedProvider: 'volcengine-seed-audio', storedModel: 'cosyvoice-v3.5-plus',
    providerName: 'aliyun-cosyvoice', providerTargetModel: 'cosyvoice-v3.5-plus',
    voiceId: 'registered-voice-id', continuity: 'MULTI_TURN', endpoint: 'https://dashscope.aliyuncs.com',
  }), /provider mismatch/u);
  assert.throws(() => buildRegisteredCloneRuntime({
    storedProvider: 'aliyun-cosyvoice', storedModel: 'cosyvoice-v3.5-flash',
    providerName: 'aliyun-cosyvoice', providerTargetModel: 'cosyvoice-v3.5-plus',
    voiceId: 'registered-voice-id', continuity: 'MULTI_TURN', endpoint: 'https://dashscope.aliyuncs.com',
  }), /model mismatch/u);
});

test('production emotion mode defaults to OFF and rejects unknown configuration', () => {
  assert.equal(parseStableEmotionMode(undefined), 'OFF');
  assert.equal(parseStableEmotionMode('off'), 'OFF');
  assert.equal(parseStableEmotionMode(' bounded_all '), 'BOUNDED_ALL');
  assert.throws(() => parseStableEmotionMode('full-acting'), /Unsupported stable emotion mode/u);
});
