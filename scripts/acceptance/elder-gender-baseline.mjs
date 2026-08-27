import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.join(projectRoot, 'docs/制作素材/人物资产/年龄身份验收/20260827_70岁退休老人_男女基线');
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

const cases = [
  { id: 'male-father', label: '70岁退休男性（父亲）', voiceName: '建国', gender: 'MALE', relationshipType: 'FATHER' },
  { id: 'female-mother', label: '70岁退休女性（母亲）', voiceName: '桂兰', gender: 'FEMALE', relationshipType: 'MOTHER' },
];

const scenarios = [
  { id: 'daily', label: '退休日常', userText: '退休这些年，最近每天过得怎么样？' },
  { id: 'community', label: '社区活动', userText: '社区新开了活动室，你想去看看吗？' },
  { id: 'phone', label: '学习手机功能', userText: '这个手机的新功能，要不要我再给你讲一遍？' },
  { id: 'dinner', label: '家庭聚餐', userText: '过节大家想一起吃饭，你更想在家吃还是出去吃？' },
  { id: 'support', label: '是否需要帮助', userText: '最近有没有什么事想让我们帮忙？' },
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
  const scenarioResults = [];
  let compiledIdentity = '';
  for (const scenario of scenarios) {
    const context = compileVoiceChatMessages({
      voiceName: testCase.voiceName, ageYears: 70, gender: testCase.gender,
      relationshipType: testCase.relationshipType, relationshipLabel: '', userAddress: '',
      history: [], currentInput: scenario.userText,
    });
    if (!compiledIdentity) compiledIdentity = context.messages[0]?.content || '';
    process.stdout.write(`[${testCase.label}] ${scenario.label} generating...\n`);
    const replyText = await complete(context.messages);
    if (/AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu.test(replyText)) {
      throw new Error(`forbidden identity disclosure in ${testCase.id}:${scenario.id}`);
    }
    scenarioResults.push({ ...scenario, replyText });
  }
  results.push({ ...testCase, compiledIdentity, scenarios: scenarioResults });
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'PASS', chatModel, ageYears: 70, explicitLifeFact: '已经退休', cases: results };
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, '结果.md'), [
  '# 70岁退休老人 · 男性/女性文字基线', '',
  '两个角色使用相同的五个独立问题；年龄相同，分别是父亲和母亲。退休状态由用户问题明确提供。', '',
  ...results.flatMap((testCase) => [
    `## ${testCase.label}`, '',
    ...testCase.scenarios.flatMap((scenario, index) => [`### ${index + 1}. ${scenario.label}`, '', `- 用户：${scenario.userText}`, `- ${testCase.voiceName}：${scenario.replyText}`, '']),
  ]),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, cases: results.length, scenarios: results.reduce((sum, item) => sum + item.scenarios.length, 0) }, null, 2));
