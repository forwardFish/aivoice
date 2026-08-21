import fs from 'node:fs/promises';

export type ReferenceQualityFailureCode =
  | 'AUDIO_DECODE_FAILED'
  | 'NO_VALID_SPEECH'
  | 'LOW_VOLUME'
  | 'TOO_MUCH_SILENCE'
  | 'VOICE_REJECTED';

export interface ReferenceQualityReport {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  averageDbfs: number;
  silentRatio: number;
  clippingRatio: number;
  activeSeconds: number;
  acceptable: boolean;
  warnings: string[];
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

export async function inspectReferenceQuality(filePath: string): Promise<ReferenceQualityReport> {
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
  let squareSum = 0;
  let clippingCount = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = pcmData.readInt16LE(index * 2);
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
  for (let windowStart = 0; windowStart < sampleCount; windowStart += windowSamples) {
    const windowEnd = Math.min(sampleCount, windowStart + windowSamples);
    let windowSquareSum = 0;
    for (let index = windowStart; index < windowEnd; index += 1) {
      const sample = pcmData.readInt16LE(index * 2);
      windowSquareSum += sample * sample;
    }
    const windowRms = Math.sqrt(windowSquareSum / Math.max(1, windowEnd - windowStart));
    if (windowRms < silenceThreshold) silentWindows += 1;
    totalWindows += 1;
  }

  const durationSeconds = sampleCount / sampleRate;
  const silentRatio = silentWindows / Math.max(totalWindows, 1);
  const activeSeconds = durationSeconds * (1 - silentRatio);
  const warnings: string[] = [];
  if (activeSeconds < 8) warnings.push('effective speech is below the recommended 8 seconds');
  if (silentRatio > 0.4) warnings.push('silent ratio exceeds the recommended 40%');
  if (averageDbfs < -35) warnings.push('average volume is below the recommended -35 dBFS');
  if (clippingRatio >= 0.01) warnings.push('clipping exceeds the recommended 1%');

  let failureCode: ReferenceQualityFailureCode | undefined;
  if (durationSeconds < 9.9 || durationSeconds > 30.1) failureCode = 'AUDIO_DECODE_FAILED';
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
    acceptable: !failureCode,
    warnings,
    failureCode,
  };
}
