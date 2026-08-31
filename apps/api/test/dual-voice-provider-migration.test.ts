import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('message input exposes both the registered speaker id and retained reference audio without a new table', () => {
  const source = fs.readFileSync(path.resolve('cloudbase/0018_dual_voice_provider_binding.sql'), 'utf8');
  assert.match(source, /'providerVoiceIdEncrypted',vm\.provider_voice_id_encrypted/);
  assert.match(source, /'referenceObjectKey',ra\.object_key/);
  assert.match(source, /ma\.kind='REFERENCE_AUDIO'/);
  assert.doesNotMatch(source, /CREATE\s+TABLE/iu);
});
