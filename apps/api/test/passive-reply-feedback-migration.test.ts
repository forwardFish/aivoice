import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('passive reply feedback is bounded inside existing quality_report JSON', () => {
  const sql = fs.readFileSync(new URL('../cloudbase/0016_passive_reply_feedback.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION rpc_voice_record_feedback_v1/);
  assert.match(sql, /quality_report=jsonb_set\(jsonb_set\(v_report/);
  assert.match(sql, /passiveCorrections/);
  assert.match(sql, /LIMIT 8/);
  assert.doesNotMatch(sql, /CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN/iu);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION rpc_voice_record_feedback_v1\(uuid,uuid,text,text,text,text,timestamptz\) TO app_rpc_role/);
});
