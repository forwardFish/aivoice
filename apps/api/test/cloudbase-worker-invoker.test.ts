import assert from 'node:assert/strict';
import test from 'node:test';

test('CloudBase worker invoker uses the real asynchronous Invoke API', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../src/db/cloudbase-worker-invoker.ts', import.meta.url),
    'utf8',
  ));
  assert.match(source, /\.Invoke\(/);
  assert.match(source, /InvocationType:\s*'Event'/);
  assert.match(source, /ClientContext:\s*JSON\.stringify/);
  assert.doesNotMatch(source, /InvokeFunction/);
  assert.match(source, /inflight\.set/);
  assert.match(source, /return `background:/);
});
