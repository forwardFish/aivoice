import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(projectRoot, 'docs/制作素材/人物资产/小雨/真实对话验收/20260827_12岁完整身份_独立场景验证');
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

const scenarios = [
  { id: 'daily', label: '询问今天情况', momText: '小雨，今天过得怎么样？有没有什么想和妈妈说的？' },
  { id: 'help', label: '妈妈提出帮忙', momText: '这件事要不要妈妈帮你一起处理？' },
  { id: 'peer', label: '同伴出现矛盾', momText: '听说你和朋友有点不愉快，你想说说发生了什么吗？' },
  { id: 'weekend', label: '商量周末安排', momText: '周末你想怎么安排？妈妈想听听你的想法。' },
  { id: 'reminder', label: '妈妈重复提醒', momText: '明天要带的东西都收好了吗？妈妈再提醒你一次。' },
];

async function complete(messages) {
  const response = await fetch(`${apiHost}/compatible-mode/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chatModel, messages, max_completion_tokens: 160, enable_thinking: false, temperature: 0.7, top_p: 0.85 }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`chat completion failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  const text = String(body.choices?.[0]?.message?.content || '').trim().slice(0, 120);
  if (!text) throw new Error('chat completion returned empty text');
  return text;
}

const results = [];
let compiledIdentity = '';
for (const scenario of scenarios) {
  const context = compileVoiceChatMessages({
    voiceName: '小雨', ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
    history: [], currentInput: scenario.momText,
  });
  if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
  process.stdout.write(`[12岁] ${scenario.label} generating...\n`);
  const girlText = await complete(context.messages);
  if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(girlText)) {
    throw new Error(`forbidden identity disclosure in ${scenario.id}`);
  }
  results.push({ ...scenario, girlText });
}

const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'PASS', chatModel,
  identity: { name: '小雨', ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', userAddress: '妈妈' },
  scenarios: results,
};
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'compiled-identity.txt'), `${compiledIdentity}\n`);
await fsp.writeFile(path.join(outputRoot, '结果.md'), [
  '# 12岁完整年龄身份 · 五个独立场景', '',
  '每个场景都是独立单轮，不共享历史；本轮只验证年龄、性别和关系身份。', '',
  ...results.flatMap((item, index) => [`## ${index + 1}. ${item.label}`, '', `- 妈妈：${item.momText}`, `- 小雨：${item.girlText}`, '']),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, scenarios: results.length }, null, 2));
