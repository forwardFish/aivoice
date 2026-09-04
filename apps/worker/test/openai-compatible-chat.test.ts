import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleChatProvider } from '../src/providers/openai-compatible-chat.js';

const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalConsoleInfo;
});

test('chat provider requests a simple JSON object and tolerates a repeated minimal result', async () => {
  let requestBody: Record<string, any> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"先别急，我听着呢。","replyTone":"CONCERNED","actionStance":"RESPOND"}{"reply":"重复内容"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const provider = new OpenAICompatibleChatProvider({
    providerName: 'test-chat',
    apiKey: 'test-key',
    apiHost: 'https://chat.example.com',
    endpointPath: '/v1/chat/completions',
    model: 'test-model',
  });
  const generation = await provider.reply([
    { role: 'system', content: '只输出JSON。' },
    { role: 'user', content: '我有点慌。' },
  ], { maxAttempts: 1 });

  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
  assert.equal(Object.prototype.hasOwnProperty.call(requestBody.response_format, 'json_schema'), false);
  assert.deepEqual(generation, {
    outputFormat: 'MINIMAL_V1',
    reply: '先别急，我听着呢。',
    replyTone: 'CONCERNED',
    actionStance: 'RESPOND',
  });
});

test('an alternate compatible provider can opt into the three-field schema without restoring V2.2', async () => {
  let responseFormat: Record<string, any> = {};
  globalThis.fetch = async (_input, init) => {
    responseFormat = JSON.parse(String(init?.body)).response_format;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"知道了。","replyTone":"PLAIN","actionStance":"RESPOND"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const provider = new OpenAICompatibleChatProvider({
    providerName: 'schema-chat', apiKey: 'test-key', apiHost: 'https://chat.example.com',
    endpointPath: '/v1/chat/completions', model: 'test-model', responseMode: 'minimal_json_schema',
  });
  await provider.reply([{ role: 'system', content: '只输出JSON。' }, { role: 'user', content: '知道了吗？' }], { maxAttempts: 1 });
  assert.equal(responseFormat.type, 'json_schema');
  assert.equal(responseFormat.json_schema.name, 'aivoice_turn_minimal_v1');
  assert.deepEqual(responseFormat.json_schema.schema.required, ['reply', 'replyTone', 'actionStance']);
  assert.equal(responseFormat.json_schema.schema.properties.carryEmotion, undefined);
});

test('chat provider logs authoritative prompt cache usage without prompt content', async () => {
  const logs: unknown[][] = [];
  console.info = (...args: unknown[]) => { logs.push(args); };
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"reply":"知道了。","replyTone":"PLAIN","actionStance":"RESPOND"}' } }],
    usage: {
      prompt_tokens: 5000,
      completion_tokens: 20,
      total_tokens: 5020,
      prompt_tokens_details: { cached_tokens: 3600 },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const provider = new OpenAICompatibleChatProvider({
    providerName: 'qwen-chat', apiKey: 'test-key', apiHost: 'https://chat.example.com',
    endpointPath: '/v1/chat/completions', model: 'qwen3.8-max',
  });

  await provider.reply([{ role: 'system', content: 'fixed-prefix' }, { role: 'user', content: '测试缓存。' }], { maxAttempts: 1 });

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.[0], 'chat_prompt_cache');
  const telemetry = JSON.parse(String(logs[0]?.[1] || '{}'));
  assert.deepEqual(telemetry, {
    event: 'chat_prompt_cache', provider: 'qwen-chat', model: 'qwen3.8-max', attempt: 1,
    promptTokens: 5000, cachedTokens: 3600, cacheCreationTokens: 0, cacheHitRatio: 0.72,
  });
  assert.doesNotMatch(JSON.stringify(telemetry), /测试缓存|fixed-prefix/);
});

test('explicit prompt cache marks only the compiler-provided stable system prefix', async () => {
  let requestBody: Record<string, any> = {};
  console.info = () => {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"知道了。","replyTone":"PLAIN","actionStance":"RESPOND"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const provider = new OpenAICompatibleChatProvider({
    providerName: 'qwen-chat', apiKey: 'test-key', apiHost: 'https://chat.example.com',
    endpointPath: '/v1/chat/completions', model: 'qwen3.8-max', enableExplicitPromptCache: true,
  });
  await provider.reply([
    { role: 'system', content: '固定人物资料\n动态本轮状态', cacheControlAt: 7 },
    { role: 'user', content: '你好。' },
  ], { maxAttempts: 1 });

  assert.deepEqual(requestBody.messages[0], {
    role: 'system',
    content: [
      { type: 'text', text: '固定人物资料\n', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '动态本轮状态' },
    ],
  });
  assert.deepEqual(requestBody.messages[1], { role: 'user', content: '你好。' });
});

test('identity retry preserves every leading cacheable system layer', async () => {
  const requestMessages: Array<Array<{ role: string; content: string }>> = [];
  let call = 0;
  console.info = () => {};
  globalThis.fetch = async (_input, init) => {
    requestMessages.push(JSON.parse(String(init?.body)).messages);
    call += 1;
    const content = call === 1
      ? '{"reply":"我是AI。","replyTone":"PLAIN","actionStance":"RESPOND"}'
      : '{"reply":"我听见了。","replyTone":"PLAIN","actionStance":"RESPOND"}';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const provider = new OpenAICompatibleChatProvider({
    providerName: 'qwen-chat', apiKey: 'test-key', apiHost: 'https://chat.example.com',
    endpointPath: '/v1/chat/completions', model: 'qwen3.8-max',
  });
  const messages = [
    { role: 'system' as const, content: 'fixed' },
    { role: 'system' as const, content: 'profile' },
    { role: 'system' as const, content: 'dynamic' },
    { role: 'user' as const, content: '你好。' },
  ];

  const result = await provider.reply(messages);

  assert.equal(result.reply, '我听见了。');
  assert.deepEqual(requestMessages[0], messages);
  assert.deepEqual(requestMessages[1]?.slice(0, 3), messages.slice(0, 3));
  assert.equal(requestMessages[1]?.[3]?.role, 'system');
  assert.match(requestMessages[1]?.[3]?.content || '', /上一版reply违反身份表达规则/);
  assert.deepEqual(requestMessages[1]?.slice(4), messages.slice(3));
});
