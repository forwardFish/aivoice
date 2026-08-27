import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(process.env.AIVOICE_SINGLE_ISSUE_OUTPUT
  || path.join(projectRoot, 'docs/制作素材/人物资产/小雨/真实对话验收/20260827_12岁完整身份_同一问题5轮'));
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

async function complete(messages, temperature = 0.7, maxTokens = 160) {
  const response = await fetch(`${apiHost}/compatible-mode/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chatModel, messages, max_completion_tokens: maxTokens, enable_thinking: false, temperature, top_p: 0.85 }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`chat completion failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  const text = String(body.choices?.[0]?.message?.content || '').trim().slice(0, 120);
  if (!text) throw new Error('chat completion returned empty text');
  return text;
}

async function nextMomText(history) {
  const transcript = history.map((row) => `妈妈：${row.momText}\n小雨：${row.girlText}`).join('\n');
  const phaseGuidance = [
    '先回应女儿刚才的具体感受，再确认一个必要细节。',
    '提出一种不带结论的其他可能，帮助她换个角度；本轮不要提问。',
    '根据她现在的立场，询问她接下来想怎么处理，或者希望妈妈怎样支持。',
    '尊重她已经表达的决定，回应一句并把选择权留给她；不要继续追问。',
  ][Math.min(history.length - 1, 3)];
  const text = await complete([
    {
      role: 'system',
      content: `你扮演一位正在和12岁女儿谈同一件学校小组讨论矛盾的妈妈。根据女儿上一句的具体内容自然接一句，10到40个中文字符。必须继续这个问题，不能转移话题；不要心理咨询、总结教育、空泛安慰或身体接触。当前对话任务：${phaseGuidance}只输出妈妈说的话。`,
    },
    { role: 'user', content: `${transcript}\n妈妈下一句：` },
  ], 0.75, 80);
  return text.replace(/^妈妈[：:]\s*/u, '').slice(0, 44);
}

const history = [];
let compiledIdentity = '';
for (let index = 0; index < 5; index += 1) {
  const turn = index + 1;
  const momText = index === 0
    ? '小雨，老师说你今天小组讨论后不太开心，发生什么了？'
    : await nextMomText(history);
  const context = compileVoiceChatMessages({
    voiceName: '小雨', ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈',
    history: history.map((row) => ({ messageId: `turn-${row.turn}`, mode: 'CHAT', inputText: row.momText, outputText: row.girlText })),
    currentInput: momText,
  });
  if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
  process.stdout.write(`[12岁] same issue turn ${turn}/5 generating...\n`);
  const girlText = await complete(context.messages);
  if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(girlText)) {
    throw new Error(`forbidden identity disclosure at turn ${turn}`);
  }
  history.push({ turn, momText, girlText });
}

const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'PASS', chatModel,
  issue: '学校小组讨论后不开心',
  identity: { name: '小雨', ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', userAddress: '妈妈' },
  turns: history,
};
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'conversation.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'compiled-identity.txt'), `${compiledIdentity}\n`);
await fsp.writeFile(path.join(outputRoot, '对话记录.md'), [
  '# 12岁完整年龄身份 · 同一问题连续5轮', '',
  '问题：学校小组讨论后不开心。五轮共享完整历史。', '',
  ...history.flatMap((row) => [`## 第${row.turn}轮`, '', `- 妈妈：${row.momText}`, `- 小雨：${row.girlText}`, '']),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, turns: history.length }, null, 2));
