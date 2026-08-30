import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCharacterGenerationQuality,
  chatTemperatureForFocus,
  GenerationQualityError,
  qualityRetryMessages,
  withOneQualityRetry,
} from '../src/chat/generation-quality.js';
import { legacyCharacterTurnGeneration } from '../src/chat/interaction-state.js';
import { compileVoiceChatMessages } from '../src/chat/voice-chat-context.js';

test('quality retry does not call the model twice when the first result passes', async () => {
  let calls = 0;
  const result = await withOneQualityRetry({
    generate: async () => { calls += 1; return 'ok'; },
    evaluate: () => ({ retryReasons: [] as string[], value: 'accepted' }),
  });
  assert.equal(calls, 1);
  assert.equal(result.attemptCount, 1);
  assert.deepEqual(result.firstAttemptReasons, []);
});

test('Qwen uses higher temperature only for active playful phases', () => {
  const playfulContext = compileVoiceChatMessages({
    structuredOutput: true, currentMessageId: 'playful', voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】爱开玩笑：会调侃；喜欢亲近：会主动靠近。', history: [], currentInput: '到了以后你想怎么安排？',
  });
  const factualContext = compileVoiceChatMessages({
    structuredOutput: true, currentMessageId: 'factual', voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】表达直接：点明问题；重视边界：说清期待。', history: [], currentInput: '我今晚会晚一个小时到，刚才忙忘了跟你说。',
  });
  assert.equal(chatTemperatureForFocus(playfulContext.personalityTurnFocus), 0.85);
  assert.equal(chatTemperatureForFocus(factualContext.personalityTurnFocus), 0.55);
});

test('quality retry runs exactly once after a deterministic failure', async () => {
  let calls = 0;
  const retries: string[][] = [];
  const result = await withOneQualityRetry({
    generate: async () => { calls += 1; return calls; },
    evaluate: (attempt) => ({ retryReasons: attempt === 1 ? ['RESOLVED_BOUNDARY_REOPENED'] : [], attempt }),
    onRetry: (reasons) => { retries.push(reasons); },
  });
  assert.equal(calls, 2);
  assert.equal(result.attemptCount, 2);
  assert.deepEqual(result.firstAttemptReasons, ['RESOLVED_BOUNDARY_REOPENED']);
  assert.deepEqual(retries, [['RESOLVED_BOUNDARY_REOPENED']]);
});

test('quality retry stops after the second rejected result', async () => {
  let calls = 0;
  await assert.rejects(() => withOneQualityRetry({
    generate: async () => { calls += 1; return calls; },
    evaluate: () => ({ retryReasons: ['AFFECTION_PASSIVE_PERMISSION'] }),
  }), (error: unknown) => error instanceof GenerationQualityError
    && error.reasons[0] === 'AFFECTION_PASSIVE_PERMISSION');
  assert.equal(calls, 2);
});

test('unsupported current-state claims request a retry before audio generation', () => {
  const context = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: 'quality-current',
    voiceName: '小宁', ageYears: 24, gender: 'FEMALE', userAgeYears: 26,
    relationshipType: 'PARTNER', relationshipLabel: '', userAddress: '阿哲',
    personalityNote: '【用户明确选择】表达直接：点明问题。',
    history: [], currentInput: '我今晚会晚一个小时到。',
  });
  const quality = evaluateCharacterGenerationQuality({
    generation: legacyCharacterTurnGeneration('我知道你不是故意的，但我已经干等了一个小时。'),
    currentUserText: '我今晚会晚一个小时到。',
    relationshipType: 'MOTHER',
    subjectBackground: null,
    recentUserInputs: [],
    recentCharacterReplies: [],
    currentTurn: context.currentTurn,
    recentTurns: context.recentTurns,
    previousState: context.previousInteractionState,
    control: context.runtimeDialogueControl,
    personalityTurnFocus: context.personalityTurnFocus,
    profile: { personalityNote: '表达直接', speechHabitNote: null, relationshipNote: null },
  });
  assert.ok(quality.retryReasons.includes('UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED'));
  assert.equal(quality.outputText, '我知道你不是故意的。');
});

test('retry prompt preserves the original messages and adds only one correction system message', () => {
  const messages = [
    { role: 'system' as const, content: 'system' },
    { role: 'user' as const, content: 'hello' },
  ];
  const retry = qualityRetryMessages(messages, ['COUNSELOR_TEMPLATE']);
  assert.equal(retry.length, 3);
  assert.equal(retry[0], messages[0]);
  assert.match(retry[1]?.content || '', /COUNSELOR_TEMPLATE/);
  assert.equal(retry[2], messages[1]);
  const affectionRetry = qualityRetryMessages(messages, ['AFFECTION_PASSIVE_PERMISSION']);
  assert.match(affectionRetry[1]?.content || '', /用第一人称表达自己的亲近意愿或主动动作/);
  assert.match(affectionRetry[1]?.content || '', /不能只说可以、行、好吧、随你/);
});
