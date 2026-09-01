import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceProviderRegistry } from '../src/providers/voice-provider-registry.js';
import type { VoiceProviderPort } from '../src/providers/voice-provider.js';

function provider(name: string, referenceMode: 'REGISTERED_VOICE' | 'REFERENCE_AUDIO'): VoiceProviderPort {
  return {
    providerName: name,
    targetModel: `${name}-model`,
    referenceMode,
    async enroll(reference: string) { return reference; },
    async synthesize() { return Buffer.from(name); },
    async deleteVoice() {},
  };
}

test('provider registry keeps active selection independent from registered identity and companions', () => {
  const active = provider('cosy', 'REGISTERED_VOICE');
  const expressiveA = provider('seed-a', 'REFERENCE_AUDIO');
  const expressiveB = provider('seed-b', 'REFERENCE_AUDIO');
  const registry = createVoiceProviderRegistry({ active, registered: active, companions: [expressiveA, expressiveB] });
  assert.equal(registry.active.id, 'cosy');
  assert.equal(registry.registered.id, 'cosy');
  assert.deepEqual(registry.companions.map((item) => item.id), ['seed-a', 'seed-b']);
  assert.ok(registry.companions[1].qualityRank > registry.companions[0].qualityRank);
});

test('provider registry rejects reference-only identity storage and registered companions', () => {
  const registered = provider('cosy', 'REGISTERED_VOICE');
  const anotherRegistered = provider('registered-two', 'REGISTERED_VOICE');
  const reference = provider('seed', 'REFERENCE_AUDIO');
  assert.throws(() => createVoiceProviderRegistry({ active: reference, registered: reference, companions: [] }), /cannot use reference-audio mode/);
  assert.throws(() => createVoiceProviderRegistry({ active: registered, registered, companions: [anotherRegistered] }), /Companion voice provider/);
});
