import type { ReplyTone } from './chat/interaction-state.js';
import type { EmotionExpressionPlan } from './emotion-expression.js';
import type { VoiceDeliveryMode, VoiceSpeechAct } from './providers/voice-provider.js';

const INSTRUCTIONS: Record<ReplyTone, string> = {
  PLAIN: '像熟人随口说，语气松一点，不要播报，也不要表演。',
  POSITIVE: '像见到亲近的人，明显开心，带一点笑意，语气轻快，不表演。',
  CONCERNED: '像在认真关心熟人，语气轻柔，句尾放低，不说教。',
  LOW_ENERGY: '像真的有点累，语速稍慢，停顿自然，气息弱但清楚。',
  UNEASY: '像心里有点不安，起句轻，稍有犹豫，尾音不确定。',
  SAD_OR_HURT: '像真的有点受伤，语速稍慢，句尾收住，不哭喊。',
  IRRITATED: '像熟人之间有点不高兴，正常说话，不加速，不抬高音量，不表演发火。',
  MIXED: '前半还在不满，停顿后自然放软，像已经愿意和好。',
};

const COMPACT_TONE_INSTRUCTIONS: Record<ReplyTone, string> = {
  PLAIN: '像熟人随口说，不播报不表演',
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
): {
  text: string;
  instruction: string;
  rate: number;
  pitch: number;
  volume: number;
  effectiveTone: ReplyTone;
  emotionIntensity: 0 | 1 | 2 | 3;
  enableSsml: boolean;
} {
  const effectiveTone = expression?.effectiveTone || replyTone;
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
    effectiveTone,
    emotionIntensity: expression?.intensity || 0,
    enableSsml,
  };
}
