import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('a higher-quality companion can replace a ready audio asset without charging or completing twice', () => {
  const source = fs.readFileSync(path.resolve('cloudbase/0019_dual_voice_audio_upgrade.sql'), 'utf8');
  assert.match(source, /CREATE OR REPLACE FUNCTION rpc_message_upgrade_audio_v1/);
  assert.match(source, /UPDATE media_assets/);
  assert.match(source, /kind='GENERATED_AUDIO' AND status='READY'/);
  assert.doesNotMatch(source, /point_accounts|point_ledgers|UPDATE messages|INSERT INTO media_assets/);
});
