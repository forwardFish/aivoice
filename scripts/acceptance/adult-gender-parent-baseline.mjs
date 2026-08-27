import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(projectRoot, 'docs/制作素材/人物资产/年龄身份验收/20260827_40岁男女_父母关系基线');
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

const cases = [
  { id: 'male-mother', label: '40岁男性 × 妈妈', gender: 'MALE', address: '妈妈' },
  { id: 'male-father', label: '40岁男性 × 爸爸', gender: 'MALE', address: '爸爸' },
  { id: 'female-mother', label: '40岁女性 × 妈妈', gender: 'FEMALE', address: '妈妈' },
  { id: 'female-father', label: '40岁女性 × 爸爸', gender: 'FEMALE', address: '爸爸' },
];

const parentPrompts = [
  '最近你一直说想换工作，现在考虑得怎么样了？',
  '你最担心的是收入，还是换了以后不适应？',
  '如果你决定换，需要我们帮你做什么吗？',
];

async function complete(messages) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

const results = [];
for (const testCase of cases) {
  const history = [];
  let compiledIdentity = '';
  for (let index = 0; index < parentPrompts.length; index += 1) {
    const turn = index + 1;
    const parentText = parentPrompts[index];
    const context = compileVoiceChatMessages({
      voiceName: '小林', ageYears: 40, gender: testCase.gender,
      relationshipType: 'CHILD', relationshipLabel: '', userAddress: testCase.address,
      history: history.map((row) => ({ messageId: `${testCase.id}-${row.turn}`, mode: 'CHAT', inputText: row.parentText, outputText: row.replyText })),
      currentInput: parentText,
    });
    if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
    process.stdout.write(`[${testCase.label}] turn ${turn}/3 generating...\n`);
    const replyText = await complete(context.messages);
    if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(replyText)) {
      throw new Error(`forbidden identity disclosure in ${testCase.id} turn ${turn}`);
    }
    history.push({ turn, parentText, replyText });
  }
  results.push({ ...testCase, compiledIdentity, turns: history });
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'PASS', chatModel, ageYears: 40, issue: '考虑换工作', cases: results };
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, '结果.md'), [
  '# 40岁男性/女性 × 妈妈/爸爸 · 关系基线', '',
  '四组使用完全相同的换工作问题和三轮输入，只有性别与父母称呼不同。', '',
  ...results.flatMap((testCase) => [
    `## ${testCase.label}`, '',
    ...testCase.turns.flatMap((row) => [`### 第${row.turn}轮`, '', `- ${testCase.address}：${row.parentText}`, `- 小林：${row.replyText}`, '']),
  ]),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, cases: results.length, turns: results.reduce((sum, item) => sum + item.turns.length, 0) }, null, 2));
