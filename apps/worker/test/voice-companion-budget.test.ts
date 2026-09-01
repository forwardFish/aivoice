import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEED_AUDIO_PROVIDER_ID,
  voiceCompanionBudgetPolicy,
} from '../src/voice-companion-budget.js';

test('Seed Audio companion defaults to a 15-call budget in a rolling 50-call window', () => {
  assert.deepEqual(voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {} as NodeJS.ProcessEnv), {
    providerId: SEED_AUDIO_PROVIDER_ID,
    limit: 15,
    windowSize: 50,
  });
});

test('companion budget remains provider-specific and configurable', () => {
  assert.equal(voiceCompanionBudgetPolicy('future-provider', {} as NodeJS.ProcessEnv), null);
  assert.deepEqual(voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {
    AIVOICE_SEED_AUDIO_BUDGET_LIMIT: '8',
    AIVOICE_SEED_AUDIO_BUDGET_WINDOW: '40',
  } as NodeJS.ProcessEnv), {
    providerId: SEED_AUDIO_PROVIDER_ID,
    limit: 8,
    windowSize: 40,
  });
  assert.throws(() => voiceCompanionBudgetPolicy(SEED_AUDIO_PROVIDER_ID, {
    AIVOICE_SEED_AUDIO_BUDGET_LIMIT: '51',
    AIVOICE_SEED_AUDIO_BUDGET_WINDOW: '50',
  } as NodeJS.ProcessEnv), /cannot exceed/);
});
