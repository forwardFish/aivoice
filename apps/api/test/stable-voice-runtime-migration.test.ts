import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('stable voice runtime input exposes the existing provider and enrollment model without schema expansion', () => {
  const sql = fs.readFileSync(new URL('../cloudbase/0022_stable_voice_runtime_input.sql', import.meta.url), 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION rpc_job_get_message_input/u);
  assert.match(sql, /'provider',vm\.provider/u);
  assert.match(sql, /'targetModel',vm\.target_model/u);
  assert.match(sql, /'providerVoiceIdEncrypted',vm\.provider_voice_id_encrypted/u);
  assert.match(sql, /JOIN voice_models vm/u);
  assert.match(sql, /LEFT JOIN LATERAL/u);
  assert.doesNotMatch(sql, /CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN/iu);
});
