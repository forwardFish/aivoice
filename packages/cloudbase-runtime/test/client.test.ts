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
