import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import type { ReplyTone } from '../../apps/worker/src/chat/interaction-state.js';
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

const outputRoot = path.join(root, 'work/acceptance/seed-vs-cosy-five-emotions');
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
await fsp.mkdir(outputRoot, { recursive: true });

const cases: Array<{
  id: string;
  label: string;
  tone: ReplyTone;
  text: string;
  sceneInstruction: string;
}> = [
  {
    id: '01-plain', label: '普通日常', tone: 'PLAIN', text: '我知道啦，今天会早点回来的。',
    sceneInstruction: '12岁女孩在家里和妈妈进行普通日常对话，语气自然放松，不播音，不表演。',
  },
  {
    id: '02-positive', label: '开心', tone: 'POSITIVE', text: '真的呀？那我现在就过来找你！',
    sceneInstruction: '12岁女孩在家里和妈妈说话，听到好消息后自然开心，带一点笑意，不夸张，不表演。',
  },
  {
    id: '03-concerned', label: '关心', tone: 'CONCERNED', text: '你是不是还没吃饭？先去吃点东西，别又硬撑。',
    sceneInstruction: '12岁女孩在家里认真关心妈妈，语气自然柔和，不说教，不表演。',
  },
  {
    id: '04-sad-hurt', label: '难过或受伤', tone: 'SAD_OR_HURT', text: '我不是想怪你，就是你一直不回消息，我心里有点难受。',
    sceneInstruction: '12岁女孩因为妈妈一直没回消息而有些难过，声音自然收住，不哭喊，不表演。',
  },
  {
    id: '05-mixed', label: '不满后缓和', tone: 'MIXED', text: '我知道啦，刚才就是有点烦，现在已经没事了。',
    sceneInstruction: '12岁女孩刚才有些不高兴，现在逐渐缓下来，前后变化自然，不喊叫，不表演。',
  },
];

const seed = new VolcengineSeedAudioProvider();
const previousModel = process.env.AIVOICE_TARGET_MODEL;
const previousPreprocess = process.env.AIVOICE_ENROLL_PREPROCESS;
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';
process.env.AIVOICE_ENROLL_PREPROCESS = 'false';
const cosy = new AliyunCosyVoiceProvider();
const results: Array<Record<string, unknown>> = [];
let voiceId = '';
try {
  const enrollStartedAt = Date.now();
  voiceId = await cosy.enroll(referencePath, `emo${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`);
  results.push({ provider: cosy.providerName, stage: 'ENROLL', elapsedMs: Date.now() - enrollStartedAt });
  for (const item of cases) {
    const seedPath = path.join(outputRoot, `${item.id}-seed.wav`);
    const cosyPath = path.join(outputRoot, `${item.id}-cosy-plus.wav`);

    let startedAt = Date.now();
    const seedAudio = await seed.synthesize(referencePath, item.text, {
      jobId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      replyTone: item.tone,
      sceneInstruction: item.sceneInstruction,
    });
    await fsp.writeFile(seedPath, seedAudio);
    const seedResult = {
      ...item, provider: seed.providerName, model: seed.targetModel,
      elapsedMs: Date.now() - startedAt, bytes: seedAudio.length, outputPath: seedPath,
    };
    results.push(seedResult);
    console.log(JSON.stringify(seedResult));

    startedAt = Date.now();
    const cosyAudio = await cosy.synthesize(voiceId, item.text, { instruction: item.sceneInstruction });
    await fsp.writeFile(cosyPath, cosyAudio);
    const cosyResult = {
      ...item, provider: cosy.providerName, model: cosy.targetModel,
      elapsedMs: Date.now() - startedAt, bytes: cosyAudio.length, outputPath: cosyPath,
    };
    results.push(cosyResult);
    console.log(JSON.stringify(cosyResult));
  }
} finally {
  if (voiceId) await cosy.deleteVoice(voiceId);
  if (previousModel === undefined) delete process.env.AIVOICE_TARGET_MODEL;
  else process.env.AIVOICE_TARGET_MODEL = previousModel;
  if (previousPreprocess === undefined) delete process.env.AIVOICE_ENROLL_PREPROCESS;
  else process.env.AIVOICE_ENROLL_PREPROCESS = previousPreprocess;
}

const report = {
  generatedAt: new Date().toISOString(),
  comparisonContract: 'same reference audio + same spoken text + same semantic scene instruction; no SSML/rate/pitch/volume overrides',
  referencePath,
  seedCallCount: cases.length,
  cosySynthesisCallCount: cases.length,
  results,
};
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
