import type { ReplyTone } from './chat/interaction-state.js';
import type { EmotionExpressionPlan } from './emotion-expression.js';
import type { VoiceAct, VoiceDeliveryMode, VoiceDeliveryPlan, VoiceSpeechAct } from './providers/voice-provider.js';
import {
  shouldLockVoiceIdentity as shouldLockStableVoiceIdentity,
  type VoiceIdentityContext,
} from './stable-voice.js';
import { buildInternalTtsText } from './voice-delivery-plan.js';

export type { VoiceIdentityContext } from './stable-voice.js';

const INSTRUCTIONS: Record<ReplyTone, string> = {
  PLAIN: '自然连贯地说，语气松一点，不要播报，也不要表演。',
  POSITIVE: '像见到亲近的人，明显开心，带一点笑意，语气轻快，不表演。',
  CONCERNED: '认真关心，语气轻柔，句尾放低，不说教。',
  LOW_ENERGY: '像真的有点累，语速稍慢，停顿自然，气息弱但清楚。',
  UNEASY: '像心里有点不安，起句轻，稍有犹豫，尾音不确定。',
  SAD_OR_HURT: '像真的有点受伤，语速稍慢，句尾收住，不哭喊。',
  IRRITATED: '有点不高兴但正常说话，不加速，不抬高音量，不表演发火。',
  MIXED: '前半还在不满，停顿后自然放软，像已经愿意和好。',
};

const COMPACT_TONE_INSTRUCTIONS: Record<ReplyTone, string> = {
  PLAIN: '自然连贯地说，不播报不表演',
  POSITIVE: '带一点笑意，轻快但不表演',
  CONCERNED: '认真关心，句尾放低，不说教',
  LOW_ENERGY: '气息稍弱，清楚但不表演疲惫',
  UNEASY: '起句轻，略犹豫，尾音不确定',
  SAD_OR_HURT: '稍微受伤，句尾收住，不哭喊',
  IRRITATED: '有点不高兴，正常说，不加速不抬音量',
  MIXED: '前半不满，短停后自然放软',
};

const DELIVERY_INSTRUCTIONS: Record<VoiceDeliveryMode, string> = {
  CASUAL: '日常连贯，句尾干净',
  BRIGHT_LIGHT: '带一点笑意，轻快但不夸张',
  DIRECT_TENSE: '轻微不满，关键词稍重，句尾短，不喊不拖',
  QUIET_UNEASY: '声音稍收，停顿自然，连着说，不用气声',
  SOFT_HURT: '声音放轻，句尾收住，不用哭腔',
  PLAYFUL_LIGHT: '带一点笑意，不故意扬尾，不搞怪',
  PRACTICAL_CARE: '认真但自然，不用安慰腔，不说教',
};

const SPEECH_ACT_INSTRUCTIONS: Record<VoiceSpeechAct, string> = {
  REPLY: '直接回应',
  AGREE: '自然接住对方的话',
  ASK: '顺口问一句',
  EXPLAIN: '马上补一句原因',
  NEGOTIATE: '直接说清自己的想法',
  TEASE: '顺口调侃一句',
  REMIND: '顺口提醒一句',
  SHARE: '自然分享',
};

const DELIVERY_PROSODY: Record<VoiceDeliveryMode, { rate: number; breakMs: number }> = {
  CASUAL: { rate: 1, breakMs: 160 },
  BRIGHT_LIGHT: { rate: 1.02, breakMs: 100 },
  DIRECT_TENSE: { rate: 1.02, breakMs: 90 },
  QUIET_UNEASY: { rate: 0.98, breakMs: 180 },
  SOFT_HURT: { rate: 0.97, breakMs: 200 },
  PLAYFUL_LIGHT: { rate: 1.02, breakMs: 90 },
  PRACTICAL_CARE: { rate: 1, breakMs: 160 },
};

function deliveryInstruction(expression: EmotionExpressionPlan): string {
  return `${SPEECH_ACT_INSTRUCTIONS[expression.speechAct]}；${DELIVERY_INSTRUCTIONS[expression.deliveryMode]}`;
}

export interface SpeechPlanBaseline {
  rateFactor: number;
  pauseFactor: number;
  volumeOffset: number;
  instructionFragment: string;
}

export function shouldLockVoiceIdentity(
  context: VoiceIdentityContext | null | undefined,
): boolean {
  return shouldLockStableVoiceIdentity(context, null);
}

const PROSODY: Record<ReplyTone, { rate: number; pitch: number; volume: number; breakMs: number }> = {
  PLAIN: { rate: 0.98, pitch: 1, volume: 50, breakMs: 260 },
  POSITIVE: { rate: 1.03, pitch: 1, volume: 50, breakMs: 100 },
  CONCERNED: { rate: 0.96, pitch: 1, volume: 50, breakMs: 240 },
  LOW_ENERGY: { rate: 0.93, pitch: 1, volume: 50, breakMs: 300 },
  UNEASY: { rate: 0.97, pitch: 1, volume: 50, breakMs: 260 },
  SAD_OR_HURT: { rate: 0.93, pitch: 1, volume: 50, breakMs: 320 },
  IRRITATED: { rate: 0.99, pitch: 1, volume: 50, breakMs: 240 },
  MIXED: { rate: 0.98, pitch: 1, volume: 50, breakMs: 360 },
};

function escapeSsml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function withFirstPause(value: string, breakMs: number): string {
  const match = value.match(/^([\s\S]*?[，,。！？!?；;])([\s\S]+)$/u);
  if (!match) return escapeSsml(value);
  return `${escapeSsml(match[1])}<break time="${breakMs}ms"/>${escapeSsml(match[2])}`;
}

function internalPauseBoundaryCount(value: string): number {
  return Array.from(value.matchAll(/[，,；;]/gu)).length;
}

export function shouldUseExplicitPause(
  text: string,
  baseline: SpeechPlanBaseline | null,
  expression: EmotionExpressionPlan,
): boolean {
  if (internalPauseBoundaryCount(text) !== 1) return false;
  if (['EXPLAIN', 'NEGOTIATE', 'TEASE', 'REMIND'].includes(expression.speechAct)) return false;
  const combinedPauseFactor = (baseline?.pauseFactor || 1) * expression.pauseFactor;
  return combinedPauseFactor >= 1.05;
}

export function instructionWeightedLength(value: string): number {
  return Array.from(value).reduce((sum, character) => sum + (/\p{Script=Han}/u.test(character) ? 2 : 1), 0);
}

const VOICE_PLAN_INSTRUCTIONS: Record<VoiceAct, string> = {
  CASUAL_EXPLAIN: '自然回应并表达自己的想法，不是在要求对方；整句连着说，最后轻轻收住。',
  DENY_THEN_EXPLAIN: '先短促否认，紧接着解释；逗号后不减速，最后短收。',
  ASSERT_BOUNDARY: '清楚表达自己的立场；不是吵架，关键词稍重，句尾平收。',
  PLAYFUL_PROBE: '顺口逗一句；问句后半带试探，只在结尾轻轻上扬。',
  ADMIT_HURT: '先说清受到影响的原因，首个分句后短停，后半句平收。',
  EXPRESS_DELIGHT: '起句真实惊喜，中间轻快，最后自然上扬后短收。',
  SHOW_PRACTICAL_CARE: '先问再提醒；前一句带担心，后一句更直接，不说教。',
  HESITATE_OR_SHY: '开头轻，第一处分句短停，后面小心说完，结尾带一点不确定。',
  SPEAK_LOW_ENERGY: '分句间短停，第二句更短，说完就停。',
  SOFTEN_AFTER_TENSION: '前半保留一点硬，转折后恢复日常节奏，最后短收。',
};

export function buildVoicePlanInstruction(
  plan: VoiceDeliveryPlan,
  baseline: SpeechPlanBaseline | null = null,
  identityContext?: VoiceIdentityContext | null,
): string {
  void identityContext;
  const base = VOICE_PLAN_INSTRUCTIONS[plan.act];
  const correction = baseline?.instructionFragment.match(/校准：[^；。]+/u)?.[0] || '';
  const withCorrection = correction ? `${base}${correction}。` : base;
  return instructionWeightedLength(withCorrection) <= 100 ? withCorrection : base;
}

export function buildSpeechInstruction(
  replyTone: ReplyTone,
  baseline: SpeechPlanBaseline | null = null,
  expression: EmotionExpressionPlan | null = null,
): string {
  const defaultInstruction = INSTRUCTIONS[replyTone] || INSTRUCTIONS.PLAIN;
  const emotionInstruction = expression
    ? deliveryInstruction(expression)
    : COMPACT_TONE_INSTRUCTIONS[replyTone] || COMPACT_TONE_INSTRUCTIONS.PLAIN;
  if (!baseline && !expression) return defaultInstruction;
  const candidates = baseline ? [
    `${baseline.instructionFragment}；${emotionInstruction}。`,
    `${(() => {
      const correction = baseline.instructionFragment.match(/校准：[^；。]+/u)?.[0] || '';
      const baseParts = baseline.instructionFragment.replace(/^(?:参考：|原口音咬字；)/u, '').split('、').slice(0, 2);
      return ['原口音咬字', ...baseParts, correction].filter(Boolean).join('；');
    })()}；${emotionInstruction}。`,
    `${emotionInstruction}。`,
  ] : [`${emotionInstruction}。`];
  const instruction = candidates.find((candidate) => instructionWeightedLength(candidate) <= 100);
  if (!instruction) throw new Error('COSYVOICE_INSTRUCTION_TOO_LONG');
  return instruction;
}

function bounded(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildSpeechSynthesisPlan(
  replyTone: ReplyTone,
  text: string,
  baseline: SpeechPlanBaseline | null = null,
  expression: EmotionExpressionPlan | null = null,
  deliveryPlan: VoiceDeliveryPlan | null = null,
  identityContext?: VoiceIdentityContext | null,
): {
  text: string;
  instruction: string;
  rate: number;
  pitch: number;
  volume: number;
  seed: number;
  effectiveTone: ReplyTone;
  emotionIntensity: 0 | 1 | 2 | 3;
  enableSsml: boolean;
  applyAcousticOverrides: boolean;
  identityLocked: boolean;
} {
  const effectiveTone = expression?.effectiveTone || replyTone;
  if (identityContext !== undefined) {
    throw new Error('Registered identities require buildIdentityStableVoicePlan.');
  }
  if (deliveryPlan) {
    const hasExplicitCorrection = Boolean(baseline?.instructionFragment.includes('校准：'));
    return {
      text: buildInternalTtsText(text, deliveryPlan),
      instruction: buildVoicePlanInstruction(deliveryPlan, baseline, identityContext),
      rate: hasExplicitCorrection ? Number(bounded(baseline?.rateFactor || 1, 0.85, 1.15).toFixed(3)) : 1,
      pitch: 1,
      volume: hasExplicitCorrection ? Math.round(bounded(50 + (baseline?.volumeOffset || 0), 45, 55)) : 50,
      seed: 0,
      effectiveTone,
      emotionIntensity: expression?.intensity || 0,
      enableSsml: false,
      applyAcousticOverrides: hasExplicitCorrection,
      identityLocked: false,
    };
  }
  const prosody = PROSODY[effectiveTone] || PROSODY.PLAIN;
  const deliveryProsody = expression ? DELIVERY_PROSODY[expression.deliveryMode] : null;
  const rate = Number(bounded((deliveryProsody?.rate || prosody.rate) * (baseline?.rateFactor || 1) * (expression?.rateFactor || 1), 0.85, 1.15).toFixed(3));
  const pitch = Number(bounded(prosody.pitch * (expression?.pitchFactor || 1), 0.95, 1.05).toFixed(3));
  const volume = Math.round(bounded(prosody.volume + (baseline?.volumeOffset || 0) + (expression?.volumeOffset || 0), 45, 55));
  const breakMs = Math.round(bounded(
    (deliveryProsody?.breakMs || prosody.breakMs) * (baseline?.pauseFactor || 1) * (expression?.pauseFactor || 1),
    70,
    expression ? 260 : 450,
  ));
  const enableSsml = expression === null || shouldUseExplicitPause(text, baseline, expression);
  return {
    text: enableSsml ? `<speak rate="${rate}" pitch="${pitch}" volume="${volume}">${withFirstPause(text, breakMs)}</speak>` : text,
    instruction: buildSpeechInstruction(replyTone, baseline, expression),
    rate,
    pitch,
    volume,
    seed: 0,
    effectiveTone,
    emotionIntensity: expression?.intensity || 0,
    enableSsml,
    applyAcousticOverrides: true,
    identityLocked: false,
  };
}
