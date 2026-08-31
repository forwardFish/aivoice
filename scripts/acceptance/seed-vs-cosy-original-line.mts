import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import { VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env'),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);

const outputRoot = path.join(root, 'work/acceptance/seed-vs-cosy-original-line');
const referencePath = path.join(outputRoot, 'reference-nonoverlap-8.16-18.40.wav');
const sourceOriginal = path.join(root, 'work/acceptance/cosyvoice-same-original-line-12yo-1/original-line.wav');
const originalPath = path.join(outputRoot, '01-human-original.wav');
const seedPath = path.join(outputRoot, '02-seed-audio.wav');
const cosyPath = path.join(outputRoot, '03-cosyvoice-plus.wav');
const text = '其实开始我做短视频是有一个月的时间，三十几天前我发了我的第一条视频。';
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.copyFile(sourceOriginal, originalPath);

const results: Array<Record<string, unknown>> = [];
const seed = new VolcengineSeedAudioProvider();
let startedAt = Date.now();
const seedAudio = await seed.synthesize(referencePath, text, {
  jobId: crypto.randomUUID(), messageId: crypto.randomUUID(), replyTone: 'PLAIN',
  ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'OTHER',
});
await fsp.writeFile(seedPath, seedAudio);
results.push({ provider: seed.providerName, model: seed.targetModel, elapsedMs: Date.now() - startedAt, outputPath: seedPath, bytes: seedAudio.length });

const previousTargetModel = process.env.AIVOICE_TARGET_MODEL;
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';
const cosy = new AliyunCosyVoiceProvider();
let voiceId = '';
try {
  startedAt = Date.now();
  voiceId = await cosy.enroll(referencePath, `cmp${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`);
  const cosyAudio = await cosy.synthesize(voiceId, text);
  await fsp.writeFile(cosyPath, cosyAudio);
  results.push({ provider: cosy.providerName, model: cosy.targetModel, elapsedMs: Date.now() - startedAt, outputPath: cosyPath, bytes: cosyAudio.length });
} finally {
  if (voiceId) await cosy.deleteVoice(voiceId);
  if (previousTargetModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousTargetModel;
}

const report = {
  generatedAt: new Date().toISOString(),
  text,
  referencePath,
  referenceWindow: { startSeconds: 8.16, endSeconds: 18.4, overlapsTargetLine: false },
  originalPath,
  results,
};
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
