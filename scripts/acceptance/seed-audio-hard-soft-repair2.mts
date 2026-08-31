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
const outputRoot = path.join(root, 'work/acceptance/seed-audio-hard-soft-repair2');
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
await fsp.mkdir(outputRoot, { recursive: true });
const cases = [
  { id: 'C-original-plain', text: '我才没有担心你，就是看你这么晚还没回来。' },
  { id: 'D-shorter-plain', text: '我才没担心你，就是看你这么晚没回来。' },
];
const provider = new VolcengineSeedAudioProvider();
for (const item of cases) {
  const startedAt = Date.now();
  const audio = await provider.synthesize(referencePath, item.text, {
    jobId: crypto.randomUUID(), messageId: crypto.randomUUID(),
    sceneInstruction: '12岁女孩随口向妈妈解释一句。',
  });
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  await fsp.writeFile(outputPath, audio);
  console.log(JSON.stringify({ ...item, elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath }));
}
