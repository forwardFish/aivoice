import type { ReplyTone } from './chat/interaction-state.js';

const INSTRUCTIONS: Record<ReplyTone, string> = {
  PLAIN: '像熟人面对面说话，有自然轻重和呼吸，不要播报。',
  POSITIVE: '像见到亲近的人，明显开心，带一点笑意，语气轻快，不表演。',
  CONCERNED: '像在认真关心熟人，语气轻柔，句尾放低，不说教。',
  LOW_ENERGY: '像真的有点累，语速稍慢，停顿自然，气息弱但清楚。',
  UNEASY: '像心里有点不安，起句轻，稍有犹豫，尾音不确定。',
  SAD_OR_HURT: '像真的有点受伤，语速稍慢，句尾收住，不哭喊。',
  IRRITATED: '像被临时放鸽子，真实不满，咬字稍重，句尾短促，全句音量平稳。',
  MIXED: '前半还在不满，停顿后自然放软，像已经愿意和好。',
};

const PROSODY: Record<ReplyTone, { rate: number; pitch: number; volume: number; breakMs: number }> = {
  PLAIN: { rate: 1, pitch: 1, volume: 50, breakMs: 150 },
  POSITIVE: { rate: 1.03, pitch: 1, volume: 50, breakMs: 100 },
  CONCERNED: { rate: 0.96, pitch: 1, volume: 50, breakMs: 240 },
  LOW_ENERGY: { rate: 0.93, pitch: 1, volume: 50, breakMs: 300 },
  UNEASY: { rate: 0.97, pitch: 1, volume: 50, breakMs: 260 },
  SAD_OR_HURT: { rate: 0.93, pitch: 1, volume: 50, breakMs: 320 },
  IRRITATED: { rate: 1.04, pitch: 1, volume: 50, breakMs: 90 },
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

export function instructionWeightedLength(value: string): number {
  return Array.from(value).reduce((sum, character) => sum + (/\p{Script=Han}/u.test(character) ? 2 : 1), 0);
}

export function buildSpeechInstruction(replyTone: ReplyTone): string {
  const instruction = INSTRUCTIONS[replyTone] || INSTRUCTIONS.PLAIN;
  if (instructionWeightedLength(instruction) > 100) throw new Error('COSYVOICE_INSTRUCTION_TOO_LONG');
  return instruction;
}

export function buildSpeechSynthesisPlan(replyTone: ReplyTone, text: string): {
  text: string;
  instruction: string;
  rate: number;
  pitch: number;
  volume: number;
  enableSsml: true;
} {
  const prosody = PROSODY[replyTone] || PROSODY.PLAIN;
  return {
    text: `<speak rate="${prosody.rate}" pitch="${prosody.pitch}" volume="${prosody.volume}">${withFirstPause(text, prosody.breakMs)}</speak>`,
    instruction: buildSpeechInstruction(replyTone),
    rate: prosody.rate,
    pitch: prosody.pitch,
    volume: prosody.volume,
    enableSsml: true,
  };
}
