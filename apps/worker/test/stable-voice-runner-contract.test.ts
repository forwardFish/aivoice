import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

for (const runnerName of ['job-runner.ts', 'cloudbase-job-runner.ts']) {
  test(`${runnerName} uses the strict stable registered-clone path`, () => {
    const source = fs.readFileSync(new URL(`../src/${runnerName}`, import.meta.url), 'utf8');
    assert.match(source, /buildRegisteredCloneRuntime/);
    assert.match(source, /buildIdentityStableVoicePlan/);
    assert.match(source, /toCosyVoiceProviderRequest/);
    assert.match(source, /buildPinnedCosyVoiceRoute/);
    assert.match(source, /stableRequest:\s*providerRequest/);
    assert.match(source, /stableRoute/);
    assert.match(source, /identityLocked:\s*true/);
    assert.match(source, /storedProvider:/);
    assert.match(source, /storedModel:/);
    assert.match(source, /providerTargetModel:/);
    assert.match(source, /AIVOICE_STABLE_EMOTION_MODE/);
    assert.doesNotMatch(source, /buildSpeechSynthesisPlan/);
    assert.doesNotMatch(source, /const synthesisOptions =/);
    assert.match(source, /Identity-stable voice route must not resolve reference audio/);
  });
}
