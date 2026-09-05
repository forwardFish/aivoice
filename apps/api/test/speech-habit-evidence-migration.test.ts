import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('cloudbase/0023_speech_habit_evidence.sql'), 'utf8');

test('voice finalization merges versioned evidence without replacing concurrent quality report data', () => {
  assert.match(source, /CREATE OR REPLACE FUNCTION rpc_voice_processing_finalize/);
  assert.match(source, /quality_report=COALESCE\(quality_report,'\{\}'::jsonb\)\|\|COALESCE\(p_quality_report,'\{\}'::jsonb\)/);
  assert.doesNotMatch(source, /quality_report=p_quality_report/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|ADD COLUMN/i);
  assert.match(source, /v\.quality_report->'sourceSpeakerCheck'/);
  assert.match(source, /v\.quality_report->'source_speaker_check'/);
  assert.match(source, /rpc_voice_delete_finalize/);
  assert.match(source, /rpc_account_delete_finalize/);
  assert.match(source, /quality_report='\{\}'::jsonb/);
});
