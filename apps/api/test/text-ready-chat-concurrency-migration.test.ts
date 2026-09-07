import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql = fs.readFileSync(new URL('../cloudbase/0026_text_ready_chat_concurrency.sql', import.meta.url), 'utf8');

test('text-ready chat allows the next turn while prior audio continues', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION rpc_message_create/);
  assert.match(sql, /status IN\('PENDING','PROCESSING'\)[\s\S]*mode='EXACT_SPEECH' OR NULLIF\(btrim\(output_text\),''\) IS NULL/);
  assert.match(sql, /h\.id<>m\.id/);
  assert.match(sql, /h\.status='READY' OR \(h\.status='PROCESSING' AND NULLIF\(btrim\(h\.output_text\),''\) IS NOT NULL\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION rpc_message_create/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION rpc_job_get_message_input/);
});
