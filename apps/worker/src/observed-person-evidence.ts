import type { VoiceDeliveryCorrection, VoiceObservedDeliveryBaseline } from './providers/voice-provider.js';
import {
  compileTextStylePolicy,
  speechHabitFingerprintFromQualityReport,
  textStylePolicyPrompt,
  type EvidenceScope,
  type SpeechHabitFingerprint,
  type TextStyleTurnContext,
} from './speech-habit-fingerprint.js';

export type ObservedPersonEvidence = SpeechHabitFingerprint;
export type { EvidenceScope, SpeechHabitFingerprint, TextStylePolicy } from './speech-habit-fingerprint.js';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampText(value: unknown, maxCharacters: number): string {
  return Array.from(String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim())
    .slice(0, maxCharacters)
    .join('');
}

export function observedPersonEvidenceFromQualityReport(
  value: unknown,
  expected?: Partial<EvidenceScope>,
): ObservedPersonEvidence | null {
  return speechHabitFingerprintFromQualityReport(value, expected);
}

export function observedPersonEvidencePrompt(
  evidence: ObservedPersonEvidence | null,
  turn: TextStyleTurnContext = { turnKey: 'no-turn-key', recentReplies: [], historyComplete: false },
): string[] {
  return textStylePolicyPrompt(compileTextStylePolicy(evidence, turn));
}

export function persistedPersonCorrectionsFromQualityReport(value: unknown): string[] {
  const report = object(value);
  const rows = Array.isArray(report.passiveCorrections)
    ? report.passiveCorrections
    : Array.isArray(report.passive_corrections) ? report.passive_corrections : [];
  const newestFirst = rows.slice(-8).reverse();
  const unique: string[] = [];
  for (const row of newestFirst) {
    const entry = object(row);
    const instruction = clampText(entry.instruction, 100);
    if (!instruction || unique.includes(instruction)) continue;
    unique.push(instruction);
    if (unique.length >= 4) break;
  }
  return unique.reverse();
}

export interface DeprecatedSpeechPlanBaseline {
  rateFactor: number;
  pauseFactor: number;
  volumeOffset: number;
  instructionFragment: string;
}

/**
 * Sample acoustics no longer control TTS. Kept as a compatibility export for
 * old offline acceptance scripts; production identity-locked paths do not use it.
 */
export function observedSpeechPlanBaseline(
  _evidence: ObservedPersonEvidence | null,
): DeprecatedSpeechPlanBaseline | null {
  return null;
}

function explicitToneCorrection(value: unknown): VoiceDeliveryCorrection | undefined {
  const instruction = clampText(value, 100);
  if (/(?:声音|音量).{0,8}(?:更低|小一点|更小|不会变大|不变大|别变大)|不喊/u.test(instruction)) return 'VOLUME_SOFTER';
  if (/(?:声音|音量).{0,8}(?:更高|大一点|更大)/u.test(instruction)) return 'VOLUME_STRONGER';
  if (/(?:语速|说话).{0,8}(?:更慢|慢一点)/u.test(instruction)) return 'SPEAK_SLOWER';
  if (/(?:语速|说话).{0,8}(?:更快|快一点)/u.test(instruction)) return 'SPEAK_FASTER';
  if (/(?:停顿).{0,8}(?:更多|长一点|更长)/u.test(instruction)) return 'PAUSE_MORE';
  if (/(?:停顿).{0,8}(?:更少|短一点|更短)/u.test(instruction)) return 'PAUSE_LESS';
  if (/(?:语调|音高).{0,8}(?:更平|平一点|没那么大起伏)/u.test(instruction)) return 'PITCH_FLATTER';
  if (/(?:语调|音高).{0,8}(?:起伏更大|更有起伏)/u.test(instruction)) return 'PITCH_MORE_DYNAMIC';
  return undefined;
}

function latestToneCorrection(value: unknown): VoiceDeliveryCorrection | undefined {
  const report = object(value);
  const rows = Array.isArray(report.passiveCorrections)
    ? report.passiveCorrections
    : Array.isArray(report.passive_corrections) ? report.passive_corrections : [];
  const row = [...rows].reverse().map(object).find((entry) => String(entry.reason || '') === 'TONE_NOT_LIKE');
  return explicitToneCorrection(row?.instruction);
}

export function speechPlanBaselineWithCorrections(
  _evidence: ObservedPersonEvidence | null,
  qualityReport: unknown,
): DeprecatedSpeechPlanBaseline | null {
  const correction = latestToneCorrection(qualityReport);
  if (!correction) return null;
  const base: DeprecatedSpeechPlanBaseline = {
    rateFactor: 1,
    pauseFactor: 1,
    volumeOffset: 0,
    instructionFragment: `仅用户显式校准：${correction}`,
  };
  if (correction === 'SPEAK_SLOWER') base.rateFactor = 0.95;
  if (correction === 'SPEAK_FASTER') base.rateFactor = 1.05;
  if (correction === 'PAUSE_MORE') base.pauseFactor = 1.18;
  if (correction === 'PAUSE_LESS') base.pauseFactor = 0.86;
  if (correction === 'VOLUME_SOFTER') base.volumeOffset = -2;
  if (correction === 'VOLUME_STRONGER') base.volumeOffset = 2;
  return base;
}

export function voiceObservedDeliveryBaselineWithCorrections(
  _evidence: ObservedPersonEvidence | null,
  qualityReport: unknown,
): VoiceObservedDeliveryBaseline | null {
  const correction = latestToneCorrection(qualityReport);
  if (!correction) return null;
  return {
    speechRate: 'MEDIUM',
    pauseStyle: 'MEDIUM',
    pitchStyle: 'UNKNOWN',
    sentenceEndingStyle: 'UNKNOWN',
    volumeDynamicsStyle: 'UNKNOWN',
    correction,
  };
}
