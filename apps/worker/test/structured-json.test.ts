import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStrictStructuredJson } from '../src/providers/structured-json.js';

test('structured JSON parser accepts one object and one optional code fence', () => {
  assert.deepEqual(parseStrictStructuredJson('{"a":1,"nested":{"text":"}"}}'), { a: 1, nested: { text: '}' } });
  assert.deepEqual(parseStrictStructuredJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseStrictStructuredJson('\uFEFF {"a":1}'), { a: 1 });
});

test('structured JSON parser rejects prose, truncation and different duplicates', () => {
  for (const raw of [
    '结果如下：{"a":1}',
    '{"a":',
    '{"a":1} trailing',
    '{"a":1}{"a":1}',
    '{"a":1}{"a":2}',
    '[{"a":1}]',
  ]) assert.throws(() => parseStrictStructuredJson(raw), /QWEN_STRUCTURED_OUTPUT_INVALID/u);
});
