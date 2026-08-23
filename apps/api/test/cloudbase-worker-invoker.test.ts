import assert from 'node:assert/strict';
import test from 'node:test';

test('CloudBase worker invoker dispatches outside the user request through a detached background call', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../src/db/cloudbase-worker-invoker.ts', import.meta.url),
    'utf8',
  ));
  assert.match(source, /InvokeFunction/);
  assert.match(source, /Event:\s*JSON\.stringify/);
  assert.match(source, /inflight\.set/);
  assert.match(source, /return `background:/);
});
