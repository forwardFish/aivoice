import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const outputRoot = path.join(root, 'work/acceptance/seed-audio-hard-soft-repair');
const outputPath = path.join(outputRoot, 'B-short-bridge.wav');
await fsp.mkdir(outputRoot, { recursive: true });
const provider = new VolcengineSeedAudioProvider();
const startedAt = Date.now();
const audio = await provider.synthesize(referencePath, '我才没有担心你……就是看你这么晚还没回来。', {
  jobId: crypto.randomUUID(), messageId: crypto.randomUUID(), replyTone: 'MIXED',
  interactionStance: 'REPAIR', emotionIntensity: 1, personalityStyle: 'HARD_SOFT_MIXED',
  ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'CHILD',
});
await fsp.writeFile(outputPath, audio);
console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath }, null, 2));
