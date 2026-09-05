export type EvidenceUse = 'TEXT_SOFT' | 'DIAGNOSTIC_ONLY' | 'DISABLED';

export type DimensionSource =
  | 'ASR_TEXT'
  | 'ASR_TIMING'
  | 'LOCAL_SILENCE'
  | 'LOCAL_ACOUSTIC';

export interface EvidenceDimension<T> {
  value: T | null;
  confidence: number;
  evidenceCount: number;
  sourceWindowMs: number;
  source: DimensionSource;
  use: EvidenceUse;
  reasons: string[];
}

export interface EvidenceScope {
  assetId: string;
  selectionId: string;
  asrTaskId: string;
  localSpeakerId: string;
  selectionStartMs: number;
  selectionEndMs: number;
  windowStartMs: number;
  windowEndMs: number;
  targetOnly: boolean;
  knownOverlap: boolean;
  originalTimeline: boolean;
}

export interface LengthValue {
  median: number;
  p25: number;
  p75: number;
}

export interface RecurringParticle {
  text: string;
  position: 'INITIAL' | 'FINAL';
  count: number;
  distinctClauseCount: number;
  opportunities: number;
  confidence: number;
}

export interface SpeechPauseEvidenceV2 {
  method: 'ASR_GAP_V1' | 'LOCAL_SILENCE_V1';
  durationsMs: number[];
  coverage: number;
  boundaryAlignedCount: number;
  longGapCount: number;
  analyzedSpanMs: number;
}

export interface SpeechParticleEvidenceV2 {
  text: string;
  position: 'INITIAL' | 'FINAL';
  count: number;
  clauseIndices: number[];
  opportunities: number;
}

export interface SpeechEvidenceV2 {
  version: 'speech-evidence/2';
  countDefinition: 'HAN_CODEPOINTS';
  transcriptExcerpt: string;
  transcriptTruncated: boolean;
  characterCount: number;
  lexicalCodePointCount: number;
  speechSpanMs: number;
  charactersPerSecond: number;
  sentenceCharacterCounts: number[];
  clauseCharacterCounts: number[];
  pauses: SpeechPauseEvidenceV2;
  recurringParticles: SpeechParticleEvidenceV2[];
}

export interface SentenceEndingObservationV2 {
  segmentIndex: number;
  deltaSemitones?: number;
  energyDeltaDb?: number;
  voicedRatio: number;
}

export interface AcousticEvidenceV2 {
  version?: 'acoustic-evidence/2';
  method?: string;
  windowStartMs?: number;
  windowEndMs?: number;
  validOneSecondWindows?: number;
  pitchRangeSemitones?: number;
  volumeDynamicRangeDb?: number;
  voicedWindowRatio?: number;
  sentenceEndingObservations?: SentenceEndingObservationV2[];
}

export interface EndingValue {
  contour: 'FLAT' | 'RISING' | 'FALLING' | 'MIXED';
  proportions: { flat: number; rising: number; falling: number };
  medianDeltaSemitones: number;
  medianEnergyDeltaDb: number;
}

export interface SpeechHabitFingerprint {
  version: 'shf/1.0';
  scope: 'SAMPLE_OBSERVATION_ONLY';
  source: EvidenceScope;
  overallConfidence: number;
  charactersPerSecond: EvidenceDimension<number>;
  sentenceCharacters: EvidenceDimension<LengthValue>;
  clauseCharacters: EvidenceDimension<LengthValue>;
  pausesPer10Seconds: EvidenceDimension<number>;
  averagePauseMs: EvidenceDimension<number>;
  sentenceEnding: EvidenceDimension<EndingValue>;
  pitchRangeSemitones: EvidenceDimension<number>;
  volumeDynamicRangeDb: EvidenceDimension<number>;
  voicedWindowRatio: EvidenceDimension<number>;
  recurringParticles: EvidenceDimension<RecurringParticle[]>;
  transcriptExcerpt: EvidenceDimension<string>;
}

export interface TextStylePolicy {
  version: 'text-style/1';
  clauseTargetChars: [number, number] | null;
  sentenceTargetChars: [number, number] | null;
  preferSemanticCommaBoundaries: boolean;
  optionalParticle: {
    text: string;
    position: 'INITIAL' | 'FINAL';
    maxUses: 1;
    hintProbability: number;
  } | null;
}

export interface TextStyleTurnContext {
  turnKey: string;
  recentReplies: readonly string[];
  historyComplete: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function read(row: Record<string, unknown>, ...names: string[]): unknown {
  const present = names.filter((name) => Object.prototype.hasOwnProperty.call(row, name));
  if (present.length > 1) {
    const baseline = JSON.stringify(row[present[0]]);
    if (present.slice(1).some((name) => JSON.stringify(row[name]) !== baseline)) {
      throw new Error(`Conflicting aliases: ${present.join(',')}`);
    }
  }
  return present.length ? row[present[0]] : undefined;
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function bounded(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function text(value: unknown, maxCharacters = 300): string {
  return Array.from(String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim())
    .slice(0, maxCharacters)
    .join('');
}

function hanCodePointCount(value: string): number {
  return Array.from(value).filter((character) => /\p{Script=Han}/u.test(character)).length;
}

function lexicalCodePointCount(value: string): number {
  return Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
}

function numberArray(value: unknown, limit = 100): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => finite(item, Number.NaN))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .slice(0, limit);
}

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function lengthValue(values: readonly number[]): LengthValue {
  return {
    median: rounded(percentile(values, 0.5), 1),
    p25: rounded(percentile(values, 0.25), 1),
    p75: rounded(percentile(values, 0.75), 1),
  };
}

function durationConfidenceCap(windowMs: number): number {
  const seconds = bounded(windowMs / 1000, 0, 60);
  if (seconds <= 8) return 0.55 * (seconds / 8);
  if (seconds <= 20) return 0.55 + ((seconds - 8) / 12) * 0.20;
  return 0.75 + ((seconds - 20) / 40) * 0.10;
}

function disabled<T>(source: DimensionSource, sourceWindowMs: number, reasons: string[]): EvidenceDimension<T> {
  return {
    value: null,
    confidence: 0,
    evidenceCount: 0,
    sourceWindowMs,
    source,
    use: 'DISABLED',
    reasons,
  };
}

function dimension<T>(input: {
  value: T;
  confidence: number;
  evidenceCount: number;
  sourceWindowMs: number;
  source: DimensionSource;
  use: EvidenceUse;
  reasons?: string[];
}): EvidenceDimension<T> {
  return {
    value: input.value,
    confidence: rounded(bounded(input.confidence), 3),
    evidenceCount: Math.max(0, Math.round(input.evidenceCount)),
    sourceWindowMs: Math.max(0, Math.round(input.sourceWindowMs)),
    source: input.source,
    use: input.use,
    reasons: input.reasons ?? [],
  };
}

function normalizeScope(value: unknown): EvidenceScope | null {
  const row = object(value);
  const result: EvidenceScope = {
    assetId: text(read(row, 'assetId', 'asset_id'), 100),
    selectionId: text(read(row, 'selectionId', 'selection_id'), 140),
    asrTaskId: text(read(row, 'asrTaskId', 'asr_task_id'), 140),
    localSpeakerId: text(read(row, 'localSpeakerId', 'local_speaker_id'), 80),
    selectionStartMs: finite(read(row, 'selectionStartMs', 'selection_start_ms'), Number.NaN),
    selectionEndMs: finite(read(row, 'selectionEndMs', 'selection_end_ms'), Number.NaN),
    windowStartMs: finite(read(row, 'windowStartMs', 'window_start_ms'), Number.NaN),
    windowEndMs: finite(read(row, 'windowEndMs', 'window_end_ms'), Number.NaN),
    targetOnly: read(row, 'targetOnly', 'target_only') === true,
    knownOverlap: read(row, 'knownOverlap', 'known_overlap') === true,
    originalTimeline: read(row, 'originalTimeline', 'original_timeline') === true,
  };
  if (!result.assetId || !result.selectionId || !result.localSpeakerId
    || !Number.isFinite(result.selectionStartMs) || !Number.isFinite(result.selectionEndMs)
    || !Number.isFinite(result.windowStartMs) || !Number.isFinite(result.windowEndMs)
    || result.selectionEndMs <= result.selectionStartMs || result.windowEndMs <= result.windowStartMs
    || !result.targetOnly || result.knownOverlap) return null;
  return result;
}

function normalizeSpeechEvidence(value: unknown): SpeechEvidenceV2 | null {
  const row = object(value);
  if (read(row, 'version') !== 'speech-evidence/2') return null;
  const pauseRow = object(read(row, 'pauses'));
  const method = read(pauseRow, 'method');
  if (method !== 'ASR_GAP_V1' && method !== 'LOCAL_SILENCE_V1') return null;
  const particles = Array.isArray(read(row, 'recurringParticles', 'recurring_particles'))
    ? (read(row, 'recurringParticles', 'recurring_particles') as unknown[]).flatMap((candidate): SpeechParticleEvidenceV2[] => {
      const particle = object(candidate);
      const position = read(particle, 'position');
      const valueText = text(read(particle, 'text'), 2);
      if (!valueText || (position !== 'INITIAL' && position !== 'FINAL')) return [];
      return [{
        text: valueText,
        position,
        count: Math.max(0, Math.round(finite(read(particle, 'count')))),
        clauseIndices: numberArray(read(particle, 'clauseIndices', 'clause_indices'), 100).map(Math.round),
        opportunities: Math.max(0, Math.round(finite(read(particle, 'opportunities')))),
      }];
    }).slice(0, 6)
    : [];
  const normalized: SpeechEvidenceV2 = {
    version: 'speech-evidence/2',
    countDefinition: 'HAN_CODEPOINTS',
    transcriptExcerpt: text(read(row, 'transcriptExcerpt', 'transcript_excerpt'), 300),
    transcriptTruncated: read(row, 'transcriptTruncated', 'transcript_truncated') === true,
    characterCount: Math.max(0, Math.round(finite(read(row, 'characterCount', 'character_count')))),
    lexicalCodePointCount: Math.max(0, Math.round(finite(read(row, 'lexicalCodePointCount', 'lexical_code_point_count')))),
    speechSpanMs: Math.max(0, Math.round(finite(read(row, 'speechSpanMs', 'speech_span_ms')))),
    charactersPerSecond: Math.max(0, finite(read(row, 'charactersPerSecond', 'characters_per_second'))),
    sentenceCharacterCounts: numberArray(read(row, 'sentenceCharacterCounts', 'sentence_character_counts')).map(Math.round),
    clauseCharacterCounts: numberArray(read(row, 'clauseCharacterCounts', 'clause_character_counts')).map(Math.round),
    pauses: {
      method,
      durationsMs: numberArray(read(pauseRow, 'durationsMs', 'durations_ms')).map(Math.round),
      coverage: bounded(finite(read(pauseRow, 'coverage'))),
      boundaryAlignedCount: Math.max(0, Math.round(finite(read(pauseRow, 'boundaryAlignedCount', 'boundary_aligned_count')))),
      longGapCount: Math.max(0, Math.round(finite(read(pauseRow, 'longGapCount', 'long_gap_count')))),
      analyzedSpanMs: Math.max(0, Math.round(finite(read(pauseRow, 'analyzedSpanMs', 'analyzed_span_ms')))),
    },
    recurringParticles: particles,
  };
  if (read(row, 'countDefinition', 'count_definition') !== 'HAN_CODEPOINTS'
    || !normalized.transcriptExcerpt || normalized.characterCount <= 0
    || normalized.lexicalCodePointCount < normalized.characterCount
    || normalized.speechSpanMs <= 0) return null;
  const recalculatedRate = normalized.characterCount / (normalized.speechSpanMs / 1000);
  if (Math.abs(normalized.charactersPerSecond - recalculatedRate) > Math.max(0.1, recalculatedRate * 0.05)) return null;
  if (!normalized.transcriptTruncated
    && (hanCodePointCount(normalized.transcriptExcerpt) !== normalized.characterCount
      || lexicalCodePointCount(normalized.transcriptExcerpt) !== normalized.lexicalCodePointCount)) return null;
  return normalized;
}

function normalizeAcousticEvidence(value: unknown): AcousticEvidenceV2 | null {
  const row = object(value);
  if (!Object.keys(row).length) return null;
  const observations = Array.isArray(read(row, 'sentenceEndingObservations', 'sentence_ending_observations'))
    ? (read(row, 'sentenceEndingObservations', 'sentence_ending_observations') as unknown[]).flatMap((item): SentenceEndingObservationV2[] => {
      const entry = object(item);
      const segmentIndex = finite(read(entry, 'segmentIndex', 'segment_index'), Number.NaN);
      if (!Number.isFinite(segmentIndex)) return [];
      const delta = finite(read(entry, 'deltaSemitones', 'delta_semitones'), Number.NaN);
      const energy = finite(read(entry, 'energyDeltaDb', 'energy_delta_db'), Number.NaN);
      return [{
        segmentIndex: Math.round(segmentIndex),
        ...(Number.isFinite(delta) ? { deltaSemitones: delta } : {}),
        ...(Number.isFinite(energy) ? { energyDeltaDb: energy } : {}),
        voicedRatio: bounded(finite(read(entry, 'voicedRatio', 'voiced_ratio'))),
      }];
    }).slice(0, 100)
    : [];
  return {
    ...(read(row, 'version') === 'acoustic-evidence/2' ? { version: 'acoustic-evidence/2' as const } : {}),
    method: text(read(row, 'method'), 80),
    windowStartMs: finite(read(row, 'windowStartMs', 'window_start_ms'), 0),
    windowEndMs: finite(read(row, 'windowEndMs', 'window_end_ms'), 0),
    validOneSecondWindows: Math.max(0, Math.round(finite(read(row, 'validOneSecondWindows', 'valid_one_second_windows')))),
    pitchRangeSemitones: Math.max(0, finite(read(row, 'pitchRangeSemitones', 'pitch_range_semitones'))),
    volumeDynamicRangeDb: Math.max(0, finite(read(row, 'volumeDynamicRangeDb', 'volume_dynamic_range_db'))),
    voicedWindowRatio: bounded(finite(read(row, 'voicedWindowRatio', 'voiced_window_ratio'))),
    sentenceEndingObservations: observations,
  };
}

function lengthDimension(
  values: readonly number[],
  textConfidence: number,
  sourceWindowMs: number,
): EvidenceDimension<LengthValue> {
  const complete = values.filter((value) => Number.isFinite(value) && value >= 2);
  if (complete.length < 3 || textConfidence <= 0) {
    return disabled('ASR_TEXT', sourceWindowMs, ['INSUFFICIENT_COMPLETE_UNITS']);
  }
  const value = lengthValue(complete);
  let confidence = textConfidence * Math.min(1, complete.length / 4);
  if (value.median > 0 && (value.p75 - value.p25) / value.median > 0.8) confidence *= 0.65;
  return dimension({
    value,
    confidence,
    evidenceCount: complete.length,
    sourceWindowMs,
    source: 'ASR_TEXT',
    use: confidence >= 0.5 ? 'TEXT_SOFT' : 'DISABLED',
    reasons: confidence >= 0.5 ? [] : ['LOW_CONFIDENCE'],
  });
}

function endingDimension(acoustic: AcousticEvidenceV2 | null, sourceWindowMs: number): EvidenceDimension<EndingValue> {
  const rows = (acoustic?.sentenceEndingObservations ?? [])
    .filter((row) => row.voicedRatio >= 0.7 && Number.isFinite(row.deltaSemitones));
  const distinctRows = [...new Map(rows.map((row) => [row.segmentIndex, row])).values()];
  if (distinctRows.length < 5) return disabled('LOCAL_ACOUSTIC', sourceWindowMs, ['INSUFFICIENT_ENDINGS']);
  const deltas = distinctRows.map((row) => row.deltaSemitones as number);
  const energies = distinctRows.flatMap((row) => Number.isFinite(row.energyDeltaDb) ? [row.energyDeltaDb as number] : []);
  const rising = deltas.filter((value) => value > 1.5).length;
  const falling = deltas.filter((value) => value < -1.5).length;
  const flat = deltas.length - rising - falling;
  const proportions = {
    flat: rounded(flat / deltas.length, 3),
    rising: rounded(rising / deltas.length, 3),
    falling: rounded(falling / deltas.length, 3),
  };
  const dominant = Object.entries(proportions).sort((left, right) => right[1] - left[1])[0];
  const contour = dominant && dominant[1] >= 0.7
    ? dominant[0].toUpperCase() as EndingValue['contour']
    : 'MIXED';
  return dimension({
    value: {
      contour,
      proportions,
      medianDeltaSemitones: rounded(percentile(deltas, 0.5), 3),
      medianEnergyDeltaDb: rounded(percentile(energies, 0.5), 3),
    },
    confidence: durationConfidenceCap(sourceWindowMs) * Math.min(1, distinctRows.length / 5),
    evidenceCount: distinctRows.length,
    sourceWindowMs,
    source: 'LOCAL_ACOUSTIC',
    use: 'DIAGNOSTIC_ONLY',
  });
}

export function buildSpeechHabitFingerprint(input: {
  scope: EvidenceScope;
  speechEvidence: SpeechEvidenceV2;
  acousticEvidence?: AcousticEvidenceV2 | null;
}): SpeechHabitFingerprint {
  const { scope, speechEvidence: speech } = input;
  const sourceWindowMs = Math.max(0, scope.windowEndMs - scope.windowStartMs);
  const durationCap = durationConfidenceCap(sourceWindowMs);
  const lexicalRatio = speech.lexicalCodePointCount > 0
    ? speech.characterCount / speech.lexicalCodePointCount
    : 0;
  const rateIsPlausible = speech.charactersPerSecond >= 0.3 && speech.charactersPerSecond <= 15;
  const textValid = speech.characterCount >= 20 && lexicalRatio >= 0.85 && rateIsPlausible;
  const textConfidence = textValid
    ? durationCap
      * Math.min(1, speech.characterCount / 40)
      * Math.min(1, speech.speechSpanMs / Math.max(1, sourceWindowMs))
    : 0;

  const charactersPerSecond = textValid && speech.speechSpanMs >= 6_000
    && speech.speechSpanMs / Math.max(1, sourceWindowMs) >= 0.5
    ? dimension({
      value: rounded(speech.charactersPerSecond, 3),
      confidence: textConfidence,
      evidenceCount: speech.characterCount,
      sourceWindowMs,
      source: 'ASR_TIMING',
      use: 'DIAGNOSTIC_ONLY',
    })
    : disabled<number>('ASR_TIMING', sourceWindowMs, ['INSUFFICIENT_RATE_EVIDENCE']);

  const sentenceCharacters = lengthDimension(speech.sentenceCharacterCounts, textConfidence, sourceWindowMs);
  const clauseCharacters = lengthDimension(speech.clauseCharacterCounts, textConfidence, sourceWindowMs);
  const pauses = speech.pauses.durationsMs.filter((duration) => duration >= 200 && duration <= 2_000);
  const pauseConfidence = durationCap
    * Math.min(1, pauses.length / 3)
    * bounded(speech.pauses.coverage);
  const boundaryRatio = pauses.length
    ? speech.pauses.boundaryAlignedCount / pauses.length
    : 0;
  const localPauseTextSafe = speech.pauses.method === 'LOCAL_SILENCE_V1'
    && pauses.length >= 3
    && speech.pauses.coverage >= 0.8
    && boundaryRatio >= 0.75
    && speech.pauses.longGapCount === 0
    && pauseConfidence >= 0.6
    && clauseCharacters.use === 'TEXT_SOFT';
  const pauseSource: DimensionSource = speech.pauses.method === 'LOCAL_SILENCE_V1'
    ? 'LOCAL_SILENCE'
    : 'ASR_TIMING';
  const pausesPer10Seconds = dimension({
    value: rounded(pauses.length / Math.max(1, speech.pauses.analyzedSpanMs) * 10_000, 3),
    confidence: speech.pauses.method === 'ASR_GAP_V1' ? Math.min(0.4, pauseConfidence) : pauseConfidence,
    evidenceCount: pauses.length,
    sourceWindowMs,
    source: pauseSource,
    use: localPauseTextSafe ? 'TEXT_SOFT' : pauses.length ? 'DIAGNOSTIC_ONLY' : 'DISABLED',
    reasons: localPauseTextSafe ? [] : ['PAUSE_TEXT_CONTROL_NOT_QUALIFIED'],
  });
  const averagePauseMs = pauses.length >= 3
    ? dimension({
      value: Math.round(pauses.reduce((sum, value) => sum + value, 0) / pauses.length),
      confidence: speech.pauses.method === 'ASR_GAP_V1' ? Math.min(0.4, pauseConfidence) : pauseConfidence,
      evidenceCount: pauses.length,
      sourceWindowMs,
      source: pauseSource,
      use: localPauseTextSafe ? 'TEXT_SOFT' : 'DIAGNOSTIC_ONLY',
      reasons: localPauseTextSafe ? [] : ['PAUSE_TEXT_CONTROL_NOT_QUALIFIED'],
    })
    : disabled<number>(pauseSource, sourceWindowMs, ['INSUFFICIENT_PAUSES']);

  const recurringParticles = speech.recurringParticles.flatMap((particle): RecurringParticle[] => {
    const distinctClauseCount = new Set(particle.clauseIndices).size;
    const confidence = textConfidence
      * Math.min(1, distinctClauseCount / 2)
      * Math.min(1, particle.opportunities / 5);
    if (distinctClauseCount < 2 || particle.count < 2) return [];
    return [{
      text: particle.text,
      position: particle.position,
      count: particle.count,
      distinctClauseCount,
      opportunities: particle.opportunities,
      confidence: rounded(confidence, 3),
    }];
  });
  const particleConfidence = recurringParticles.reduce((maximum, particle) => Math.max(maximum, particle.confidence), 0);
  const particleDimension = recurringParticles.length
    ? dimension({
      value: recurringParticles,
      confidence: particleConfidence,
      evidenceCount: recurringParticles.reduce((sum, particle) => sum + particle.count, 0),
      sourceWindowMs,
      source: 'ASR_TEXT',
      use: particleConfidence >= 0.5 ? 'TEXT_SOFT' : 'DIAGNOSTIC_ONLY',
      reasons: particleConfidence >= 0.5 ? [] : ['LOW_CONFIDENCE'],
    })
    : disabled<RecurringParticle[]>('ASR_TEXT', sourceWindowMs, ['NO_REPEATED_SAFE_PARTICLE']);

  const acoustic = input.acousticEvidence ?? null;
  const acousticWindowMs = acoustic && finite(acoustic.windowEndMs) > finite(acoustic.windowStartMs)
    ? finite(acoustic.windowEndMs) - finite(acoustic.windowStartMs)
    : sourceWindowMs;
  const acousticConfidence = durationConfidenceCap(acousticWindowMs)
    * Math.min(1, finite(acoustic?.validOneSecondWindows) / 3);
  const diagnosticAcoustic = (value: number | undefined, reason: string): EvidenceDimension<number> =>
    acoustic?.version === 'acoustic-evidence/2' && Number.isFinite(value) && finite(acoustic.validOneSecondWindows) >= 3
      ? dimension({
        value: Math.max(0, value as number),
        confidence: acousticConfidence,
        evidenceCount: finite(acoustic.validOneSecondWindows),
        sourceWindowMs: acousticWindowMs,
        source: 'LOCAL_ACOUSTIC',
        use: 'DIAGNOSTIC_ONLY',
      })
      : disabled<number>('LOCAL_ACOUSTIC', acousticWindowMs, [reason]);

  const overallConfidence = rounded(
    0.15 * charactersPerSecond.confidence
      + 0.30 * sentenceCharacters.confidence
      + 0.35 * clauseCharacters.confidence
      + 0.20 * pausesPer10Seconds.confidence,
    3,
  );
  return {
    version: 'shf/1.0',
    scope: 'SAMPLE_OBSERVATION_ONLY',
    source: scope,
    overallConfidence,
    charactersPerSecond,
    sentenceCharacters,
    clauseCharacters,
    pausesPer10Seconds,
    averagePauseMs,
    sentenceEnding: endingDimension(acoustic, acousticWindowMs),
    pitchRangeSemitones: diagnosticAcoustic(acoustic?.pitchRangeSemitones, 'PITCH_METHOD_OR_SAMPLE_COUNT_MISSING'),
    volumeDynamicRangeDb: diagnosticAcoustic(acoustic?.volumeDynamicRangeDb, 'VOLUME_METHOD_OR_SAMPLE_COUNT_MISSING'),
    voicedWindowRatio: diagnosticAcoustic(acoustic?.voicedWindowRatio, 'VOICED_METHOD_OR_SAMPLE_COUNT_MISSING'),
    recurringParticles: particleDimension,
    transcriptExcerpt: dimension({
      value: text(speech.transcriptExcerpt, 300),
      confidence: textConfidence,
      evidenceCount: speech.characterCount,
      sourceWindowMs,
      source: 'ASR_TEXT',
      use: 'DIAGNOSTIC_ONLY',
      reasons: ['PRIVATE_DIAGNOSTIC_NOT_FOR_PROMPT'],
    }),
  };
}

function scopeMatchesExpected(scope: EvidenceScope, expected: Partial<EvidenceScope> | undefined): boolean {
  if (!expected) return true;
  for (const key of ['assetId', 'selectionId', 'asrTaskId', 'localSpeakerId'] as const) {
    if (expected[key] !== undefined && scope[key] !== expected[key]) return false;
  }
  for (const key of ['selectionStartMs', 'selectionEndMs', 'windowStartMs', 'windowEndMs'] as const) {
    if (expected[key] !== undefined && Math.abs(scope[key] - Number(expected[key])) > 1) return false;
  }
  return true;
}

function fingerprintCandidate(
  value: unknown,
  acoustic: AcousticEvidenceV2 | null,
  expected?: Partial<EvidenceScope>,
): SpeechHabitFingerprint | null {
  const row = object(value);
  if (read(row, 'version') !== 'observed-evidence/2') return null;
  if (read(row, 'passed') !== true && read(row, 'acceptable') !== true) return null;
  const scope = normalizeScope(read(row, 'scope'));
  const speech = normalizeSpeechEvidence(read(row, 'speechEvidence', 'speech_evidence'));
  if (!scope || !speech || !scopeMatchesExpected(scope, expected)) return null;
  return buildSpeechHabitFingerprint({ scope, speechEvidence: speech, acousticEvidence: acoustic });
}

function sameScope(left: EvidenceScope, right: EvidenceScope): boolean {
  return left.assetId === right.assetId
    && left.selectionId === right.selectionId
    && left.localSpeakerId === right.localSpeakerId
    && Math.abs(left.windowStartMs - right.windowStartMs) <= 1
    && Math.abs(left.windowEndMs - right.windowEndMs) <= 1;
}

function dimensionConflict(
  left: EvidenceDimension<number>,
  right: EvidenceDimension<number>,
  absolute: number,
  relative: number,
): boolean {
  if (left.value === null || right.value === null) return false;
  return Math.abs(left.value - right.value) > Math.max(absolute, Math.min(left.value, right.value) * relative);
}

function lengthConflict(left: EvidenceDimension<LengthValue>, right: EvidenceDimension<LengthValue>): boolean {
  if (!left.value || !right.value) return false;
  return Math.abs(left.value.median - right.value.median)
    > Math.max(4, Math.min(left.value.median, right.value.median) * 0.3);
}

function conservative<T>(left: EvidenceDimension<T>, right: EvidenceDimension<T>): EvidenceDimension<T> {
  if (left.use === 'DISABLED') return right;
  if (right.use === 'DISABLED') return left;
  return left.confidence <= right.confidence ? left : right;
}

function conflictDisabled<T>(row: EvidenceDimension<T>): EvidenceDimension<T> {
  return disabled<T>(row.source, row.sourceWindowMs, ['SAME_WINDOW_CONFLICT']);
}

function mergeSameWindow(left: SpeechHabitFingerprint, right: SpeechHabitFingerprint): SpeechHabitFingerprint {
  const rate = dimensionConflict(left.charactersPerSecond, right.charactersPerSecond, 0.5, 0.15)
    ? conflictDisabled(left.charactersPerSecond)
    : conservative(left.charactersPerSecond, right.charactersPerSecond);
  const sentence = lengthConflict(left.sentenceCharacters, right.sentenceCharacters)
    ? conflictDisabled(left.sentenceCharacters)
    : conservative(left.sentenceCharacters, right.sentenceCharacters);
  const clause = lengthConflict(left.clauseCharacters, right.clauseCharacters)
    ? conflictDisabled(left.clauseCharacters)
    : conservative(left.clauseCharacters, right.clauseCharacters);
  const pauseFrequency = dimensionConflict(left.pausesPer10Seconds, right.pausesPer10Seconds, 1, 0.4)
    ? conflictDisabled(left.pausesPer10Seconds)
    : conservative(left.pausesPer10Seconds, right.pausesPer10Seconds);
  const pauseAverage = dimensionConflict(left.averagePauseMs, right.averagePauseMs, 100, 0.4)
    ? conflictDisabled(left.averagePauseMs)
    : conservative(left.averagePauseMs, right.averagePauseMs);
  const pitch = dimensionConflict(left.pitchRangeSemitones, right.pitchRangeSemitones, 3, 0)
    ? conflictDisabled(left.pitchRangeSemitones)
    : conservative(left.pitchRangeSemitones, right.pitchRangeSemitones);
  const volume = dimensionConflict(left.volumeDynamicRangeDb, right.volumeDynamicRangeDb, 6, 0)
    ? conflictDisabled(left.volumeDynamicRangeDb)
    : conservative(left.volumeDynamicRangeDb, right.volumeDynamicRangeDb);
  const leftParticles = left.recurringParticles.value ?? [];
  const rightParticles = right.recurringParticles.value ?? [];
  const intersection = leftParticles.flatMap((candidate): RecurringParticle[] => {
    const match = rightParticles.find((row) => row.text === candidate.text && row.position === candidate.position);
    if (!match) return [];
    return [{
      ...candidate,
      count: Math.min(candidate.count, match.count),
      distinctClauseCount: Math.min(candidate.distinctClauseCount, match.distinctClauseCount),
      opportunities: Math.min(candidate.opportunities, match.opportunities),
      confidence: Math.min(candidate.confidence, match.confidence),
    }];
  });
  const particle = intersection.length
    ? dimension({
      value: intersection,
      confidence: Math.min(left.recurringParticles.confidence, right.recurringParticles.confidence),
      evidenceCount: intersection.reduce((sum, item) => sum + item.count, 0),
      sourceWindowMs: left.recurringParticles.sourceWindowMs,
      source: 'ASR_TEXT',
      use: Math.min(left.recurringParticles.confidence, right.recurringParticles.confidence) >= 0.5 ? 'TEXT_SOFT' : 'DIAGNOSTIC_ONLY',
    })
    : conflictDisabled(left.recurringParticles);
  const excerpt = left.transcriptExcerpt.value === right.transcriptExcerpt.value
    ? conservative(left.transcriptExcerpt, right.transcriptExcerpt)
    : conflictDisabled(left.transcriptExcerpt);
  return {
    ...left,
    charactersPerSecond: rate,
    sentenceCharacters: sentence,
    clauseCharacters: clause,
    pausesPer10Seconds: pauseFrequency,
    averagePauseMs: pauseAverage,
    pitchRangeSemitones: pitch,
    volumeDynamicRangeDb: volume,
    recurringParticles: particle,
    transcriptExcerpt: excerpt,
    overallConfidence: rounded(
      0.15 * rate.confidence + 0.30 * sentence.confidence + 0.35 * clause.confidence + 0.20 * pauseFrequency.confidence,
      3,
    ),
  };
}

export function speechHabitFingerprintFromQualityReport(
  value: unknown,
  expected?: Partial<EvidenceScope>,
): SpeechHabitFingerprint | null {
  try {
    const report = object(value);
    const acoustic = normalizeAcousticEvidence(read(report, 'acousticEvidence', 'acoustic_evidence'));
    const source = fingerprintCandidate(read(report, 'sourceSpeakerCheck', 'source_speaker_check'), acoustic, expected);
    const formal = fingerprintCandidate(read(report, 'speakerDiarization', 'speaker_diarization'), acoustic, expected);
    if (!source) return formal;
    if (!formal) return source;
    if (sameScope(source.source, formal.source)) return mergeSameWindow(source, formal);
    const sourceWindow = source.source.windowEndMs - source.source.windowStartMs;
    const formalWindow = formal.source.windowEndMs - formal.source.windowStartMs;
    return sourceWindow <= formalWindow ? source : formal;
  } catch {
    return null;
  }
}

function policyRange(
  row: EvidenceDimension<LengthValue>,
  minimum: number,
  maximum: number,
): [number, number] | null {
  if (row.use !== 'TEXT_SOFT' || !row.value || row.confidence < 0.5) return null;
  const lowerFactor = row.confidence >= 0.7 ? 0.8 : 0.6;
  const upperFactor = row.confidence >= 0.7 ? 1.3 : 1.6;
  const lower = Math.max(minimum, Math.floor(row.value.p25 * lowerFactor));
  const upper = Math.min(maximum, Math.ceil(row.value.p75 * upperFactor));
  return [Math.min(lower, upper), Math.max(lower, upper)];
}

function stableFraction(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function compileTextStylePolicy(
  fingerprint: SpeechHabitFingerprint | null,
  turn: TextStyleTurnContext,
): TextStylePolicy | null {
  if (!fingerprint) return null;
  const clauseTargetChars = policyRange(fingerprint.clauseCharacters, 4, 32);
  const sentenceTargetChars = policyRange(fingerprint.sentenceCharacters, 6, 56);
  const preferSemanticCommaBoundaries = fingerprint.pausesPer10Seconds.use === 'TEXT_SOFT'
    && fingerprint.averagePauseMs.use === 'TEXT_SOFT';
  const safeParticles = new Set(['啊', '呀', '嗯', '哦']);
  const recentHasParticle = turn.recentReplies.slice(-5).some((reply) => /[啊呀嗯哦]/u.test(reply));
  const particle = fingerprint.recurringParticles.use === 'TEXT_SOFT' && turn.historyComplete && !recentHasParticle
    ? (fingerprint.recurringParticles.value ?? [])
      .filter((candidate) => safeParticles.has(candidate.text)
        && candidate.opportunities >= 5 && candidate.confidence >= 0.5)
      .sort((left, right) => right.confidence - left.confidence || right.count - left.count)[0]
    : undefined;
  const probability = particle
    ? Math.min(0.20, 0.5 * particle.confidence * particle.distinctClauseCount / Math.max(1, particle.opportunities))
    : 0;
  const optionalParticle = particle && stableFraction(`${turn.turnKey}:${particle.text}:${particle.position}`) < probability
    ? { text: particle.text, position: particle.position, maxUses: 1 as const, hintProbability: rounded(probability, 3) }
    : null;
  if (!clauseTargetChars && !sentenceTargetChars && !preferSemanticCommaBoundaries && !optionalParticle) return null;
  return {
    version: 'text-style/1',
    clauseTargetChars,
    sentenceTargetChars,
    preferSemanticCommaBoundaries,
    optionalParticle,
  };
}

export function textStylePolicyPrompt(policy: TextStylePolicy | null): string[] {
  if (!policy) return [];
  return [
    '<speech_habit_text_style version="text-style/1">',
    '以下只约束表达形式，优先级低于当前语义、事实、否定、承诺边界、人物关系和用户明确要求。',
    ...(policy.clauseTargetChars
      ? [`分句长度可宽松参考 ${policy.clauseTargetChars[0]}–${policy.clauseTargetChars[1]} 个汉字；内容需要时允许超出。`]
      : []),
    ...(policy.sentenceTargetChars
      ? [`整句长度可宽松参考 ${policy.sentenceTargetChars[0]}–${policy.sentenceTargetChars[1]} 个汉字；不得删掉必要解释。`]
      : []),
    ...(policy.preferSemanticCommaBoundaries
      ? ['优先在语义完整处断句，不机械插入逗号、省略号或精确停顿。']
      : []),
    ...(policy.optionalParticle
      ? [`可选使用一次“${policy.optionalParticle.text}”，也可以不用；不得因此改变陈述或疑问、确定性、请求强度、态度或新增情绪。`]
      : []),
    '不要输出表演指令、SSML、括号动作、原话摘录或声学参数。',
    '</speech_habit_text_style>',
  ];
}
