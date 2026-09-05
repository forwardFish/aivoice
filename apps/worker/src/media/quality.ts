import fs from 'node:fs/promises';

export type ReferenceQualityFailureCode =
  | 'AUDIO_DECODE_FAILED'
  | 'NO_VALID_SPEECH'
  | 'LOW_VOLUME'
  | 'TOO_MUCH_SILENCE'
  | 'VOICE_REJECTED'
  | 'MULTIPLE_SPEAKERS'
  | 'OVERLAPPING_SPEECH'
  | 'SPEAKER_UNCERTAIN';

export interface ReferenceQualityReport {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  averageDbfs: number;
  silentRatio: number;
  clippingRatio: number;
  activeSeconds: number;
  acousticEvidence?: {
    version: 'acoustic-evidence/2';
    method: 'LOCAL_AUTOCORRELATION_RMS_V1';
    windowStartMs: number;
    windowEndMs: number;
    validOneSecondWindows: number;
    volumeDynamicRangeDb: number;
    pitchMedianHz: number;
    pitchRangeSemitones: number;
    voicedWindowRatio: number;
    sentenceFinalPitchDeltaSemitones?: number;
    sentenceFinalEnergyDeltaDb?: number;
    sentenceFinalPitchSampleCount?: number;
    sentenceFinalEnergySampleCount?: number;
    sentenceEndingObservations?: Array<{
      segmentIndex: number;
      deltaSemitones?: number;
      energyDeltaDb?: number;
      voicedRatio: number;
    }>;
  };
  acceptable: boolean;
  warnings: string[];
  speakerDiarization?: {
    version?: 'observed-evidence/2';
    model: string;
    asrTaskId?: string;
    speakerCount: number;
    segmentCount: number;
    speechMs: number;
    overlapMs: number;
    overlapRatio: number;
    acceptable: boolean;
    segments: Array<{ speakerId: string; beginMs: number; endMs: number; text: string }>;
    speechEvidence?: import('../speech-habit-fingerprint.js').SpeechEvidenceV2;
    scope?: import('../speech-habit-fingerprint.js').EvidenceScope;
    failureCode?: ReferenceQualityFailureCode;
  };
  sourceSpeakerCheck?: Record<string, unknown>;
  failureCode?: ReferenceQualityFailureCode;
}

export class ReferenceQualityError extends Error {
  constructor(readonly code: ReferenceQualityFailureCode, readonly report?: ReferenceQualityReport) {
    super(code);
  }
}

export async function cleanupUnpersistedReference(filePath: string, persisted: boolean): Promise<void> {
  if (persisted) return;
  await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function rounded(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))] || 0;
}

function rangeRms(samples: readonly number[], start: number, end: number): number {
  let squareSum = 0;
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(samples.length, Math.ceil(end));
  for (let index = from; index < to; index += 1) squareSum += samples[index] * samples[index];
  return Math.sqrt(squareSum / Math.max(1, to - from));
}

function estimatePitchHz(samples: readonly number[], start: number, end: number, sampleRate: number): number {
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(samples.length, Math.ceil(end));
  if (to - from < Math.round(sampleRate * 0.025)) return 0;
  const mean = (() => {
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += samples[index];
    return sum / Math.max(1, to - from);
  })();
  const minLag = Math.max(1, Math.floor(sampleRate / 360));
  const maxLag = Math.min(Math.floor(sampleRate / 75), to - from - 2);
  let bestLag = 0;
  let bestCorrelation = 0;
  const correlations: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let cross = 0;
    let leftPower = 0;
    let rightPower = 0;
    for (let index = from + lag; index < to; index += 2) {
      const left = samples[index] - mean;
      const right = samples[index - lag] - mean;
      cross += left * right;
      leftPower += left * left;
      rightPower += right * right;
    }
    const correlation = cross / Math.sqrt(Math.max(1, leftPower * rightPower));
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  if (bestCorrelation < 0.45 || !bestLag) return 0;
  const strongPeakThreshold = Math.max(0.45, bestCorrelation * 0.94);
  for (let lag = minLag + 1; lag < bestLag; lag += 1) {
    const current = correlations[lag] || 0;
    if (current >= strongPeakThreshold && current >= (correlations[lag - 1] || 0) && current >= (correlations[lag + 1] || 0)) {
      return sampleRate / lag;
    }
  }
  return sampleRate / bestLag;
}

async function readPcmSamples(filePath: string): Promise<{ sampleRate: number; channels: number; samples: number[] }> {
  const wav = await fs.readFile(filePath);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new ReferenceQualityError('AUDIO_DECODE_FAILED');
  }
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let pcmData: Buffer | null = null;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkLength = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(wav.length, start + chunkLength);
    if (chunkId === 'fmt ' && chunkLength >= 16 && end - start >= 16) {
      audioFormat = wav.readUInt16LE(start);
      channels = wav.readUInt16LE(start + 2);
      sampleRate = wav.readUInt32LE(start + 4);
      bitsPerSample = wav.readUInt16LE(start + 14);
    } else if (chunkId === 'data') {
      pcmData = wav.subarray(start, end);
    }
    offset = start + chunkLength + (chunkLength % 2);
  }
  if (audioFormat !== 1 || channels !== 1 || sampleRate !== 24_000 || bitsPerSample !== 16 || !pcmData || pcmData.length < 2) {
    throw new ReferenceQualityError('AUDIO_DECODE_FAILED');
  }
  const sampleCount = Math.floor(pcmData.length / 2);
  const samples = new Array<number>(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) samples[index] = pcmData.readInt16LE(index * 2);
  return { sampleRate, channels, samples };
}

export async function inspectSentenceFinalProsody(
  filePath: string,
  segments: readonly { beginMs: number; endMs: number }[],
): Promise<Partial<NonNullable<ReferenceQualityReport['acousticEvidence']>>> {
  const { sampleRate, samples } = await readPcmSamples(filePath);
  const pitchDeltas: number[] = [];
  const energyDeltas: number[] = [];
  const sentenceEndingObservations: Array<{
    segmentIndex: number;
    deltaSemitones?: number;
    energyDeltaDb?: number;
    voicedRatio: number;
  }> = [];
  for (const [segmentIndex, segment] of segments.entries()) {
    if (segment.endMs - segment.beginMs < 700) continue;
    const end = Math.min(samples.length, Math.round(segment.endMs / 1000 * sampleRate));
    const tailStart = Math.max(0, end - Math.round(sampleRate * 0.28));
    const bodyEnd = tailStart;
    const bodyStart = Math.max(0, bodyEnd - Math.round(sampleRate * 0.34));
    if (bodyEnd <= bodyStart || end <= tailStart) continue;
    const bodyRms = rangeRms(samples, bodyStart, bodyEnd);
    const tailRms = rangeRms(samples, tailStart, end);
    const energyDeltaDb = bodyRms > 1 && tailRms > 1
      ? 20 * Math.log10(tailRms / bodyRms)
      : undefined;
    if (energyDeltaDb !== undefined) energyDeltas.push(energyDeltaDb);
    const bodyPitch = estimatePitchHz(samples, bodyStart, bodyEnd, sampleRate);
    const tailPitch = estimatePitchHz(samples, tailStart, end, sampleRate);
    const deltaSemitones = bodyPitch > 0 && tailPitch > 0
      ? 12 * Math.log2(tailPitch / bodyPitch)
      : undefined;
    if (deltaSemitones !== undefined) pitchDeltas.push(deltaSemitones);
    sentenceEndingObservations.push({
      segmentIndex,
      ...(deltaSemitones !== undefined ? { deltaSemitones: rounded(deltaSemitones, 3) } : {}),
      ...(energyDeltaDb !== undefined ? { energyDeltaDb: rounded(energyDeltaDb, 3) } : {}),
      voicedRatio: deltaSemitones === undefined ? 0 : 1,
    });
  }
  return {
    ...(pitchDeltas.length ? { sentenceFinalPitchDeltaSemitones: rounded(percentile(pitchDeltas, 0.5), 3) } : {}),
    ...(energyDeltas.length ? { sentenceFinalEnergyDeltaDb: rounded(percentile(energyDeltas, 0.5), 3) } : {}),
    ...(pitchDeltas.length ? { sentenceFinalPitchSampleCount: pitchDeltas.length } : {}),
    ...(energyDeltas.length ? { sentenceFinalEnergySampleCount: energyDeltas.length } : {}),
    ...(sentenceEndingObservations.length ? { sentenceEndingObservations } : {}),
  };
}

export async function inspectReferenceQuality(filePath: string): Promise<ReferenceQualityReport> {
  const { sampleRate, channels, samples } = await readPcmSamples(filePath);
  const sampleCount = samples.length;
  let squareSum = 0;
  let clippingCount = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples[index];
    squareSum += sample * sample;
    if (Math.abs(sample) >= 32_760) clippingCount += 1;
  }
  const rms = Math.sqrt(squareSum / sampleCount);
  const averageDbfs = 20 * Math.log10(Math.max(rms, 1) / 32_768);
  const clippingRatio = clippingCount / sampleCount;

  const windowSamples = Math.max(1, Math.round(sampleRate * 0.05));
  const silenceThreshold = 32_768 * (10 ** (-45 / 20));
  let silentWindows = 0;
  let totalWindows = 0;
  const activeWindowDbfs: number[] = [];
  const pitchWindows: number[] = [];
  for (let windowStart = 0; windowStart < sampleCount; windowStart += windowSamples) {
    const windowEnd = Math.min(sampleCount, windowStart + windowSamples);
    const windowRms = rangeRms(samples, windowStart, windowEnd);
    if (windowRms < silenceThreshold) silentWindows += 1;
    else {
      activeWindowDbfs.push(20 * Math.log10(Math.max(windowRms, 1) / 32_768));
      if (totalWindows % 2 === 0) {
        const pitch = estimatePitchHz(samples, windowStart, windowEnd, sampleRate);
        if (pitch > 0) pitchWindows.push(pitch);
      }
    }
    totalWindows += 1;
  }

  const durationSeconds = sampleCount / sampleRate;
  const silentRatio = silentWindows / Math.max(totalWindows, 1);
  const activeSeconds = durationSeconds * (1 - silentRatio);
  const pitchP10 = percentile(pitchWindows, 0.1);
  const pitchP90 = percentile(pitchWindows, 0.9);
  const acousticEvidence = {
    version: 'acoustic-evidence/2' as const,
    method: 'LOCAL_AUTOCORRELATION_RMS_V1' as const,
    windowStartMs: 0,
    windowEndMs: Math.round(durationSeconds * 1000),
    validOneSecondWindows: Math.floor(pitchWindows.length / 10),
    volumeDynamicRangeDb: rounded(Math.max(0, percentile(activeWindowDbfs, 0.9) - percentile(activeWindowDbfs, 0.1)), 3),
    pitchMedianHz: rounded(percentile(pitchWindows, 0.5), 3),
    pitchRangeSemitones: rounded(pitchP10 > 0 && pitchP90 > 0 ? 12 * Math.log2(pitchP90 / pitchP10) : 0, 3),
    voicedWindowRatio: rounded(pitchWindows.length / Math.max(1, Math.ceil(totalWindows / 2)), 5),
  };
  const warnings: string[] = [];
  if (activeSeconds < 8) warnings.push('effective speech is below the recommended 8 seconds');
  if (silentRatio > 0.4) warnings.push('silent ratio exceeds the recommended 40%');
  if (averageDbfs < -35) warnings.push('average volume is below the recommended -35 dBFS');
  if (clippingRatio >= 0.01) warnings.push('clipping exceeds the recommended 1%');

  let failureCode: ReferenceQualityFailureCode | undefined;
  if (durationSeconds < 7.9 || durationSeconds > 20.1) failureCode = 'AUDIO_DECODE_FAILED';
  else if (activeSeconds < 6) failureCode = 'NO_VALID_SPEECH';
  else if (silentRatio > 0.6) failureCode = 'TOO_MUCH_SILENCE';
  else if (averageDbfs < -40) failureCode = 'LOW_VOLUME';
  else if (clippingRatio >= 0.05) failureCode = 'VOICE_REJECTED';

  return {
    durationSeconds: rounded(durationSeconds, 3),
    sampleRate,
    channels,
    averageDbfs: rounded(averageDbfs, 3),
    silentRatio: rounded(silentRatio, 5),
    clippingRatio: rounded(clippingRatio, 7),
    activeSeconds: rounded(activeSeconds, 3),
    acousticEvidence,
    acceptable: !failureCode,
    warnings,
    failureCode,
  };
}
