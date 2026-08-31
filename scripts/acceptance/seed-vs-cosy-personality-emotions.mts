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

const outputRoot = path.join(root, 'work/acceptance/seed-vs-cosy-personality-emotions');
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const cases = [
  {
    id: '01-angry', label: '生气', text: '你怎么现在才说呀，我都等你好久了。',
    sceneInstruction: '12岁女孩因为妈妈现在才说明情况而突然生气，开头直接，语气短促，但不喊叫。',
  },
  {
    id: '02-mischievous', label: '调皮', text: '我就吃一口嘛，你不说我不说，谁知道呀。',
    sceneInstruction: '12岁女孩有点调皮，和妈妈耍一个无伤大雅的小机灵，语气自然，不装可爱。',
  },
  {
    id: '03-teasing', label: '调侃', text: '你今天这么好说话，我都有点不习惯了。',
    sceneInstruction: '12岁女孩带着笑意调侃妈妈一句，像熟人之间顺口开的玩笑，不故意搞怪。',
  },
];
await fsp.mkdir(outputRoot, { recursive: true });
const seed = new VolcengineSeedAudioProvider();
const previousModel = process.env.AIVOICE_TARGET_MODEL;
const previousPreprocess = process.env.AIVOICE_ENROLL_PREPROCESS;
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';
process.env.AIVOICE_ENROLL_PREPROCESS = 'false';
const cosy = new AliyunCosyVoiceProvider();
const results: Array<Record<string, unknown>> = [];
let voiceId = '';
try {
  voiceId = await cosy.enroll(referencePath, `per${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`);
  for (const item of cases) {
    for (const provider of ['seed', 'cosy'] as const) {
      const startedAt = Date.now();
      const audio = provider === 'seed'
        ? await seed.synthesize(referencePath, item.text, {
          jobId: crypto.randomUUID(), messageId: crypto.randomUUID(),
          sceneInstruction: item.sceneInstruction,
        })
        : await cosy.synthesize(voiceId, item.text, { instruction: item.sceneInstruction });
      const outputPath = path.join(outputRoot, `${item.id}-${provider}.wav`);
      await fsp.writeFile(outputPath, audio);
      const result = { ...item, provider, elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
} finally {
  if (voiceId) await cosy.deleteVoice(voiceId);
  if (previousModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousModel;
  if (previousPreprocess === undefined) delete process.env.AIVOICE_ENROLL_PREPROCESS;
  else process.env.AIVOICE_ENROLL_PREPROCESS = previousPreprocess;
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  comparisonContract: 'same reference + same text + same semantic scene instruction; no SSML/rate/pitch/volume overrides',
  referencePath,
  results,
}, null, 2)}\n`);
