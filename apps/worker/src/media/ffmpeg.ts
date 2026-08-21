import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function extractReference(input: {
  videoPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
}): Promise<void> {
  const durationMs = input.endMs - input.startMs;
  if (durationMs < 10_000 || durationMs > 30_000) throw new Error('reference clip must be 10-30 seconds');
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-ss', (input.startMs / 1000).toFixed(3),
    '-i', input.videoPath,
    '-t', (durationMs / 1000).toFixed(3),
    '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le',
    input.outputPath,
  ], { timeout: 60_000 });
}

export async function probeWav(filePath: string): Promise<{ durationMs: number; bytes: number }> {
  const [{ stdout }, stat] = await Promise.all([
    execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', filePath,
    ], { timeout: 20_000, encoding: 'utf8' }),
    fs.stat(filePath),
  ]);
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }> };
  const stream = data.streams?.[0];
  if (!stream || stream.codec_name !== 'pcm_s16le' || stream.sample_rate !== '24000' || stream.channels !== 1) {
    throw new Error('reference WAV contract failed');
  }
  return { durationMs: Math.round(Number(data.format?.duration || 0) * 1000), bytes: stat.size };
}
