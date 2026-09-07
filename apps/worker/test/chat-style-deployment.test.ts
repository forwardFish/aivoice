import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('worker deployment enables accepted everyday text while keeping acoustic experiments off', () => {
  for (const relative of [
    '../../../scripts/deploy/cloudbase-worker-function.mjs',
    '../../../scripts/deploy/cloudbase-worker-compact.mjs',
  ]) {
    const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /AIVOICE_STABLE_EMOTION_MODE:[^\n]+\|\| 'OFF'/u);
    assert.match(source, /AIVOICE_CHAT_STYLE_MODE:[^\n]+\|\| 'EVERYDAY'/u);
    assert.match(source, /AIVOICE_CHAT_PHRASING_MODE:[^\n]+\|\| 'OFF'/u);
  }

  const example = fs.readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^AIVOICE_STABLE_EMOTION_MODE=OFF$/mu);
  assert.match(example, /^AIVOICE_CHAT_STYLE_MODE=EVERYDAY$/mu);
  assert.match(example, /^AIVOICE_CHAT_PHRASING_MODE=OFF$/mu);
});
