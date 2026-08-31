import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('passive person evidence reuses quality_report without a new table or column', () => {
  const sql = fs.readFileSync(new URL('../cloudbase/0015_passive_person_evidence.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION rpc_job_get_message_input/);
  assert.match(sql, /'qualityReport',COALESCE\(vp\.quality_report/);
  assert.doesNotMatch(sql, /CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN/iu);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION rpc_job_get_message_input\(uuid,text\) TO worker_rpc_role/);
});
