import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import { buildEmotionExpressionPlan } from '../../apps/worker/src/emotion-expression.js';
import { probeWav } from '../../apps/worker/src/media/ffmpeg.js';
import { AliyunCosyVoiceProvider } from '../../apps/worker/src/providers/aliyun-cosyvoice.js';
import { buildSpeechSynthesisPlan } from '../../apps/worker/src/speech-instruction.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(process.env, readEnv(path.join(root, '.env.local')), readEnv('D:/lyh/secrets/aivoice/aliyun.env'));
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus';

const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
const outputRoot = path.join(root, 'work/acceptance/cosyvoice-delivery-five');
const outputPath = path.join(outputRoot, '05-soft-hurt.wav');
const text = '你刚才那样说，我心里真的有点难受。';
const baseline = {
  rateFactor: 1,
  pauseFactor: 1,
  volumeOffset: 0,
  instructionFragment: '原口音咬字；中速、中停顿、自然起伏、保留自然强弱',
};
const expression = buildEmotionExpressionPlan({ replyTone: 'SAD_OR_HURT', text, interactionState: null });
if (expression.deliveryMode !== 'SOFT_HURT') throw new Error(`unexpected delivery mode: ${expression.deliveryMode}`);
const plan = buildSpeechSynthesisPlan('SAD_OR_HURT', text, baseline, expression);

const provider = new AliyunCosyVoiceProvider();
const voiceId = await provider.enroll(referencePath, `s${Date.now().toString(36)}`.slice(0, 10));
try {
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
  await fsp.writeFile(outputPath, audio);
  const probe = await probeWav(outputPath);
  const result = {
    id: '05-soft-hurt',
    text,
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
  await fsp.writeFile(path.join(outputRoot, '05-soft-hurt-repair.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await provider.deleteVoice(voiceId).catch(() => undefined);
}
