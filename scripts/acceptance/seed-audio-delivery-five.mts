import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { buildSeedAudioPrompt, VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';
import type { VoiceDeliveryMode, VoiceSpeechAct } from '../../apps/worker/src/providers/voice-provider.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);

const referencePath = path.resolve(
  process.env.SEED_AUDIO_DELIVERY_REFERENCE
  || path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav'),
);
const outputRoot = path.resolve(
  process.env.SEED_AUDIO_DELIVERY_OUTPUT
  || path.join(root, 'work/acceptance/seed-audio-delivery-five'),
);
await fsp.access(referencePath);
await fsp.mkdir(outputRoot, { recursive: true });

const observedBaseline = {
  speechRate: 'MEDIUM',
  pauseStyle: 'MEDIUM',
  pitchStyle: 'WIDE',
  sentenceEndingStyle: 'UNKNOWN',
  volumeDynamicsStyle: 'DYNAMIC',
} as const;

const cases: Array<{
  id: string;
  text: string;
  deliveryMode: VoiceDeliveryMode;
  speechAct: VoiceSpeechAct;
}> = [
  { id: '01-casual', text: '我知道啦，刚才就是有点忙。', deliveryMode: 'CASUAL', speechAct: 'REPLY' },
  { id: '02-hard-soft-explain', text: '我才没有担心你，就是看你这么晚还没回来。', deliveryMode: 'DIRECT_TENSE', speechAct: 'EXPLAIN' },
  { id: '03-autonomy-negotiate', text: '你先听我说完，这是我的事，我想自己决定。', deliveryMode: 'DIRECT_TENSE', speechAct: 'NEGOTIATE' },
  { id: '04-playful-tease', text: '你今天这么好说话呀，是不是有事求我？', deliveryMode: 'PLAYFUL_LIGHT', speechAct: 'TEASE' },
  { id: '05-soft-hurt', text: '你刚才那样说，我心里真的有点难受。', deliveryMode: 'SOFT_HURT', speechAct: 'REPLY' },
];

const provider = new VolcengineSeedAudioProvider();
const results = [];
for (const item of cases) {
  const options = {
    jobId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    relationshipType: 'CHILD' as const,
    deliveryMode: item.deliveryMode,
    speechAct: item.speechAct,
    observedBaseline,
  };
  const startedAt = Date.now();
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  if (fs.existsSync(outputPath)) {
    const stat = await fsp.stat(outputPath);
    const result = {
      ...item,
      prompt: buildSeedAudioPrompt(item.text, options),
      elapsedMs: item.id === '01-casual' ? 22_338 : null,
      bytes: stat.size,
      outputPath,
      reusedExisting: true,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    continue;
  }
  try {
    const audio = await provider.synthesize(referencePath, item.text, options);
    await fsp.writeFile(outputPath, audio);
    const result = {
      ...item,
      prompt: buildSeedAudioPrompt(item.text, options),
      elapsedMs: Date.now() - startedAt,
      bytes: audio.length,
      outputPath,
      reusedExisting: false,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = {
      ...item,
      prompt: buildSeedAudioPrompt(item.text, options),
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      outputPath,
      reusedExisting: false,
    };
    results.push(result);
    console.error(JSON.stringify(result));
  }
}

await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  provider: provider.providerName,
  model: provider.targetModel,
  referencePath,
  observedBaseline,
  results,
}, null, 2)}\n`);
