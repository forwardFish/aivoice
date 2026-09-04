import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { createVoiceDeliveryPlan } from '../src/voice-delivery-plan.js';
import {
  buildSpeechSynthesisPlan,
  buildVoicePlanInstruction,
  shouldLockVoiceIdentity,
  type VoiceIdentityContext,
} from '../src/speech-instruction.js';
import type { ReplyTone } from '../src/chat/interaction-state.js';

const adultSelf: VoiceIdentityContext = {
  ageYears: 43,
  gender: 'MALE',
  relationshipType: 'SELF',
};

test('legacy synthesis rejects registered identities and routes them to the stable builder', () => {
  const cases: Array<{ tone: ReplyTone; text: string }> = [
    { tone: 'PLAIN', text: '老样子，没什么特别的。' },
    { tone: 'UNEASY', text: '就是不知道该怎么接才合适。' },
    { tone: 'IRRITATED', text: '这事我想自己决定。' },
    { tone: 'SAD_OR_HURT', text: '这话听着确实有点难受。' },
    { tone: 'POSITIVE', text: '这次还真挺顺利的。' },
  ];

  for (const item of cases) {
    const expression = buildEmotionExpressionPlan({
      replyTone: item.tone,
      text: item.text,
      interactionState: null,
    });
    const deliveryPlan = createVoiceDeliveryPlan(expression);
    assert.throws(
      () => buildSpeechSynthesisPlan(
        item.tone,
        item.text,
        null,
        expression,
        deliveryPlan,
        adultSelf,
      ),
      /buildIdentityStableVoicePlan/u,
    );
  }
});

test('all legacy identity contexts fail closed, including registered children', () => {
  assert.equal(shouldLockVoiceIdentity({ ageYears: 70, gender: 'FEMALE', relationshipType: 'MOTHER' }), true);
  assert.equal(shouldLockVoiceIdentity({ ageYears: 40, gender: 'MALE', relationshipType: 'PARTNER' }), true);
  assert.equal(shouldLockVoiceIdentity({ ageYears: null, gender: null, relationshipType: 'OTHER' }), true);
  assert.equal(shouldLockVoiceIdentity({ ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD' }), true);
  assert.equal(shouldLockVoiceIdentity(undefined), true);
});

test('legacy templates never compile age gender or relationship into TTS instructions', () => {
  const child: VoiceIdentityContext = {
    ageYears: 12,
    gender: 'FEMALE',
    relationshipType: 'CHILD',
  };
  const boundary = buildVoicePlanInstruction({
    act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2, cadence: 'FIRM_TWO_BEAT',
  }, null, child);
  const playful = buildVoicePlanInstruction({
    act: 'PLAYFUL_PROBE', affect: 'PLAYFUL', intensity: 1, cadence: 'LIGHT_FINAL_RISE',
  }, null, child);

  assert.match(boundary, /表达自己的立场/u);
  assert.match(playful, /顺口逗一句/u);
  assert.doesNotMatch(`${boundary}${playful}`, /12岁|女孩|男孩|孩子|家长|妈妈|她|熟人/u);
});
