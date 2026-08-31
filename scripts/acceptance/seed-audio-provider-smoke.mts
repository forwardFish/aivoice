import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse as parseDotEnv } from 'dotenv';
import { createVoiceProviderFromEnv } from '../../apps/worker/src/providers/voice-provider-factory.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(
  process.env,
  readEnv(path.join(projectRoot, '.env.local')),
  readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env'),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);
process.env.AIVOICE_VOICE_PROVIDER = 'volcengine-seed-audio';

const referencePath = path.resolve(
  process.env.SEED_AUDIO_SMOKE_REFERENCE
  || path.join(projectRoot, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav'),
);
const outputRoot = path.resolve(
  process.env.SEED_AUDIO_SMOKE_OUTPUT
  || path.join(projectRoot, 'work/acceptance/seed-audio-provider-smoke'),
);
await fsp.mkdir(outputRoot, { recursive: true });
const outputName = String(process.env.SEED_AUDIO_SMOKE_NAME || 'provider-factory-smoke.wav').replace(/[^a-zA-Z0-9._-]/gu, '');
const outputPath = path.join(outputRoot, outputName || 'provider-factory-smoke.wav');
const provider = createVoiceProviderFromEnv();
const startedAt = Date.now();
const audio = await provider.synthesize(referencePath, '我知道啦，刚才就是有点烦，现在已经没事了。', {
  jobId: crypto.randomUUID(),
  messageId: crypto.randomUUID(),
  replyTone: 'MIXED',
  ageYears: 12,
  gender: 'FEMALE',
  userAgeYears: 40,
  relationshipType: 'CHILD',
});
await fsp.writeFile(outputPath, audio);
console.log(JSON.stringify({
  provider: provider.providerName,
  model: provider.targetModel,
  referenceMode: provider.referenceMode,
  elapsedMs: Date.now() - startedAt,
  bytes: audio.length,
  outputPath,
}, null, 2));
