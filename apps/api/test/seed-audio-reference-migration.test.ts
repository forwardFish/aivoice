import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Seed Audio voice input RPC exposes existing relationship context without adding a table', () => {
  const source = fs.readFileSync(path.resolve('cloudbase/0017_seed_audio_reference_voice.sql'), 'utf8');
  assert.match(source, /CREATE OR REPLACE FUNCTION rpc_job_get_voice_input/);
  assert.match(source, /'ageYears',v\.age_years/);
  assert.match(source, /'relationshipType',v\.relationship_type/);
  assert.doesNotMatch(source, /CREATE\s+TABLE/iu);
});
