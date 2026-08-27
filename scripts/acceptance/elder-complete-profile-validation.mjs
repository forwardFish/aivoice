import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(projectRoot, 'docs/制作素材/人物资产/年龄身份验收/20260827_70岁父母_完整资料验证');
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

const cases = [
  {
    id: 'father', label: '70岁父亲', voiceName: '建国', gender: 'MALE', relationshipType: 'FATHER',
    background: '退休前是铁路工程师，现在参加社区摄影小组，日常生活和手机使用都由自己安排。',
    relationshipNote: '和成年子女每周联系，遇到出行和重要决定会一起商量，子女尊重他自己安排生活。',
  },
  {
    id: 'mother', label: '70岁母亲', voiceName: '桂兰', gender: 'FEMALE', relationshipType: 'MOTHER',
    background: '退休前是中学语文老师，现在参加社区合唱团，日常生活和手机使用都由自己安排。',
    relationshipNote: '和成年子女每周联系，平时会分享阅读和社区近况，遇到重要决定会一起商量。',
  },
];

const childPrompts = [
  '社区下个月组织三天两夜的文化旅行，你想报名吗？',
  '你最看重这次行程里的什么？',
  '如果决定去，有什么需要我提前帮你准备吗？',
  '行程要和一群不太熟的人一起，你会介意吗？',
  '那你准备什么时候去报名？',
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
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

const results = [];
for (const testCase of cases) {
  const history = [];
  let compiledIdentity = '';
  for (let index = 0; index < childPrompts.length; index += 1) {
    const turn = index + 1;
    const userText = childPrompts[index];
    const context = compileVoiceChatMessages({
      voiceName: testCase.voiceName, ageYears: 70, gender: testCase.gender,
      relationshipType: testCase.relationshipType, relationshipLabel: '', userAddress: '小林', userLifeStage: 'ADULT',
      background: testCase.background, relationshipNote: testCase.relationshipNote,
      history: history.map((row) => ({ messageId: `${testCase.id}-${row.turn}`, mode: 'CHAT', inputText: row.userText, outputText: row.replyText })),
      currentInput: userText,
    });
    if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
    process.stdout.write(`[${testCase.label}] turn ${turn}/5 generating...\n`);
    const replyText = await complete(context.messages);
    if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(replyText)) throw new Error(`forbidden disclosure ${testCase.id}:${turn}`);
    history.push({ turn, userText, replyText });
  }
  results.push({ ...testCase, compiledIdentity, turns: history });
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'PASS', chatModel, cases: results };
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, '结果.md'), [
  '# 70岁父亲/母亲 · 完整资料连续5轮', '',
  '两组使用相同的文化旅行问题；均明确面对成年子女，并提供各自真实背景与相处资料。', '',
  ...results.flatMap((testCase) => [
    `## ${testCase.label}`, '',
    `- 基本情况：${testCase.background}`, `- 相处情况：${testCase.relationshipNote}`, '',
    ...testCase.turns.flatMap((row) => [`### 第${row.turn}轮`, '', `- 成年子女：${row.userText}`, `- ${testCase.voiceName}：${row.replyText}`, '']),
  ]),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, cases: results.length, turns: results.reduce((sum, item) => sum + item.turns.length, 0) }, null, 2));
