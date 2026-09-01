import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { VoiceGenerationCoordinator } from '../src/voice-generation-coordinator.js';
import type { VoiceProviderRegistry } from '../src/providers/voice-provider-registry.js';
import type { VoiceProviderPort } from '../src/providers/voice-provider.js';

function provider(name: string, referenceMode: 'REGISTERED_VOICE' | 'REFERENCE_AUDIO', calls: string[]): VoiceProviderPort {
  return {
    providerName: name,
    targetModel: name,
    referenceMode,
    async enroll(value: string) { return value; },
    async synthesize(reference: string) { calls.push(`${name}:${reference}`); return Buffer.from(name); },
    async deleteVoice() {},
  };
}

function request(expression: ReturnType<typeof buildEmotionExpressionPlan>, resolveReference: () => Promise<string>) {
  return {
    mode: 'CHAT' as const,
    visibleText: expression.intensity >= 2 ? '我真的忍不住哭了。' : '我知道了。',
    synthesisText: 'synthesis-text',
    expression,
    registeredBinding: 'speaker-id',
    resolveReference,
    options: {},
  };
}

test('single strategy invokes only the selected active provider', async () => {
  const calls: string[] = [];
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const companion = provider('companion', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [{ id: 'companion', qualityRank: 100, provider: companion }],
  };
  const expression = buildEmotionExpressionPlan({ replyTone: 'SAD_OR_HURT', text: '我真的忍不住哭了。', interactionState: null });
  const generated = await new VoiceGenerationCoordinator(registry, () => 'SINGLE').generate(request(expression, async () => 'reference.wav'));
  assert.equal(generated.primary.id, 'registered');
  assert.deepEqual(calls, ['registered:speaker-id']);
});

test('coordinator rejects a reference-audio provider in the low-latency registered lane', () => {
  const calls: string[] = [];
  const invalid = provider('invalid-registered', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'invalid-registered', qualityRank: 10, provider: invalid },
    registered: { id: 'invalid-registered', qualityRank: 10, provider: invalid },
    companions: [],
  };
  assert.throws(
    () => new VoiceGenerationCoordinator(registry, () => 'SINGLE'),
    /Registered voice provider cannot use reference-audio mode/,
  );
});

test('selective parallel invokes registered and every companion only for expressive replies', async () => {
  const calls: string[] = [];
  let referenceResolves = 0;
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const companionA = provider('companion-a', 'REFERENCE_AUDIO', calls);
  const companionB = provider('companion-b', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [
      { id: 'companion-a', qualityRank: 100, provider: companionA },
      { id: 'companion-b', qualityRank: 101, provider: companionB },
    ],
  };
  const coordinator = new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL');
  const strong = buildEmotionExpressionPlan({ replyTone: 'IRRITATED', text: '你总是替我决定，我真的受不了了。', interactionState: null });
  const generated = await coordinator.generate(request(strong, async () => { referenceResolves += 1; return 'reference.wav'; }));
  await generated.bestUpgrade;
  assert.deepEqual(calls.sort(), ['companion-a:reference.wav', 'companion-b:reference.wav', 'registered:speaker-id']);
  assert.equal(referenceResolves, 1);

  calls.length = 0;
  const plain = buildEmotionExpressionPlan({ replyTone: 'PLAIN', text: '我知道了。', interactionState: null });
  await coordinator.generate(request(plain, async () => 'reference.wav'));
  assert.deepEqual(calls, ['registered:speaker-id']);
});

test('selective parallel skips a companion denied by its independent budget without delaying the registered voice', async () => {
  const calls: string[] = [];
  const checked: string[] = [];
  let referenceResolves = 0;
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const seed = provider('volcengine-seed-audio', 'REFERENCE_AUDIO', calls);
  const future = provider('future-provider', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [
      { id: 'volcengine-seed-audio', qualityRank: 100, provider: seed },
      { id: 'future-provider', qualityRank: 101, provider: future },
    ],
  };
  const expression = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '你总是替我决定，我真的受不了了。', interactionState: null,
  });
  const input = request(expression, async () => { referenceResolves += 1; return 'reference.wav'; });
  const generated = await new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL').generate({
    ...input,
    allowCompanion: async (entry) => {
      checked.push(entry.id);
      return entry.id !== 'volcengine-seed-audio';
    },
  });
  await generated.bestUpgrade;
  assert.deepEqual(checked, ['volcengine-seed-audio', 'future-provider']);
  assert.deepEqual(calls.sort(), ['future-provider:reference.wav', 'registered:speaker-id']);
  assert.equal(referenceResolves, 1);
});

test('ordinary replies never reserve companion budget', async () => {
  const calls: string[] = [];
  let budgetChecks = 0;
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const seed = provider('volcengine-seed-audio', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [{ id: 'volcengine-seed-audio', qualityRank: 100, provider: seed }],
  };
  const expression = buildEmotionExpressionPlan({ replyTone: 'PLAIN', text: '我知道了。', interactionState: null });
  await new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL').generate({
    ...request(expression, async () => 'reference.wav'),
    allowCompanion: () => { budgetChecks += 1; return true; },
  });
  assert.equal(budgetChecks, 0);
  assert.deepEqual(calls, ['registered:speaker-id']);
});

test('budget reservation never delays the registered primary provider', async () => {
  const calls: string[] = [];
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const seed = provider('volcengine-seed-audio', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [{ id: 'volcengine-seed-audio', qualityRank: 100, provider: seed }],
  };
  const expression = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '你总是替我决定，我真的受不了了。', interactionState: null,
  });
  let releaseBudget!: () => void;
  const budgetPending = new Promise<void>((resolve) => { releaseBudget = resolve; });
  const generation = new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL').generate({
    ...request(expression, async () => 'reference.wav'),
    allowCompanion: async () => {
      await budgetPending;
      return true;
    },
  });
  const session = await Promise.race([
    generation,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('registered audio waited for budget')), 100)),
  ]);
  assert.equal(session.primary.id, 'registered');
  releaseBudget();
  await session.bestUpgrade;
  assert.deepEqual(calls.sort(), ['registered:speaker-id', 'volcengine-seed-audio:reference.wav']);
});

test('selective parallel falls back to the registered provider when the companion budget is exhausted', async () => {
  const calls: string[] = [];
  const registered = provider('registered', 'REGISTERED_VOICE', calls);
  const companion = provider('companion', 'REFERENCE_AUDIO', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'registered', qualityRank: 10, provider: registered },
    registered: { id: 'registered', qualityRank: 10, provider: registered },
    companions: [{ id: 'companion', qualityRank: 100, provider: companion }],
  };
  const strong = buildEmotionExpressionPlan({ replyTone: 'IRRITATED', text: '你总是替我决定，我真的受不了了。', interactionState: null });
  const generated = await new VoiceGenerationCoordinator(registry, () => 'SELECTIVE_PARALLEL').generate({
    ...request(strong, async () => 'reference.wav'),
    allowCompanion: async () => false,
  });
  await generated.bestUpgrade;

  assert.equal(generated.primary.id, 'registered');
  assert.deepEqual(calls, ['registered:speaker-id']);
});

test('single-provider mode ignores the companion budget gate so an active provider switch still works', async () => {
  const calls: string[] = [];
  const seedOnly = provider('seed-only', 'REFERENCE_AUDIO', calls);
  const fallbackRegistered = provider('registered', 'REGISTERED_VOICE', calls);
  const registry: VoiceProviderRegistry = {
    active: { id: 'seed-only', qualityRank: 100, provider: seedOnly },
    registered: { id: 'registered', qualityRank: 10, provider: fallbackRegistered },
    companions: [],
  };
  const strong = buildEmotionExpressionPlan({ replyTone: 'SAD_OR_HURT', text: '我真的忍不住哭了。', interactionState: null });
  const generated = await new VoiceGenerationCoordinator(registry, () => 'SINGLE').generate({
    ...request(strong, async () => 'reference.wav'),
    allowCompanion: () => {
      throw new Error('budget gate should not run in single mode');
    },
  });

  assert.equal(generated.primary.id, 'seed-only');
  assert.deepEqual(calls, ['seed-only:reference.wav']);
});
