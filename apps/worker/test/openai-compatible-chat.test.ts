import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleChatProvider } from '../src/providers/openai-compatible-chat.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
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
