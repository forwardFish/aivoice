import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudBaseRuntimeClient } from '../src/index.js';

test('requires server-only CloudBase credentials', () => {
  assert.throws(() => new CloudBaseRuntimeClient('', ''), /required/);
});

test('builds stable environment endpoints without exposing the key', () => {
  const client = new CloudBaseRuntimeClient('env-test', 'server-secret');
  assert.equal(client.databaseBase, 'https://env-test.api.tcloudbasegateway.com/v1/rdb/rest');
  assert.equal(client.storageBase, 'https://env-test.api.tcloudbasegateway.com/v1/storages');
  assert.equal(JSON.stringify(client).includes('server-secret'), false);
});

test('encodes ISO timestamp filters exactly once', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = new CloudBaseRuntimeClient('env-test', 'server-secret');
    const expiresAt = '2026-08-23T02:40:55.718Z';
    await client.select('sessions', { filters: { expiresAt: { gt: expiresAt } } });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get('expires_at'), `gt.${expiresAt}`);
    assert.equal(requestedUrl.includes('%253A'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
