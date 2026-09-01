import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { shouldUseParallelVoice, startVoiceGeneration, voiceGenerationStrategy } from '../src/voice-generation-strategy.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('strong or expressively complex chat replies trigger Seed while ordinary and exact speech do not', () => {
  const plain = buildEmotionExpressionPlan({ replyTone: 'PLAIN', text: '我知道了。', interactionState: null });
  const strong = buildEmotionExpressionPlan({ replyTone: 'SAD_OR_HURT', text: '我真的忍不住哭了。', interactionState: null });
  const hardSoft = buildEmotionExpressionPlan({
    replyTone: 'MIXED', text: '我才没担心你，就是回来看看。', interactionState: null,
    personalityNote: '嘴硬心软：担心时不会直接承认。',
  });
  assert.equal(shouldUseParallelVoice({ mode: 'CHAT', text: '我知道了。', expression: plain }), false);
  assert.equal(shouldUseParallelVoice({ mode: 'CHAT', text: '我真的忍不住哭了。', expression: strong }), true);
  assert.equal(shouldUseParallelVoice({ mode: 'CHAT', text: '我才没担心你，就是回来看看。', expression: hardSoft }), true);
  assert.equal(shouldUseParallelVoice({ mode: 'EXACT_SPEECH', text: '我真的忍不住哭了。', expression: strong }), false);
});

test('the fastest provider becomes playable and a higher-ranked later result is exposed as an upgrade', async () => {
  const generated = await startVoiceGeneration([
    { id: 'fast', qualityRank: 10, generate: async () => { await wait(5); return Buffer.from('cosy'); } },
    { id: 'expressive', qualityRank: 100, generate: async () => { await wait(20); return Buffer.from('seed'); } },
  ]);
  assert.equal(generated.primary.id, 'fast');
  assert.equal(generated.primary.audio.toString(), 'cosy');
  const upgrade = await generated.bestUpgrade;
  assert.equal(upgrade?.id, 'expressive');
  assert.equal(upgrade?.audio.toString(), 'seed');
});

test('the higher-quality provider is used immediately if it wins and providers fail independently', async () => {
  const expressiveFirst = await startVoiceGeneration([
    { id: 'fast', qualityRank: 10, generate: async () => { await wait(20); return Buffer.from('cosy'); } },
    { id: 'expressive', qualityRank: 100, generate: async () => Buffer.from('seed') },
  ]);
  assert.equal(expressiveFirst.primary.id, 'expressive');

  const fallback = await startVoiceGeneration([
    { id: 'fast', qualityRank: 10, generate: async () => Buffer.from('cosy') },
    { id: 'expressive', qualityRank: 100, generate: async () => { throw new Error('unavailable'); } },
  ]);
  assert.equal(fallback.primary.id, 'fast');
  assert.equal(await fallback.bestUpgrade, null);

  await assert.rejects(
    startVoiceGeneration([
      { id: 'one', qualityRank: 10, generate: async () => { throw new Error('one unavailable'); } },
      { id: 'two', qualityRank: 20, generate: async () => { throw new Error('two unavailable'); } },
    ]),
    /All voice providers failed/,
  );
});

test('strategy configuration preserves single-provider and selective-parallel modes', () => {
  assert.equal(voiceGenerationStrategy({ AIVOICE_VOICE_STRATEGY: 'single' } as NodeJS.ProcessEnv), 'SINGLE');
  assert.equal(voiceGenerationStrategy({ AIVOICE_VOICE_STRATEGY: 'selective-parallel' } as NodeJS.ProcessEnv), 'SELECTIVE_PARALLEL');
  assert.equal(voiceGenerationStrategy({ AIVOICE_DUAL_VOICE_ENABLED: 'true' } as NodeJS.ProcessEnv), 'SELECTIVE_PARALLEL');
});
