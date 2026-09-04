import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('both worker backends retain a registered speaker id while stable chat never switches to Seed', () => {
  for (const relative of ['src/job-runner.ts', 'src/cloudbase-job-runner.ts']) {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8');
    assert.match(source, /registeredProvider\.enroll\(referencePath/);
    assert.match(source, /registeredProvider\.providerName/);
    assert.match(source, /registeredProvider\.targetModel/);
    assert.match(source, /registeredProvider\(\)\.deleteVoice\(providerBinding\)/);
    assert.match(source, /voiceGenerationCoordinator\.generate/);
    assert.match(source, /upgradeReadyMessageAudio/);
  }

  const local = fs.readFileSync(path.resolve(import.meta.dirname, '../src/job-runner.ts'), 'utf8');
  const cloud = fs.readFileSync(path.resolve(import.meta.dirname, '../src/cloudbase-job-runner.ts'), 'utf8');
  assert.match(local, /stableRequest:\s*providerRequest/);
  assert.match(cloud, /stableRequest:\s*providerRequest/);
  assert.match(local, /Identity-stable voice route must not resolve reference audio/);
  assert.match(cloud, /Identity-stable voice route must not resolve reference audio/);
  assert.doesNotMatch(local, /resolveReference:\s*async \(\) => referencePath/);
  assert.doesNotMatch(cloud, /download\(this\.audioBucket, message\.referenceObjectKey, referencePath\)/);
  assert.doesNotMatch(local, /Existing voice must be recreated before Seed Audio use/);
  assert.doesNotMatch(cloud, /Existing voice must be recreated before Seed Audio use/);
});
