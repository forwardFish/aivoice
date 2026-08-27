import automator from 'miniprogram-automator';

const wsEndpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9421';
const voiceId = process.env.AIVOICE_ACCEPTANCE_VOICE_ID || '';
const prompts = (process.env.AIVOICE_LATENCY_PROMPTS || '')
  .split('|')
  .map((item) => item.trim())
  .filter(Boolean);
const timeoutMs = Number(process.env.AIVOICE_LATENCY_TIMEOUT_MS || 90_000);
const timingKey = 'nashide_ta_generation_timings';
if (!voiceId || prompts.length < 1 || prompts.length > 5) throw new Error('voice id and one to five prompts are required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let bootstrap = await automator.connect({ wsEndpoint });
const token = await bootstrap.callWxMethod('getStorageSync', 'nashide_ta_token');
const ext = await bootstrap.callWxMethod('getExtConfigSync');
if (process.env.AIVOICE_CLEAR_TIMINGS !== 'false') await bootstrap.callWxMethod('removeStorageSync', timingKey);
bootstrap.disconnect();
const apiBase = String(ext?.apiBaseUrl || 'https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com').replace(/\/$/, '');

async function api(path) {
  const response = await fetch(`${apiBase}/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.message || body.code || 'request failed'}`);
  return body;
}

async function connectWithRetry() {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await automator.connect({ wsEndpoint });
    } catch (error) {
      lastError = error;
      await sleep(300);
    }
  }
  throw lastError;
}

async function sendFromPage(prompt) {
  const miniProgram = await connectWithRetry();
  try {
    let page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}`);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      page = await miniProgram.currentPage();
      if (page.path === 'pages/voice/workbench') {
        const data = await page.data();
        if (data.state === 'success') break;
        if (data.state === 'error') throw new Error(data.errorMessage || 'workbench load failed');
      }
      await sleep(150);
    }
    page = await miniProgram.currentPage();
    await page.setData({ mode: 'chat' });
    const input = await page.$('.composer-input');
    const send = await page.$('.send-button');
    if (!input || !send) throw new Error('chat composer is missing');
    await input.input(prompt);
    await sleep(120);
    const clickedAt = Date.now();
    await send.tap();
    await sleep(250);
    const started = Boolean(await miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      return pages[pages.length - 1]?.generationClientTiming;
    }));
    if (!started) await page.callMethod('sendChat');
    let messageId = '';
    const acceptDeadline = clickedAt + 20_000;
    while (!messageId && Date.now() < acceptDeadline) {
      messageId = String(await miniProgram.evaluate(() => {
        const pages = getCurrentPages();
        return pages[pages.length - 1]?.generationClientTiming?.messageId || '';
      }));
      if (!messageId) await sleep(80);
    }
    if (!messageId) throw new Error('page did not accept a message id');
    return { messageId, clickedAt, acceptedMs: Date.now() - clickedAt };
  } finally {
    miniProgram.disconnect();
  }
}

async function waitForAudio(messageId, clickedAt) {
  const deadline = clickedAt + timeoutMs;
  while (Date.now() < deadline) {
    const message = await api(`/messages/${encodeURIComponent(messageId)}`);
    if (message.status === 'READY' && message.audio?.url) {
      return { backendAudioMs: Date.now() - clickedAt, audioDurationMs: Number(message.audio.durationMs || 0) };
    }
    if (message.status === 'FAILED' || message.status === 'BLOCKED') {
      throw new Error(`message ${messageId} ended as ${message.status}`);
    }
    await sleep(250);
  }
  throw new Error(`message ${messageId} audio timeout`);
}

async function waitForPageTiming(messageId) {
  const miniProgram = await connectWithRetry();
  try {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const rows = await miniProgram.callWxMethod('getStorageSync', timingKey);
      const timing = Array.isArray(rows) ? rows.find((item) => item.messageId === messageId) : null;
      if (timing) return timing;
      await sleep(200);
    }
    throw new Error(`page timing not persisted for ${messageId}`);
  } finally {
    miniProgram.disconnect();
  }
}

const results = [];
let pointsBefore = Number((await api('/points')).availablePoints || 0);
for (let index = 0; index < prompts.length; index += 1) {
  const prompt = prompts[index];
  const sent = await sendFromPage(prompt);
  console.log(JSON.stringify({ event: 'ui_latency_accepted', round: index + 1, prompt, ...sent }));
  const audio = await waitForAudio(sent.messageId, sent.clickedAt);
  await sleep(2_200);
  const timing = await waitForPageTiming(sent.messageId);
  const pointsAfter = Number((await api('/points')).availablePoints || 0);
  const firstTextMs = Number(timing.firstTextMs || timing.totalMs || 0);
  const result = {
    round: index + 1,
    prompt,
    messageId: sent.messageId,
    acceptedMs: sent.acceptedMs,
    pageTextMs: firstTextMs,
    pageAudioMs: Number(timing.totalMs || 0),
    pageGapMs: Math.max(0, Number(timing.totalMs || 0) - firstTextMs),
    backendAudioMs: audio.backendAudioMs,
    audioDurationMs: audio.audioDurationMs,
    pollCount: Number(timing.pollCount || 0),
    pointsBefore,
    pointsAfter,
    pointsConsumed: pointsBefore - pointsAfter,
  };
  results.push(result);
  console.log(JSON.stringify({ event: 'ui_latency_round_complete', ...result }));
  pointsBefore = pointsAfter;
}

const average = (key) => Math.round(results.reduce((sum, item) => sum + item[key], 0) / results.length);
console.log(JSON.stringify({
  event: 'ui_latency_five_run_summary',
  rounds: results,
  averagePageTextMs: average('pageTextMs'),
  averagePageAudioMs: average('pageAudioMs'),
  averagePageGapMs: average('pageGapMs'),
  totalPointsConsumed: results.reduce((sum, item) => sum + item.pointsConsumed, 0),
}));
