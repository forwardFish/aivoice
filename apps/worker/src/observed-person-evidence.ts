export type ObservedSpeechRate = 'SLOW' | 'MEDIUM' | 'FAST';
export type ObservedPauseStyle = 'LOW' | 'MEDIUM' | 'HIGH';
export type ObservedVolumeStyle = 'SOFT' | 'MEDIUM' | 'STRONG';
export type ObservedPitchStyle = 'NARROW' | 'MEDIUM' | 'WIDE' | 'UNKNOWN';
export type ObservedVolumeDynamicsStyle = 'FLAT' | 'MEDIUM' | 'DYNAMIC' | 'UNKNOWN';
export type ObservedSentenceEndingStyle = 'FALLING' | 'LEVEL' | 'RISING' | 'UNKNOWN';
export type ObservedSentenceEndingEnergyStyle = 'SOFTER' | 'LEVEL' | 'STRONGER' | 'UNKNOWN';

export interface ObservedPersonEvidence {
  transcriptExcerpt: string;
  charactersPerSecond: number;
  medianSentenceCharacters: number;
  speechRate: ObservedSpeechRate;
  pauseStyle: ObservedPauseStyle;
  volumeStyle: ObservedVolumeStyle;
  pitchStyle: ObservedPitchStyle;
  volumeDynamicsStyle: ObservedVolumeDynamicsStyle;
  sentenceEndingStyle: ObservedSentenceEndingStyle;
  sentenceEndingEnergyStyle: ObservedSentenceEndingEnergyStyle;
  pitchMedianHz: number;
  pitchRangeSemitones: number;
  volumeDynamicRangeDb: number;
  sentenceFinalPitchDeltaSemitones: number;
  sentenceFinalEnergyDeltaDb: number;
  sampleAffectCues: string[];
  recurringPhrases: string[];
  activeSpeechRatio: number;
  averagePauseMs: number;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampText(value: unknown, maxCharacters: number): string {
  return Array.from(String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim()).slice(0, maxCharacters).join('');
}

export function observedPersonEvidenceFromQualityReport(value: unknown): ObservedPersonEvidence | null {
  const report = object(value);
  const diarization = object(report.speakerDiarization);
  const speech = object(diarization.speechEvidence);
  const acoustic = object(report.acousticEvidence);
  const transcriptExcerpt = clampText(speech.transcript, 300);
  const charactersPerSecond = finite(speech.charactersPerSecond);
  if (!transcriptExcerpt || charactersPerSecond <= 0) return null;

  const medianSentenceCharacters = Math.max(1, Math.round(finite(speech.medianSentenceCharacters, 1)));
  const pauseCount = Math.max(0, Math.round(finite(speech.pauseCount)));
  const averagePauseMs = Math.max(0, Math.round(finite(speech.averagePauseMs)));
  const sampleAffectCues = Array.isArray(speech.affectCues)
    ? speech.affectCues.map((cue: unknown) => clampText(cue, 8)).filter(Boolean).slice(0, 4)
    : [];
  const recurringPhrases = Array.isArray(speech.recurringPhrases)
    ? speech.recurringPhrases.map((phrase: unknown) => clampText(phrase, 12)).filter(Boolean).slice(0, 6)
    : [];
  const durationSeconds = Math.max(1, finite(report.durationSeconds, finite(diarization.speechMs) / 1000));
  const activeSpeechRatio = Math.max(0, Math.min(1,
    Object.prototype.hasOwnProperty.call(report, 'silentRatio')
      ? 1 - finite(report.silentRatio)
      : finite(diarization.speechMs) / (durationSeconds * 1000),
  ));
  const averageDbfs = finite(report.averageDbfs, -24);
  const pitchMedianHz = Math.max(0, finite(acoustic.pitchMedianHz));
  const pitchRangeSemitones = Math.max(0, finite(acoustic.pitchRangeSemitones));
  const volumeDynamicRangeDb = Math.max(0, finite(acoustic.volumeDynamicRangeDb));
  const sentenceFinalPitchDeltaSemitones = finite(acoustic.sentenceFinalPitchDeltaSemitones);
  const sentenceFinalEnergyDeltaDb = finite(acoustic.sentenceFinalEnergyDeltaDb);
  const sentenceFinalPitchSampleCount = Math.max(0, Math.round(finite(acoustic.sentenceFinalPitchSampleCount)));
  const sentenceFinalEnergySampleCount = Math.max(0, Math.round(finite(acoustic.sentenceFinalEnergySampleCount)));
  const hasPitchEvidence = pitchMedianHz > 0 && Object.prototype.hasOwnProperty.call(acoustic, 'pitchRangeSemitones');
  const hasVolumeDynamicsEvidence = Object.prototype.hasOwnProperty.call(acoustic, 'volumeDynamicRangeDb');
  const pausesPerTenSeconds = pauseCount / durationSeconds * 10;

  return {
    transcriptExcerpt,
    charactersPerSecond,
    medianSentenceCharacters,
    speechRate: charactersPerSecond < 3 ? 'SLOW' : charactersPerSecond > 5.2 ? 'FAST' : 'MEDIUM',
    pauseStyle: pausesPerTenSeconds < 1.2 && averagePauseMs < 260
      ? 'LOW'
      : pausesPerTenSeconds > 2.5 || averagePauseMs > 520 ? 'HIGH' : 'MEDIUM',
    volumeStyle: averageDbfs < -30 ? 'SOFT' : averageDbfs > -18 ? 'STRONG' : 'MEDIUM',
    pitchStyle: !hasPitchEvidence ? 'UNKNOWN' : pitchRangeSemitones < 2.5 ? 'NARROW' : pitchRangeSemitones > 6 ? 'WIDE' : 'MEDIUM',
    volumeDynamicsStyle: !hasVolumeDynamicsEvidence ? 'UNKNOWN' : volumeDynamicRangeDb < 6 ? 'FLAT' : volumeDynamicRangeDb > 14 ? 'DYNAMIC' : 'MEDIUM',
    sentenceEndingStyle: !sentenceFinalPitchSampleCount
      ? 'UNKNOWN'
      : sentenceFinalPitchDeltaSemitones < -0.8 ? 'FALLING' : sentenceFinalPitchDeltaSemitones > 0.8 ? 'RISING' : 'LEVEL',
    sentenceEndingEnergyStyle: !sentenceFinalEnergySampleCount
      ? 'UNKNOWN'
      : sentenceFinalEnergyDeltaDb < -2 ? 'SOFTER' : sentenceFinalEnergyDeltaDb > 2 ? 'STRONGER' : 'LEVEL',
    pitchMedianHz,
    pitchRangeSemitones,
    volumeDynamicRangeDb,
    sentenceFinalPitchDeltaSemitones,
    sentenceFinalEnergyDeltaDb,
    sampleAffectCues,
    recurringPhrases,
    activeSpeechRatio,
    averagePauseMs,
  };
}

export function observedPersonEvidencePrompt(evidence: ObservedPersonEvidence | null): string[] {
  if (!evidence) return [];
  const rate = evidence.speechRate === 'FAST' ? '偏快' : evidence.speechRate === 'SLOW' ? '偏慢' : '中等';
  const pauses = evidence.pauseStyle === 'HIGH' ? '较多' : evidence.pauseStyle === 'LOW' ? '较少' : '中等';
  const sentenceLength = evidence.medianSentenceCharacters <= 8 ? '短句为主' : evidence.medianSentenceCharacters >= 20 ? '句子偏长' : '句长中等';
  const pitch = evidence.pitchStyle === 'WIDE' ? '音高起伏较大' : evidence.pitchStyle === 'NARROW' ? '音高较平' : evidence.pitchStyle === 'MEDIUM' ? '音高起伏中等' : '音高证据不足';
  const dynamics = evidence.volumeDynamicsStyle === 'DYNAMIC' ? '音量起伏明显' : evidence.volumeDynamicsStyle === 'FLAT' ? '音量较平' : evidence.volumeDynamicsStyle === 'MEDIUM' ? '音量起伏中等' : '音量起伏证据不足';
  const ending = evidence.sentenceEndingStyle === 'FALLING' ? '句尾常下收' : evidence.sentenceEndingStyle === 'RISING' ? '句尾常微扬' : evidence.sentenceEndingStyle === 'LEVEL' ? '句尾较平稳' : '句尾证据不足';
  const endingEnergy = evidence.sentenceEndingEnergyStyle === 'SOFTER' ? '句尾力度常收弱' : evidence.sentenceEndingEnergyStyle === 'STRONGER' ? '句尾力度常增强' : evidence.sentenceEndingEnergyStyle === 'LEVEL' ? '句尾力度平稳' : '句尾力度证据不足';
  return [
    '<observed_video_evidence>',
    `视频真实台词摘录：${evidence.transcriptExcerpt}`,
    `可观察说话基线：语速${rate}；停顿${pauses}；${sentenceLength}；${pitch}；${ending}；${endingEnergy}；${dynamics}。`,
    `参考片段有效语音占比：${Math.round(evidence.activeSpeechRatio * 100)}%。`,
    ...(evidence.recurringPhrases.length ? [`该片段中确实重复出现的用词：${evidence.recurringPhrases.join('、')}。`] : []),
    ...(evidence.sampleAffectCues.length ? [`视频原话明确出现的当时情绪线索：${evidence.sampleAffectCues.join('、')}。`] : []),
    '</observed_video_evidence>',
    '该区块来自用户已授权视频，只能作为真实用词、句长、语速和停顿证据。相关话题可迁移其用词与节奏，但不得在不相关场景机械复制原句。',
    '重复用词只证明它在这段样本中出现多次，不得自动认定为长期口头禅，也不得在每轮强行使用。视频中的情绪线索只描述录制片段当时状态，不得迁移成新对话的默认情绪。不得根据这段短视频自动推断嘴硬心软、爱发脾气、怎样消气或其他稳定性格；稳定性格仍只来自用户明确选择和用户在对话中的明确纠正。',
  ];
}

export function observedSpeechPlanBaseline(evidence: ObservedPersonEvidence | null): {
  rateFactor: number;
  pauseFactor: number;
  volumeOffset: number;
  instructionFragment: string;
} | null {
  if (!evidence) return null;
  const rateFactor = evidence.speechRate === 'FAST' ? 1.06 : evidence.speechRate === 'SLOW' ? 0.94 : 1;
  const pauseFactor = evidence.pauseStyle === 'HIGH' ? 1.22 : evidence.pauseStyle === 'LOW' ? 0.82 : 1;
  const volumeOffset = evidence.volumeStyle === 'STRONG' ? 2 : evidence.volumeStyle === 'SOFT' ? -2 : 0;
  const rate = evidence.speechRate === 'FAST' ? '偏快' : evidence.speechRate === 'SLOW' ? '偏慢' : '自然';
  const pause = evidence.pauseStyle === 'HIGH' ? '停顿稍多' : evidence.pauseStyle === 'LOW' ? '少停顿' : '自然停顿';
  const pitch = evidence.pitchStyle === 'NARROW' ? '少起伏' : evidence.pitchStyle === 'WIDE' || evidence.pitchStyle === 'MEDIUM' ? '自然起伏' : '';
  const ending = evidence.sentenceEndingStyle === 'FALLING' ? '降尾' : evidence.sentenceEndingStyle === 'RISING' ? '扬尾' : evidence.sentenceEndingStyle === 'LEVEL' ? '平尾' : '';
  const dynamics = evidence.volumeDynamicsStyle === 'DYNAMIC' ? '保留自然强弱' : evidence.volumeDynamicsStyle === 'FLAT' ? '强弱平稳' : evidence.volumeDynamicsStyle === 'MEDIUM' ? '强弱自然' : '';
  const compactRate = rate === '偏快' ? '快语' : rate === '偏慢' ? '慢速' : '中速';
  const compactPause = pause === '停顿稍多' ? '多停顿' : pause === '少停顿' ? '少停顿' : '中停顿';
  const details = [compactRate, compactPause, pitch, ending, dynamics].filter(Boolean);
  return { rateFactor, pauseFactor, volumeOffset, instructionFragment: `原口音咬字；${details.join('、')}` };
}

export function persistedPersonCorrectionsFromQualityReport(value: unknown): string[] {
  const report = object(value);
  const rows = Array.isArray(report.passiveCorrections) ? report.passiveCorrections : [];
  const newestFirst = rows.slice(-8).reverse();
  const unique: string[] = [];
  for (const row of newestFirst) {
    const instruction = clampText(object(row).instruction, 100);
    if (!instruction || unique.includes(instruction)) continue;
    unique.push(instruction);
    if (unique.length >= 4) break;
  }
  return unique.reverse();
}

export function speechPlanBaselineWithCorrections(
  evidence: ObservedPersonEvidence | null,
  qualityReport: unknown,
): ReturnType<typeof observedSpeechPlanBaseline> {
  const base = observedSpeechPlanBaseline(evidence);
  const report = object(qualityReport);
  const rows = Array.isArray(report.passiveCorrections) ? report.passiveCorrections : [];
  const toneRow = [...rows].reverse().map(object).find((row) => String(row.reason || '') === 'TONE_NOT_LIKE');
  const instruction = clampText(toneRow?.instruction, 100);
  if (!instruction) return base;

  let rateFactor = base?.rateFactor || 1;
  let pauseFactor = base?.pauseFactor || 1;
  let volumeOffset = base?.volumeOffset || 0;
  let correction = '';
  if (/(?:声音|音量).{0,8}(?:更低|小一点|更小|不会变大|不变大|别变大)|不喊/u.test(instruction)) {
    volumeOffset = Math.min(volumeOffset, -2);
    correction = '情绪时音量更低';
  } else if (/(?:声音|音量).{0,8}(?:更高|大一点|更大)/u.test(instruction)) {
    volumeOffset = Math.max(volumeOffset, 2);
    correction = '情绪时音量更高';
  } else if (/(?:语速|说话).{0,8}(?:更慢|慢一点)/u.test(instruction)) {
    rateFactor = Math.min(rateFactor, 0.95);
    correction = '语速更慢';
  } else if (/(?:语速|说话).{0,8}(?:更快|快一点)/u.test(instruction)) {
    rateFactor = Math.max(rateFactor, 1.05);
    correction = '语速更快';
  } else if (/(?:停顿).{0,8}(?:更多|长一点|更长)/u.test(instruction)) {
    pauseFactor = Math.max(pauseFactor, 1.18);
    correction = '停顿更多';
  } else if (/(?:停顿).{0,8}(?:更少|短一点|更短)/u.test(instruction)) {
    pauseFactor = Math.min(pauseFactor, 0.86);
    correction = '停顿更少';
  } else if (/(?:语调|音高).{0,8}(?:更平|平一点|没那么大起伏)/u.test(instruction)) {
    correction = '语调更平';
  } else if (/(?:语调|音高).{0,8}(?:起伏更大|更有起伏)/u.test(instruction)) {
    correction = '语调起伏更大';
  } else {
    correction = Array.from(instruction.replace(/^用户明确纠正TA的语气[：:]/u, '')).slice(0, 12).join('');
  }

  const baseParts = String(base?.instructionFragment || '原口音咬字；自然')
    .replace(/^(?:参考：|原口音咬字；)/u, '')
    .split('、')
    .filter(Boolean)
    .slice(0, 3);
  return {
    rateFactor,
    pauseFactor,
    volumeOffset,
    instructionFragment: `原口音咬字；${baseParts.join('、')}；校准：${correction}`,
  };
}
