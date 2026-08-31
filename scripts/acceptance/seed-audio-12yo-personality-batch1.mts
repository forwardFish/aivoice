import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import type { InteractionStance, ReplyTone } from '../../apps/worker/src/chat/interaction-state.js';
import { VolcengineSeedAudioProvider } from '../../apps/worker/src/providers/volcengine-seed-audio.js';

const root = path.resolve(import.meta.dirname, '../..');
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
Object.assign(process.env,
  readEnv(path.join(root, '.env.local')),
  readEnv(process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env'),
);

const outputRoot = path.join(root, 'work/acceptance/seed-audio-12yo-personality-batch1');
const referencePath = path.join(root, 'work/acceptance/cosyvoice-pro-ab/reference-clean-daily.wav');
await fsp.mkdir(outputRoot, { recursive: true });
const cases: Array<{
  id: string; label: string; personality: string; text: string; tone: ReplyTone;
  stance: InteractionStance; intensity: 0 | 1 | 2 | 3; personalityStyle: string;
}> = [
  {
    id: '01-surprised-positive', label: '惊喜兴奋', personality: '外向活泼',
    text: '真的假的？你真的给我买到了？我还以为今天拿不到了！',
    tone: 'POSITIVE', stance: 'RESPOND', intensity: 2, personalityStyle: 'SURPRISED_POSITIVE',
  },
  {
    id: '02-embarrassed', label: '被夸后害羞', personality: '慢热敏感',
    text: '你别当着别人面夸我啦……怪不好意思的。',
    tone: 'UNEASY', stance: 'RESPOND', intensity: 1, personalityStyle: 'EMBARRASSED_UNEASY',
  },
  {
    id: '03-autonomy-irritated', label: '被替决定时不满', personality: '有自己的主意',
    text: '这是我的事，你能不能先听我说完，再帮我决定呀？',
    tone: 'IRRITATED', stance: 'SET_BOUNDARY', intensity: 2, personalityStyle: 'AUTONOMY_IRRITATED',
  },
  {
    id: '04-hard-soft', label: '担心但不承认', personality: '嘴硬心软',
    text: '我才没有担心你……就是看你这么晚还没回来。',
    tone: 'MIXED', stance: 'REPAIR', intensity: 1, personalityStyle: 'HARD_SOFT_MIXED',
  },
  {
    id: '05-action-care', label: '看到妈妈疲惫', personality: '温柔且用行动关心',
    text: '你今天是不是很累？要不先坐一会儿，我去给你倒水。',
    tone: 'CONCERNED', stance: 'RESPOND', intensity: 1, personalityStyle: 'ACTION_CARE',
  },
];

const provider = new VolcengineSeedAudioProvider();
const results: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const outputPath = path.join(outputRoot, `${item.id}.wav`);
  if (fs.existsSync(outputPath)) {
    const result = { ...item, status: 'SKIPPED_EXISTING', bytes: fs.statSync(outputPath).size, outputPath };
    results.push(result);
    console.log(JSON.stringify(result));
    continue;
  }
  const startedAt = Date.now();
  try {
    const audio = await provider.synthesize(referencePath, item.text, {
      jobId: crypto.randomUUID(), messageId: crypto.randomUUID(),
      replyTone: item.tone, interactionStance: item.stance, emotionIntensity: item.intensity,
      personalityStyle: item.personalityStyle,
      ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'CHILD',
    });
    await fsp.writeFile(outputPath, audio);
    const result = { ...item, status: 'SUCCEEDED', elapsedMs: Date.now() - startedAt, bytes: audio.length, outputPath };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { ...item, status: 'FAILED', elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(), referencePath, seedCallCount: cases.length, retryCount: 0, results,
}, null, 2)}\n`);
