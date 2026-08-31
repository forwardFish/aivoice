import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);

const outputRoot = path.join(root, 'work/acceptance/seed-audio-plain-repair');
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const text = '我知道啦，今天会早点回来的。';
const cases = [
  {
    id: 'B-minimal-scene',
    sceneInstruction: '12岁女孩随口答应妈妈一件小事。',
  },
  {
    id: 'C-short-continuous',
    sceneInstruction: '12岁女孩随口答应妈妈一件小事，这是一句简短的日常回应，自然连贯地说完。',
  },
];
await fsp.mkdir(outputRoot, { recursive: true });
const provider = new VolcengineSeedAudioProvider();
const results: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const startedAt = Date.now();
  const audio = await provider.synthesize(referencePath, text, {
    jobId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    replyTone: 'PLAIN',
    sceneInstruction: item.sceneInstruction,
  });
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  await fsp.writeFile(outputPath, audio);
  const result = { ...item, text, elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath };
  results.push(result);
  console.log(JSON.stringify(result));
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), referencePath, text, results }, null, 2)}\n`);
