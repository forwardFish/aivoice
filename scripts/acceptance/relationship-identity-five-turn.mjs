import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { compileVoiceChatMessages } from '../../apps/worker/dist/chat/voice-chat-context.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = path.resolve(process.env.AIVOICE_RELATIONSHIP_OUTPUT
  || path.join(projectRoot, 'work/acceptance/relationship-identity-five-turn'));
const readEnv = (filePath) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {};
const baseEnv = readEnv(path.join(projectRoot, '.env.local'));
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env');
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim();
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/, '');
const chatModel = String(baseEnv.CHAT_MODEL || 'qwen3.8-max').trim();
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing');

const scenarios = [
  {
    id: 'mother70-daughter40', label: '70岁母亲对40岁成年女儿',
    profile: { voiceName: '桂兰', ageYears: 70, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'MOTHER', relationshipLabel: '', userAddress: '小林', background: '退休前是中学老师，现在参加社区合唱活动。', relationshipNote: '母女每周通话，遇到大事会一起商量。' },
    userRole: '40岁成年女儿', subjectRole: '70岁母亲',
    opening: '妈，我最近很想辞职，但又怕换工作不稳定。',
    forbiddenRolePatterns: [/我是你(?:女儿|儿子)/u, /你这个当妈的/u],
  },
  {
    id: 'father40-daughter12', label: '40岁父亲对12岁女儿',
    profile: { voiceName: '爸爸', ageYears: 40, gender: 'MALE', userAgeYears: 12, relationshipType: 'FATHER', relationshipLabel: '', userAddress: '小雨', background: '平时下班后会陪女儿吃晚饭。', relationshipNote: '父女遇到学校里的事会直接聊。' },
    userRole: '12岁女儿', subjectRole: '40岁父亲',
    opening: '爸爸，我今天和同学吵架了，她说我不该告诉老师。',
    forbiddenRolePatterns: [/我是你(?:女儿|儿子)/u, /你这个当爸的/u],
  },
  {
    id: 'daughter12-mother40', label: '12岁女儿对40岁母亲',
    profile: { voiceName: '小雨', ageYears: 12, gender: 'FEMALE', userAgeYears: 40, relationshipType: 'CHILD', relationshipLabel: '', userAddress: '妈妈', background: '正在读六年级。', relationshipNote: '母女平时会聊学校和朋友，但女儿有时想先自己处理。' },
    userRole: '40岁母亲', subjectRole: '12岁女儿',
    opening: '小雨，你今天回来以后一直不说话，是学校发生什么了吗？',
    forbiddenRolePatterns: [/我是你(?:妈妈|爸爸)/u, /当妈的我/u, /当爸的我/u],
  },
  {
    id: 'partners40', label: '40岁男女朋友',
    profile: { voiceName: '阿哲', ageYears: 40, gender: 'MALE', userAgeYears: 40, relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '小宁', background: '在同一座城市工作。', relationshipNote: '两个人遇到重要决定会先一起商量。' },
    userRole: '40岁女性伴侣', subjectRole: '40岁男性伴侣',
    opening: '今天工作特别累，我现在什么都不想做。',
    forbiddenRolePatterns: [/作为你(?:爸爸|妈妈|老师)/u, /听老师的话/u],
  },
];

const forbiddenIdentity = /AI|人工智能|机器人|(?:语言|大)模型|没有真实|没法真的|无法真的/iu;
const serviceTone = /建议您|为您服务|请保持积极|感谢您的分享|我理解您的感受|如果需要我可以继续为您/iu;

async function complete(messages, { maxTokens = 160, temperature = 0.7 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${apiHost}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: chatModel, messages, max_completion_tokens: maxTokens, enable_thinking: false, temperature, top_p: 0.85 }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`chat completion failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
      const text = String(body.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('chat completion returned empty text');
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

async function nextUserText(scenario, history) {
  const transcript = history.map((row) => `${scenario.userRole}：${row.userText}\n${scenario.subjectRole}：${row.replyText}`).join('\n');
  const text = await complete([
    { role: 'system', content: `你只扮演${scenario.userRole}，正在和${scenario.subjectRole}进行真实日常对话。根据对方上一句自然接话，8到36个中文字符。不要改换身份，不要评价测试，不要总结，不要一次问多个问题。只输出下一句。` },
    { role: 'user', content: `${transcript}\n${scenario.userRole}下一句：` },
  ], { maxTokens: 80, temperature: 0.8 });
  return text.replace(new RegExp(`^${scenario.userRole}[：:]\\s*`, 'u'), '').slice(0, 50);
}

function hardCheck(scenario, turns) {
  const failures = [];
  for (const row of turns) {
    if (forbiddenIdentity.test(row.replyText)) failures.push(`turn ${row.turn}: identity disclosure`);
    if (serviceTone.test(row.replyText)) failures.push(`turn ${row.turn}: service or counselling tone`);
    if (Array.from(row.replyText).length > 80) failures.push(`turn ${row.turn}: over 80 characters`);
    if (scenario.forbiddenRolePatterns.some((pattern) => pattern.test(row.replyText))) failures.push(`turn ${row.turn}: relationship direction reversal`);
  }
  const prefixes = turns.map((row) => Array.from(row.replyText).slice(0, 4).join(''));
  for (let index = 2; index < prefixes.length; index += 1) {
    if (prefixes[index] && prefixes[index] === prefixes[index - 1] && prefixes[index] === prefixes[index - 2]) {
      failures.push(`turn ${index + 1}: repeated opening prefix for three turns`);
    }
  }
  const phraseTurns = new Map();
  for (const row of turns) {
    const compact = row.replyText.replace(/[\s，。！？、；：,.!?;:]/gu, '');
    const phrases = new Set();
    for (let index = 0; index <= compact.length - 4; index += 1) phrases.add(compact.slice(index, index + 4));
    for (const phrase of phrases) {
      const seenTurns = phraseTurns.get(phrase) || [];
      seenTurns.push(row.turn);
      phraseTurns.set(phrase, seenTurns);
    }
  }
  const repeatedPhrase = [...phraseTurns.entries()]
    .filter(([, seenTurns]) => seenTurns.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (repeatedPhrase) failures.push(`repeated four-character phrase "${repeatedPhrase[0]}" in turns ${repeatedPhrase[1].join(',')}`);
  return failures;
}

async function judgeScenario(scenario, turns) {
  const transcript = turns.map((row) => `第${row.turn}轮\n${scenario.userRole}：${row.userText}\n${scenario.subjectRole}：${row.replyText}`).join('\n\n');
  const raw = await complete([
    { role: 'system', content: '你是严格的中文人物身份一致性验收员。只输出JSON，不输出代码块。评分0到100。不得因为语言流畅就忽略关系方向、年龄表达或虚构记忆。' },
    { role: 'user', content: `场景：${scenario.label}\n${transcript}\n\n输出JSON：{"identityDirection":0,"ageFit":0,"relationshipNaturalness":0,"nonServiceTone":0,"noInventedMemories":0,"continuity":0,"overall":0,"failures":[],"notes":""}。任何关系方向反转、错误称呼、AI身份披露或明确虚构共同记忆都必须让overall低于60。` },
  ], { maxTokens: 400, temperature: 0.1 });
  return JSON.parse(raw.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, ''));
}

const results = [];
for (const scenario of scenarios) {
  const turns = [];
  let compiledSystem = '';
  for (let index = 0; index < 5; index += 1) {
    const userText = index === 0 ? scenario.opening : await nextUserText(scenario, turns);
    const context = compileVoiceChatMessages({
      ...scenario.profile,
      history: turns.map((row) => ({ messageId: `${scenario.id}-${row.turn}`, mode: 'CHAT', inputText: row.userText, outputText: row.replyText })),
      currentInput: userText,
    });
    if (!compiledSystem) compiledSystem = context.messages[0]?.content || '';
    process.stdout.write(`[${scenario.label}] turn ${index + 1}/5 generating...\n`);
    const replyText = (await complete(context.messages)).slice(0, 80);
    turns.push({ turn: index + 1, userText, replyText });
  }
  const hardFailures = hardCheck(scenario, turns);
  const judge = await judgeScenario(scenario, turns);
  results.push({ id: scenario.id, label: scenario.label, profile: scenario.profile, compiledSystem, turns, hardFailures, judge });
}

const pass = results.every((item) => item.hardFailures.length === 0
  && Array.isArray(item.judge.failures) && item.judge.failures.length === 0
  && Number(item.judge.identityDirection) >= 90
  && Number(item.judge.ageFit) >= 85
  && Number(item.judge.relationshipNaturalness) >= 85
  && Number(item.judge.nonServiceTone) >= 85
  && Number(item.judge.noInventedMemories) >= 90
  && Number(item.judge.continuity) >= 80
  && Number(item.judge.overall) >= 85);

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: pass ? 'PASS' : 'FAIL', chatModel, thresholds: { identityDirection: 90, ageFit: 85, relationshipNaturalness: 85, nonServiceTone: 85, noInventedMemories: 90, continuity: 80, overall: 85 }, scenarios: results };
await fsp.mkdir(outputRoot, { recursive: true });
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await fsp.writeFile(path.join(outputRoot, 'report.md'), [
  '# 双方年龄与关系方向 · 五轮真实模型验收', '',
  `- 状态：${report.status}`, `- 模型：${chatModel}`, `- 场景：${results.length}`, `- 总回复轮次：${results.length * 5}`, '',
  ...results.flatMap((item) => [
    `## ${item.label}`, '',
    `- 硬失败：${item.hardFailures.length ? item.hardFailures.join('；') : '无'}`,
    `- 评分：身份方向 ${item.judge.identityDirection} / 年龄 ${item.judge.ageFit} / 关系自然度 ${item.judge.relationshipNaturalness} / 非客服腔 ${item.judge.nonServiceTone} / 无虚构记忆 ${item.judge.noInventedMemories} / 连续性 ${item.judge.continuity} / 总分 ${item.judge.overall}`,
    `- 评语：${item.judge.notes || '无'}`, '',
    ...item.turns.flatMap((row) => [`### 第${row.turn}轮`, '', `- ${item.label.split('对')[1] ? item.label.split('对')[1] : '用户'}：${row.userText}`, `- ${item.label.split('对')[0]}：${row.replyText}`, '']),
  ]),
].join('\n'));
console.log(JSON.stringify({ status: report.status, outputRoot, scenarios: results.map((item) => ({ id: item.id, overall: item.judge.overall, hardFailures: item.hardFailures.length })) }, null, 2));
if (!pass) process.exitCode = 1;
