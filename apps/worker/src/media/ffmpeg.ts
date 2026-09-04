import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

export async function extractReference(input: {
  videoPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
}): Promise<void> {
  const durationMs = input.endMs - input.startMs;
  if (durationMs < 8_000 || durationMs > 20_000) throw new Error('reference clip must be 8-20 seconds');
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-ss', (input.startMs / 1000).toFixed(3),
    '-i', input.videoPath,
    '-t', (durationMs / 1000).toFixed(3),
    '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    input.outputPath,
  ], { timeout: 60_000 });
}

export async function extractSpeakerCheckAudio(input: {
  videoPath: string;
  outputPath: string;
}): Promise<void> {
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', input.videoPath,
    '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    input.outputPath,
  ], { timeout: 90_000 });
}

export async function probeWav(filePath: string): Promise<{ durationMs: number; bytes: number }> {
  const buffer = await fs.readFile(filePath);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('reference WAV contract failed');
  }
  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const declaredSize = buffer.readUInt32LE(offset + 4);
    const size = Math.min(declaredSize, Math.max(0, buffer.length - offset - 8));
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    }
    if (id === 'data') dataBytes = size;
    offset += 8 + size + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 24_000 || format.bitsPerSample !== 16 || dataBytes <= 0) {
    throw new Error('reference WAV contract failed');
  }
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  return { durationMs: Math.round((dataBytes / bytesPerSecond) * 1000), bytes: buffer.length };
}
