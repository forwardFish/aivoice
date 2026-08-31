import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import type { ReplyTone } from '../../apps/worker/src/chat/interaction-state.js';
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
  process.env.SEED_AUDIO_EMOTION_REFERENCE
  || path.join(projectRoot, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav'),
);
const outputRoot = path.resolve(
  process.env.SEED_AUDIO_EMOTION_OUTPUT
  || path.join(projectRoot, 'work/acceptance/seed-audio-five-emotions'),
);
await fsp.mkdir(outputRoot, { recursive: true });

const cases: Array<{ id: string; label: string; tone: ReplyTone; text: string }> = [
  { id: '01-plain', label: '普通日常', tone: 'PLAIN', text: '我知道啦，今天会早点回来的。' },
  { id: '02-positive', label: '开心', tone: 'POSITIVE', text: '真的呀？那我现在就过来找你！' },
  { id: '03-concerned', label: '关心', tone: 'CONCERNED', text: '你是不是还没吃饭？先去吃点东西，别又硬撑。' },
  { id: '04-sad-hurt', label: '难过或受伤', tone: 'SAD_OR_HURT', text: '我不是想怪你，就是你一直不回消息，我心里有点难受。' },
  { id: '05-mixed', label: '不满后缓和', tone: 'MIXED', text: '你别一直说嘛……我刚才就是有点烦，现在已经没事了。' },
];

const provider = createVoiceProviderFromEnv();
const results: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  const startedAt = Date.now();
  try {
    const audio = await provider.synthesize(referencePath, item.text, {
      jobId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      replyTone: item.tone,
      ageYears: 12,
      gender: 'FEMALE',
      userAgeYears: 40,
      relationshipType: 'CHILD',
    });
    await fsp.writeFile(outputPath, audio);
    results.push({
      ...item,
      status: 'SUCCEEDED',
      elapsedMs: Date.now() - startedAt,
      bytes: audio.length,
      outputPath,
    });
  } catch (error) {
    results.push({
      ...item,
      status: 'FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.log(JSON.stringify(results.at(-1)));
}

const report = {
  generatedAt: new Date().toISOString(),
  provider: provider.providerName,
  model: provider.targetModel,
  referenceMode: provider.referenceMode,
  referencePath,
  callCount: cases.length,
  retryCount: 0,
  results,
};
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
