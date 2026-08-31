import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { buildEmotionExpressionPlan } from '../../apps/worker/src/emotion-expression.js';
import { probeWav } from '../../apps/worker/src/media/ffmpeg.js';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import { buildSpeechSynthesisPlan } from '../../apps/worker/src/speech-instruction.js';
import type { ReplyTone } from '../../apps/worker/src/chat/interaction-state.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(
  process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env'),
);
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';

const referencePath = path.resolve(
  process.env.COSYVOICE_DELIVERY_REFERENCE
  || path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav'),
);
const outputRoot = path.resolve(
  process.env.COSYVOICE_DELIVERY_OUTPUT
  || path.join(root, 'work/acceptance/cosyvoice-delivery-five'),
);
await fsp.access(referencePath);
await fsp.mkdir(outputRoot, { recursive: true });

const cases: Array<{ id: string; text: string; replyTone: ReplyTone; personalityNote?: string }> = [
  { id: '01-casual', text: '我知道啦，刚才就是有点忙。', replyTone: 'PLAIN' },
  { id: '02-hard-soft-explain', text: '我才没有担心你，就是看你这么晚还没回来。', replyTone: 'MIXED', personalityNote: '嘴硬心软：担心时不会直接承认。' },
  { id: '03-autonomy-negotiate', text: '你先听我说完，这是我的事，我想自己决定。', replyTone: 'IRRITATED', personalityNote: '有自己的主意：对自己的事情有看法；在意被尊重：希望意见被听见。' },
  { id: '04-playful-tease', text: '你今天这么好说话呀，是不是有事求我？', replyTone: 'PLAIN', personalityNote: '爱开玩笑：熟悉后会顺口调侃。' },
  { id: '05-soft-hurt', text: '你刚才那样说，我心里真的有点难受。', replyTone: 'SAD_OR_HURT' },
];

const baseline = {
  rateFactor: 1,
  pauseFactor: 1,
  volumeOffset: 0,
  instructionFragment: '原口音咬字；中速、中停顿、自然起伏、保留自然强弱',
};

const provider = new AliyunCosyVoiceProvider();
const prefix = `c${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9]/gu, '').slice(0, 10);
const voiceId = await provider.enroll(referencePath, prefix);
const results = [];
try {
  for (const item of cases) {
    const expression = buildEmotionExpressionPlan({
      replyTone: item.replyTone,
      text: item.text,
      interactionState: null,
      personalityNote: item.personalityNote || '',
    });
    const plan = buildSpeechSynthesisPlan(item.replyTone, item.text, baseline, expression);
    const startedAt = Date.now();
    const audio = await provider.synthesize(voiceId, plan.text, {
      jobId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      instruction: plan.instruction,
      rate: plan.rate,
      pitch: plan.pitch,
      volume: plan.volume,
      enableSsml: plan.enableSsml,
    });
    const outputPath = path.join(outputRoot, `${item.id}.wav`);
    await fsp.writeFile(outputPath, audio);
    const probe = await probeWav(outputPath);
    const result = {
      ...item,
      deliveryMode: expression.deliveryMode,
      speechAct: expression.speechAct,
      instruction: plan.instruction,
      rate: plan.rate,
      pitch: plan.pitch,
      volume: plan.volume,
      synthesisText: plan.text,
      elapsedMs: Date.now() - startedAt,
      durationMs: probe.durationMs,
      bytes: audio.length,
      outputPath,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await provider.deleteVoice(voiceId).catch(() => undefined);
}

await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  provider: provider.providerName,
  model: provider.targetModel,
  referencePath,
  baseline,
  temporaryVoiceDeleted: true,
  results,
}, null, 2)}\n`);
