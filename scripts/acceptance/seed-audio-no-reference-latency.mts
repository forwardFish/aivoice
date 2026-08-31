import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';

const root = path.resolve(import.meta.dirname, '../..');
const envPath = process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env';
const env = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath)) : {};
const apiKey = String(env.VOLCENGINE_SEED_AUDIO_API_KEY || env.BYTEPLUS_SEED_AUDIO_API_KEY || '').trim();
if (!apiKey) throw new Error('Seed Audio API key is unavailable');

const outputRoot = path.join(root, 'work/acceptance/seed-audio-latency-diagnostic');
await fsp.mkdir(outputRoot, { recursive: true });
const requestId = crypto.randomUUID();
const startedAt = Date.now();
const response = await fetch('https://openspeech.bytedance.com/api/v3/tts/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Api-Key': apiKey,
    'X-Api-Request-Id': requestId,
  },
  body: JSON.stringify({
    model: env.SEED_AUDIO_MODEL || 'seed-audio-1.0',
    text_prompt: '一个普通女孩自然、连贯地说：『我知道啦，刚才就是有点忙。』只生成人声，不要音乐和环境音效。',
    audio_config: { format: 'wav', sample_rate: 24_000, speech_rate: 0, loudness_rate: 0, pitch_rate: 0 },
    watermark: {},
  }),
  signal: AbortSignal.timeout(120_000),
});
const responseReceivedMs = Date.now() - startedAt;
const body = await response.json() as { code?: number | string; message?: string; audio?: string; duration?: number; original_duration?: number };
if (!response.ok || (body.code != null && Number(body.code) !== 0) || !body.audio) {
  throw new Error(`Seed Audio diagnostic failed: ${response.status} ${String(body.code || '')} ${String(body.message || '')}`);
}
const audio = Buffer.from(body.audio, 'base64');
const outputPath = path.join(outputRoot, 'no-reference.wav');
await fsp.writeFile(outputPath, audio);
const result = {
  requestId: response.headers.get('x-tt-logid') || requestId,
  responseReceivedMs,
  durationSeconds: Number(body.duration || 0),
  billingDurationSeconds: Number(body.original_duration ?? body.duration ?? 0),
  bytes: audio.length,
  outputPath,
};
await fsp.writeFile(path.join(outputRoot, 'no-reference.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
