import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { createVoiceDeliveryPlan } from '../src/voice-delivery-plan.js';
import { buildSpeechSynthesisPlan, buildVoicePlanInstruction, instructionWeightedLength } from '../src/speech-instruction.js';
import type { ReplyTone } from '../src/chat/interaction-state.js';

test('personality expression collapses into one four-field provider-neutral plan', () => {
  const hardSoft = createVoiceDeliveryPlan(buildEmotionExpressionPlan({
    replyTone: 'MIXED', text: '我才没有担心你，就是看你这么晚还没回来。', interactionState: null,
    personalityNote: '嘴硬心软：担心时不会直接承认。',
  }));
  assert.deepEqual(hardSoft, {
    act: 'DENY_THEN_EXPLAIN', affect: 'IRRITATED', intensity: 1,
    cadence: 'NO_SLOWDOWN_AFTER_COMMA',
  });
  assert.deepEqual(Object.keys(hardSoft).sort(), ['act', 'affect', 'cadence', 'intensity']);

  const autonomy = createVoiceDeliveryPlan(buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '你先听我说完，这是我的事，我想自己决定。', interactionState: null,
    personalityNote: '有自己的主意：对自己的事情有看法。',
  }));
  assert.equal(autonomy.act, 'ASSERT_BOUNDARY');
  assert.equal(autonomy.intensity, 2);
  const autonomySynthesis = buildSpeechSynthesisPlan(
    'IRRITATED', '你先听我说完，这是我的事，我想自己决定。', null,
    buildEmotionExpressionPlan({
      replyTone: 'IRRITATED', text: '你先听我说完，这是我的事，我想自己决定。', interactionState: null,
      personalityNote: '有自己的主意：对自己的事情有看法。',
    }),
    autonomy,
  );
  assert.equal(autonomySynthesis.pitch, 0.97);
  assert.equal(autonomySynthesis.applyAcousticOverrides, true);
});

test('the four-field plan covers all eight MVP emotional processes without adding fields', () => {
  const cases: Array<{
    tone: ReplyTone;
    text: string;
    personalityNote?: string;
    expectedAct: ReturnType<typeof createVoiceDeliveryPlan>['act'];
  }> = [
    { tone: 'POSITIVE', text: '真的假的？那太好了！', expectedAct: 'EXPRESS_DELIGHT' },
    { tone: 'CONCERNED', text: '你是不是还没吃饭？先去吃点东西。', expectedAct: 'SHOW_PRACTICAL_CARE' },
    { tone: 'IRRITATED', text: '你先听我说完，这是我的事，我想自己决定。', personalityNote: '有自己的主意：对自己的事情有看法。', expectedAct: 'ASSERT_BOUNDARY' },
    { tone: 'PLAIN', text: '你今天这么好说话呀，是不是有事求我？', personalityNote: '爱开玩笑：熟悉后会顺口调侃。', expectedAct: 'PLAYFUL_PROBE' },
    { tone: 'UNEASY', text: '你别当着别人面夸我啦，怪不好意思的。', expectedAct: 'HESITATE_OR_SHY' },
    { tone: 'LOW_ENERGY', text: '今天真的有点累，我想先休息。', expectedAct: 'SPEAK_LOW_ENERGY' },
    { tone: 'SAD_OR_HURT', text: '你刚才那样说，我心里真的有点难受。', expectedAct: 'ADMIT_HURT' },
    { tone: 'MIXED', text: '我知道啦，刚才就是有点烦，现在已经没事了。', expectedAct: 'SOFTEN_AFTER_TENSION' },
  ];
  for (const item of cases) {
    const expression = buildEmotionExpressionPlan({
      replyTone: item.tone,
      text: item.text,
      interactionState: null,
      personalityNote: item.personalityNote || '',
    });
    const deliveryPlan = createVoiceDeliveryPlan(expression);
    assert.equal(deliveryPlan.act, item.expectedAct, item.tone);
    assert.deepEqual(Object.keys(deliveryPlan).sort(), ['act', 'affect', 'cadence', 'intensity']);
    assert.ok(instructionWeightedLength(buildVoicePlanInstruction(deliveryPlan)) <= 100);
    const synthesis = buildSpeechSynthesisPlan(item.tone, item.text, null, expression, deliveryPlan);
    assert.equal(synthesis.enableSsml, false);
    assert.equal(synthesis.rate, 1);
    assert.equal(synthesis.pitch, deliveryPlan.act === 'ASSERT_BOUNDARY' ? 0.97 : 1);
    assert.equal(synthesis.volume, 50);
    assert.equal(synthesis.seed, deliveryPlan.act === 'ADMIT_HURT' ? 1 : 0);
    assert.equal(synthesis.applyAcousticOverrides, deliveryPlan.act === 'ASSERT_BOUNDARY');
  }
});

test('generic plans omit neutral acoustic overrides but preserve an explicit user correction', () => {
  const expression = buildEmotionExpressionPlan({
    replyTone: 'SAD_OR_HURT', text: '你刚才那样说，我心里真的有点难受。', interactionState: null,
  });
  const deliveryPlan = createVoiceDeliveryPlan(expression);
  const normal = buildSpeechSynthesisPlan('SAD_OR_HURT', '你刚才那样说，我心里真的有点难受。', null, expression, deliveryPlan);
  const corrected = buildSpeechSynthesisPlan('SAD_OR_HURT', '你刚才那样说，我心里真的有点难受。', {
    rateFactor: 0.95,
    pauseFactor: 1,
    volumeOffset: -2,
    instructionFragment: '原口音咬字；校准：情绪时音量更低',
  }, expression, deliveryPlan);
  assert.equal(normal.applyAcousticOverrides, false);
  assert.equal(corrected.applyAcousticOverrides, true);
  assert.equal(corrected.rate, 0.95);
  assert.equal(corrected.volume, 48);
});

test('playful and hurt replies stay audibly distinct from a casual explanation', () => {
  const playful = createVoiceDeliveryPlan(buildEmotionExpressionPlan({
    replyTone: 'PLAIN', text: '你今天这么好说话呀。', interactionState: null,
    personalityNote: '爱开玩笑：熟悉后会顺口调侃。',
  }));
  const hurt = createVoiceDeliveryPlan(buildEmotionExpressionPlan({
    replyTone: 'SAD_OR_HURT', text: '你刚才那样说，我心里真的有点难受。', interactionState: null,
  }));
  const casual = createVoiceDeliveryPlan(buildEmotionExpressionPlan({
    replyTone: 'PLAIN', text: '我知道啦，刚才就是有点忙。', interactionState: null,
  }));
  assert.equal(playful.act, 'PLAYFUL_PROBE');
  assert.equal(hurt.act, 'ADMIT_HURT');
  assert.equal(casual.act, 'CASUAL_EXPLAIN');
});

test('CosyVoice receives the same concrete boundary and playful acting direction as Seed Audio', () => {
  const boundary = buildVoicePlanInstruction({
    act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2, cadence: 'FIRM_TWO_BEAT',
  });
  const playful = buildVoicePlanInstruction({
    act: 'PLAYFUL_PROBE', affect: 'PLAYFUL', intensity: 1, cadence: 'LIGHT_FINAL_RISE',
  });
  assert.match(boundary, /觉得不被尊重/);
  assert.match(boundary, /有点委屈又不服气/);
  assert.match(boundary, /只想让妈妈先听完/);
  assert.match(playful, /顺口逗一句/);
  assert.match(playful, /问句后半带试探/);
  assert.ok(instructionWeightedLength(boundary) <= 100);
  assert.ok(instructionWeightedLength(playful) <= 100);
});

test('CosyVoice preserves the individually accepted direction for concern, hurt and recovery', () => {
  const instructions = [
    buildVoicePlanInstruction({ act: 'SHOW_PRACTICAL_CARE', affect: 'CONCERNED', intensity: 1, cadence: 'CAREFUL_STEADY' }),
    buildVoicePlanInstruction({ act: 'ADMIT_HURT', affect: 'HURT', intensity: 2, cadence: 'SOFT_FALL' }),
    buildVoicePlanInstruction({ act: 'SOFTEN_AFTER_TENSION', affect: 'MIXED', intensity: 1, cadence: 'TENSE_TO_SOFT' }),
  ];
  assert.match(instructions[0], /前一句带担心/);
  assert.match(instructions[0], /后一句更直接/);
  assert.match(instructions[1], /气息发紧、声音微颤/);
  assert.match(instructions[1], /最后压低收住/);
  assert.match(instructions[2], /前半保留一点硬/);
  assert.match(instructions[2], /转折后恢复日常节奏/);
  for (const instruction of instructions) assert.ok(instructionWeightedLength(instruction) <= 100);
});
