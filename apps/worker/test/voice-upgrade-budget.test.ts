import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  SEED_AUDIO_PROVIDER_ID,
  voiceCompanionBudgetPolicy,
} from '../src/voice-companion-budget.js';

test('Seed companion budget defaults to fifteen of the latest fifty requests', () => {
  const policy = voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {} as NodeJS.ProcessEnv);

  assert.deepEqual(policy, {
    providerId: SEED_AUDIO_PROVIDER_ID,
    limit: 15,
    windowSize: 50,
  });
});

test('non-Seed providers are uncapped so explicit provider switching still works', () => {
  assert.equal(voiceCompanionBudgetPolicy('aliyun-cosyvoice', {} as NodeJS.ProcessEnv), null);
});

test('invalid Seed companion budget configuration fails closed', () => {
  assert.throws(
    () => voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {
      AIVOICE_SEED_AUDIO_BUDGET_WINDOW: '10',
      AIVOICE_SEED_AUDIO_BUDGET_LIMIT: '11',
    } as NodeJS.ProcessEnv),
    /cannot exceed/,
  );
  assert.throws(
    () => voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {
      AIVOICE_SEED_AUDIO_BUDGET_WINDOW: '0',
    } as NodeJS.ProcessEnv),
    /between 1 and 1000/,
  );
});

test('both worker backends reserve Seed budget before launching a companion provider', () => {
  for (const relative of ['src/job-runner.ts', 'src/cloudbase-job-runner.ts']) {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8');
    assert.match(source, /allowCompanion:\s*\(provider\)\s*=>\s*this\.reserveVoiceCompanionBudget\(job, provider\.id\)/);
    assert.match(source, /voice_companion_budget/);
  }
});

test('CloudBase budget reservation enforces the rolling window and prevents a retried job from calling Seed twice', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../api/cloudbase/0020_seed_companion_budget.sql'), 'utf8');

  assert.match(source, /DEFAULT 50/);
  assert.match(source, /DEFAULT 15/);
  assert.match(source, /voiceCompanionReservations/);
  assert.match(source, /lease_owner=p_worker_id/);
  assert.match(source, /bool_or\(id=p_job_id\)/);
  assert.match(source, /LIMIT p_window_size/);
  assert.match(source, /idempotent',true/);
  assert.match(source, /allowed',false,'reserved',false,'idempotent',true/);
});

test('worker deployment supports explicit selective-parallel and budget overrides without editing local secrets', () => {
  for (const relative of ['../../../scripts/deploy/cloudbase-worker-function.mjs', '../../../scripts/deploy/cloudbase-worker-compact.mjs']) {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, relative), 'utf8');
    assert.match(source, /process\.env\.AIVOICE_VOICE_STRATEGY \|\| localEnv\.AIVOICE_VOICE_STRATEGY/);
    assert.match(source, /process\.env\.AIVOICE_SEED_AUDIO_BUDGET_WINDOW \|\| localEnv\.AIVOICE_SEED_AUDIO_BUDGET_WINDOW/);
    assert.match(source, /process\.env\.AIVOICE_SEED_AUDIO_BUDGET_LIMIT \|\| localEnv\.AIVOICE_SEED_AUDIO_BUDGET_LIMIT/);
  }
});
