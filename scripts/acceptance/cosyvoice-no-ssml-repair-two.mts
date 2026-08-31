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
Object.assign(process.env, readEnv(path.join(root, '.env.local')), readEnv('D:/lyh/secrets/aivoice/aliyun.env'));
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';

const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const outputRoot = path.join(root, 'work/acceptance/cosyvoice-delivery-five');
const baseline = {
  rateFactor: 1,
  pauseFactor: 1,
  volumeOffset: 0,
  instructionFragment: '原口音咬字；中速、中停顿、自然起伏、保留自然强弱',
};
const cases: Array<{ id: string; text: string; replyTone: ReplyTone; personalityNote?: string }> = [
  {
    id: '03-autonomy-negotiate-no-ssml',
    text: '你先听我说完，这是我的事，我想自己决定。',
    replyTone: 'IRRITATED',
    personalityNote: '有自己的主意：对自己的事情有看法；在意被尊重：希望意见被听见。',
  },
  {
    id: '05-soft-hurt-no-ssml',
    text: '你刚才那样说，我心里真的有点难受。',
    replyTone: 'SAD_OR_HURT',
  },
];

const provider = new AliyunCosyVoiceProvider();
const voiceId = await provider.enroll(referencePath, `n${Date.now().toString(36)}`.slice(0, 10));
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
    if (plan.enableSsml || plan.text !== item.text) throw new Error('chat emotion synthesis unexpectedly uses SSML');
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
      enableSsml: plan.enableSsml,
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

await fsp.writeFile(path.join(outputRoot, 'no-ssml-repair-two.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  provider: provider.providerName,
  model: provider.targetModel,
  referencePath,
  temporaryVoiceDeleted: true,
  results,
}, null, 2)}\n`);
