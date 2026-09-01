import type { EmotionExpressionPlan } from './emotion-expression.js';
import type { VoiceDeliveryPlan } from './providers/voice-provider.js';

export function createVoiceDeliveryPlan(expression: EmotionExpressionPlan): VoiceDeliveryPlan {
  if (expression.personalityStyle === 'HARD_SOFT_MIXED') {
    return {
      act: 'DENY_THEN_EXPLAIN', affect: 'IRRITATED', intensity: 1,
      cadence: 'NO_SLOWDOWN_AFTER_COMMA',
    };
  }
  if (expression.personalityStyle === 'AUTONOMY_IRRITATED') {
    return {
      act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2,
      cadence: 'FIRM_TWO_BEAT',
    };
  }
  if (expression.deliveryMode === 'PLAYFUL_LIGHT') {
    return {
      act: 'PLAYFUL_PROBE', affect: 'PLAYFUL', intensity: 1,
      cadence: 'LIGHT_FINAL_RISE',
    };
  }
  if (expression.effectiveTone === 'POSITIVE') {
    return {
      act: 'EXPRESS_DELIGHT', affect: 'POSITIVE', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'BRIGHT_BOUNCE',
    };
  }
  if (expression.effectiveTone === 'CONCERNED') {
    return {
      act: 'SHOW_PRACTICAL_CARE', affect: 'CONCERNED', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'CAREFUL_STEADY',
    };
  }
  if (expression.effectiveTone === 'UNEASY') {
    return {
      act: 'HESITATE_OR_SHY', affect: 'UNEASY', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'HESITANT_SHORT',
    };
  }
  if (expression.effectiveTone === 'LOW_ENERGY') {
    return {
      act: 'SPEAK_LOW_ENERGY', affect: 'LOW_ENERGY', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'LOW_ENERGY_SPARSE',
    };
  }
  if (expression.effectiveTone === 'SAD_OR_HURT') {
    return {
      act: 'ADMIT_HURT', affect: 'HURT', intensity: 2,
      cadence: 'SOFT_FALL',
    };
  }
  if (expression.effectiveTone === 'IRRITATED') {
    return {
      act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'FIRM_TWO_BEAT',
    };
  }
  if (expression.effectiveTone === 'MIXED') {
    return {
      act: 'SOFTEN_AFTER_TENSION', affect: 'MIXED', intensity: expression.intensity >= 2 ? 2 : 1,
      cadence: 'TENSE_TO_SOFT',
    };
  }
  return {
    act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0,
    cadence: 'CONNECTED_SHORT',
  };
}

export function buildInternalTtsText(text: string, plan: VoiceDeliveryPlan): string {
  const commaActs = new Set<VoiceDeliveryPlan['act']>([
    'DENY_THEN_EXPLAIN', 'ADMIT_HURT', 'HESITATE_OR_SHY', 'SPEAK_LOW_ENERGY', 'SOFTEN_AFTER_TENSION',
  ]);
  let result = String(text || '').trim().replace(
    /(?:……+|…{2,}|\.{3,})/gu,
    commaActs.has(plan.act) ? '，' : '。',
  );
  if (plan.act === 'ASSERT_BOUNDARY' || plan.act === 'ADMIT_HURT') {
    result = result.replace(/[，,]/u, '。');
  }
  return result;
}
