import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(process.env.AIVOICE_AGE_TEXT_OUTPUT
  || path.join(projectRoot, 'docs/制作素材/人物资产/小雨/真实对话验收/20260827_12岁年龄身份_文字验证'));

function readEnv(filePath) {
  return fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
}

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
    body: JSON.stringify({
      model: chatModel,
      messages,
      max_completion_tokens: maxTokens,
      enable_thinking: false,
      temperature,
      top_p: 0.85,
    }),
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
  const text = await complete([
    {
      role: 'system',
      content: '你扮演一位正在和12岁女儿日常聊天的妈妈。根据女儿上一句自然接一句，10到32个中文字符。不要采访、总结、教育或连续追问原因；可以回应一个细节、分享反应，或者顺着她的话问一个很小的问题。只输出妈妈说的话。',
    },
    { role: 'user', content: `${transcript}\n妈妈下一句：` },
  ], 0.85, 80);
  return text.replace(/^妈妈[：:]\s*/u, '').slice(0, 40);
}

const history = [];
let compiledIdentity = '';
for (let index = 0; index < 5; index += 1) {
  const turn = index + 1;
  const momText = index === 0 ? '小雨，今天怎么样？想跟妈妈聊两句吗？' : await nextMomText(history);
  const context = compileVoiceChatMessages({
    voiceName: '小雨',
    ageYears: 12,
    gender: 'FEMALE',
    relationshipType: 'CHILD',
    relationshipLabel: '',
    userAddress: '妈妈',
    history: history.map((row) => ({
      messageId: `turn-${row.turn}`,
      mode: 'CHAT',
      inputText: row.momText,
      outputText: row.girlText,
    })),
    currentInput: momText,
  });
  if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
  process.stdout.write(`[12岁] turn ${turn}/5 generating...\n`);
  const girlText = await complete(context.messages);
  if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(girlText)) {
    throw new Error(`forbidden identity disclosure at turn ${turn}`);
  }
  history.push({ turn, momText, girlText });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'PASS',
  chatModel,
  identity: { name: '小雨', ageYears: 12, gender: 'FEMALE', relationshipType: 'CHILD', userAddress: '妈妈' },
  turns: history,
};

await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'conversation.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'compiled-identity.txt'), `${compiledIdentity}\n`);
await fsp.writeFile(path.join(outputRoot, '对话记录.md'), [
  '# 12岁年龄身份文字验证', '',
  '本轮只接入结构化年龄、性别、关系和精简年龄身份；没有接入性格或每轮动作。', '',
  ...history.flatMap((row) => [`## 第${row.turn}轮`, '', `- 妈妈：${row.momText}`, `- 小雨：${row.girlText}`, '']),
].join('\n'));

console.log(JSON.stringify({ status: report.status, outputRoot, turns: history.length }, null, 2));
