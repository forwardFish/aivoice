import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Seed companion budget reserves at most the configured count from existing job payloads', () => {
  const source = fs.readFileSync(path.resolve('cloudbase/0020_seed_companion_budget.sql'), 'utf8');
  assert.match(source, /CREATE OR REPLACE FUNCTION rpc_voice_companion_budget_reserve_v1/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /status='PROCESSING' AND lease_owner=p_worker_id AND leased_until>now\(\)/);
  assert.match(source, /voiceCompanionReservations/);
  assert.match(source, /bool_or\(id=p_job_id\)/);
  assert.match(source, /LIMIT p_window_size/);
  assert.match(source, /OUTSIDE_CURRENT_WINDOW/);
  assert.match(source, /IF v_used >= p_limit/);
  assert.match(source, /worker_rpc_role/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|point_accounts|point_ledgers/);
});
