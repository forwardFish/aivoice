import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.resolve('cloudbase/0021_source_speaker_precheck.sql'), 'utf8');

test('source speaker precheck migration queues a phased job and finalizes pass or reject atomically', () => {
  assert.match(source, /rpc_voice_queue_source_speaker_check/);
  assert.match(source, /'phase','SOURCE_SPEAKER_CHECK'/);
  assert.match(source, /rpc_voice_source_speaker_check_passed/);
  assert.match(source, /rpc_voice_source_speaker_check_rejected/);
  assert.match(source, /UPDATE media_assets SET status='DELETED',deleted_at=now\(\)/);
  assert.match(source, /UPDATE voice_profiles SET status='DRAFT'/);
  assert.match(source, /UPDATE voice_profiles SET status='FAILED'/);
  assert.match(source, /sourceSpeakerCheckPassed/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION rpc_voice_queue_source_speaker_check/);
});
