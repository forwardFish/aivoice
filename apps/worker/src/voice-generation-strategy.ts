import type { EmotionExpressionPlan } from './emotion-expression.js';

export type VoiceGenerationStrategy = 'SINGLE' | 'SELECTIVE_PARALLEL';

export interface VoiceGenerationCandidate {
  id: string;
  qualityRank: number;
  generate: () => Promise<Buffer>;
}

export interface GeneratedVoiceCandidate {
  id: string;
  qualityRank: number;
  audio: Buffer;
  elapsedMs: number;
}

interface SettledVoiceCandidate {
  index: number;
  id: string;
  qualityRank: number;
  ok: boolean;
  audio?: Buffer;
  elapsedMs: number;
  error?: unknown;
}

export interface VoiceGenerationSession {
  primary: GeneratedVoiceCandidate;
  bestUpgrade: Promise<GeneratedVoiceCandidate | null>;
}

const EMOTIONAL_TURN = /但|不过|就是|其实|还是|偏偏|明明/u;

export function voiceGenerationStrategy(env: NodeJS.ProcessEnv = process.env): VoiceGenerationStrategy {
  const configured = String(env.AIVOICE_VOICE_STRATEGY || '').trim().toLowerCase();
  if (configured === 'selective-parallel' || configured === 'parallel') return 'SELECTIVE_PARALLEL';
  if (configured === 'single') return 'SINGLE';
  return String(env.AIVOICE_DUAL_VOICE_ENABLED || '').trim().toLowerCase() === 'true'
    ? 'SELECTIVE_PARALLEL'
    : 'SINGLE';
}

export function shouldUseParallelVoice(input: {
  mode: 'CHAT' | 'EXACT_SPEECH';
  text: string;
  expression: EmotionExpressionPlan;
}): boolean {
  if (input.mode !== 'CHAT') return false;
  // Real listening acceptance found CosyVoice consistently more natural for
  // hurt delivery. Do not let a slower Seed result overwrite that accepted
  // provider choice merely because the emotion is strong.
  if (input.expression.effectiveTone === 'SAD_OR_HURT') return false;
  if (input.expression.intensity >= 2) return true;
  if (input.expression.speechAct === 'TEASE') return true;
  if (input.expression.personalityStyle === 'HARD_SOFT_MIXED') return true;
  return input.expression.effectiveTone === 'MIXED' && EMOTIONAL_TURN.test(input.text);
}

async function settle(candidate: VoiceGenerationCandidate, index: number): Promise<SettledVoiceCandidate> {
  const startedAt = Date.now();
  try {
    return {
      index,
      id: candidate.id,
      qualityRank: candidate.qualityRank,
      ok: true,
      audio: await candidate.generate(),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      index,
      id: candidate.id,
      qualityRank: candidate.qualityRank,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error,
    };
  }
}

function successful(candidate: SettledVoiceCandidate): GeneratedVoiceCandidate | null {
  return candidate.ok && candidate.audio
    ? {
        id: candidate.id,
        qualityRank: candidate.qualityRank,
        audio: candidate.audio,
        elapsedMs: candidate.elapsedMs,
      }
    : null;
}

export async function startVoiceGeneration(
  candidates: VoiceGenerationCandidate[],
): Promise<VoiceGenerationSession> {
  if (!candidates.length) throw new Error('At least one voice generation candidate is required');
  const pending = new Map<number, Promise<SettledVoiceCandidate>>(
    candidates.map((candidate, index) => [index, settle(candidate, index)]),
  );
  const failures: unknown[] = [];
  while (pending.size) {
    const first = await Promise.race(pending.values());
    pending.delete(first.index);
    const primary = successful(first);
    if (!primary) {
      failures.push(first.error);
      continue;
    }
    const bestUpgrade = Promise.all(pending.values()).then((settled) => settled
      .map(successful)
      .filter((candidate): candidate is GeneratedVoiceCandidate => Boolean(candidate))
      .filter((candidate) => candidate.qualityRank > primary.qualityRank)
      .sort((left, right) => right.qualityRank - left.qualityRank)[0] || null);
    return { primary, bestUpgrade };
  }
  throw new AggregateError(failures, 'All voice providers failed');
}
