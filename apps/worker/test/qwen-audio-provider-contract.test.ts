import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('provider sends the model-specific instruction field and supports clean reference enrollment', () => {
  const source = fs.readFileSync(new URL('../src/providers/aliyun-cosyvoice.ts', import.meta.url), 'utf8');
  assert.match(source, /options\.instruction \? \{ instruction: options\.instruction \} : \{\}/);
  assert.doesNotMatch(source, /\{ instructions: options\.instruction \}/);
  assert.match(source, /seed: options\.seed \?\? 0/);
  assert.match(source, /AIVOICE_ENROLL_PREPROCESS[\s\S]*=== 'false' \? false : true/);
});
