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
const outputRoot = path.join(root, 'work/acceptance/seed-audio-autonomy-repair');
await fsp.mkdir(outputRoot, { recursive: true });
const provider = new VolcengineSeedAudioProvider();
const cases = [
  {
    id: 'B-minimal-scene',
    text: '这是我的事，你能不能先听我说完，再帮我决定呀？',
    sceneInstruction: '12岁女孩觉得妈妈没有先听自己说完，有点不服气，马上接话，但不吵架。',
  },
  {
    id: 'C-natural-child-text',
    text: '你先听我说完行不行？别总替我做决定。',
    sceneInstruction: '12岁女孩觉得妈妈没有先听自己说完，有点不服气，马上接话，但不吵架。',
  },
];
const results = [];
for (const item of cases) {
  const startedAt = Date.now();
  const audio = await provider.synthesize(referencePath, item.text, {
    jobId: crypto.randomUUID(), messageId: crypto.randomUUID(),
    sceneInstruction: item.sceneInstruction,
  });
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  await fsp.writeFile(outputPath, audio);
  const result = { ...item, elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath };
  results.push(result);
  console.log(JSON.stringify(result));
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), referencePath, results }, null, 2)}\n`);
