import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRuntimeDialogueControl,
  detectConversationBoundary,
  explicitLowActionRequestQuote,
  explicitLowPlanChangeQuote,
  isRepairExplanationWithoutRequest,
  validateQuestionBehavior,
} from '../src/chat/dialogue-control.js';

const action = (stance: 'RESPOND' | 'ASK') => ({ stance, currentWant: null, cause: null, requestDecision: { kind: 'NONE' as const } });

test('dialogue control detects explicit conversational boundaries', () => {
  assert.equal(detectConversationBoundary('你别问那么多，我现在不想解释。'), 'NO_MORE_QUESTIONS');
  assert.equal(detectConversationBoundary('你别一直问，我就是不想见那个人。'), 'NO_MORE_QUESTIONS');
  assert.equal(detectConversationBoundary('别替我决定，我只是想听意见。'), 'NO_DECISION_FOR_ME');
  assert.equal(detectConversationBoundary('先别讲大道理。'), 'NO_LECTURE');
  assert.equal(detectConversationBoundary('你觉得怎样？'), 'NONE');
});

test('dialogue control removes ASK after a question and blocks disguised re-asking', () => {
  const control = buildRuntimeDialogueControl({ recentActionStances: ['RESPOND', 'ASK'], currentUserText: '主要是领导总改口。', currentTurnId: 'current:USER' });
  assert.equal(control.questionPolicy, 'FORBIDDEN');
  assert.ok(!control.allowedActionStances.includes('ASK'));
  assert.deepEqual(validateQuestionBehavior('那你说说原因。', action('RESPOND'), control), ['ASK_COOLDOWN_VIOLATION']);
  assert.deepEqual(validateQuestionBehavior('老改口确实磨人，你先把退路想好。', action('RESPOND'), control), []);
});

test('question validation rejects compound intents even when there is only one question mark', () => {
  const control = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '我胃不舒服。', currentTurnId: 'current:USER' });
  assert.deepEqual(validateQuestionBehavior('怎么胃不舒服了，是不是最近没好好吃饭？', action('ASK'), control), ['MULTIPLE_QUESTION_INTENTS']);
  assert.deepEqual(validateQuestionBehavior('你具体几点搬、要帮什么忙？', action('ASK'), control), ['MULTIPLE_QUESTION_INTENTS']);
  assert.deepEqual(validateQuestionBehavior('周六具体几点开始？', action('ASK'), control), []);
});

test('an explicit no-question boundary forbids choice questions but an invitation can reopen one question', () => {
  const blocked = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '你别问那么多，我现在不想解释。', currentTurnId: 'current:USER' });
  assert.equal(blocked.questionPolicy, 'FORBIDDEN');
  assert.ok(validateQuestionBehavior('好，先不问。那你在家还是去奶奶家？', action('RESPOND'), blocked).includes('EXPLICIT_QUESTION_BOUNDARY_VIOLATION'));

  const invited = buildRuntimeDialogueControl({ recentActionStances: ['ASK'], currentUserText: '没关系，你问吧。', currentTurnId: 'current:USER' });
  assert.equal(invited.questionPolicy, 'AT_MOST_ONE');
  assert.ok(invited.allowedActionStances.includes('ASK'));
});

test('a no-question boundary persists for one following character reply unless the user reopens questions', () => {
  const carried = buildRuntimeDialogueControl({
    recentActionStances: ['ACCEPT'],
    currentUserText: '有人把我的话传出去了，我不想见她。',
    currentTurnId: 'next:USER',
    previousUserRequestedNoMoreQuestions: true,
  });
  assert.equal(carried.noMoreQuestionsActive, true);
  assert.equal(carried.questionPolicy, 'FORBIDDEN');
  assert.ok(!carried.allowedActionStances.includes('ASK'));

  const reopened = buildRuntimeDialogueControl({
    recentActionStances: ['ACCEPT'],
    currentUserText: '你想问什么就问吧。',
    currentTurnId: 'reopen:USER',
    previousUserRequestedNoMoreQuestions: true,
  });
  assert.equal(reopened.noMoreQuestionsActive, false);
  assert.equal(reopened.questionPolicy, 'AT_MOST_ONE');
});

test('high-confidence plan changes force a low request without classifying ordinary feelings', () => {
  assert.equal(explicitLowPlanChangeQuote('爸，我明天不想去了。'), '我明天不想去了');
  const current = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '爸，我明天不想去了。', currentTurnId: 'm1:USER' });
  assert.equal(current.requestPolicy, 'FORCE_LOW_CURRENT');
  assert.equal(current.forcedRequestTurnId, 'm1:USER');
  assert.ok(!current.allowedActionStances.includes('RESPOND'));

  const feeling = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '我今天很累。', currentTurnId: 'm2:USER' });
  assert.equal(feeling.requestPolicy, 'FORCE_NONE');
});

test('high-confidence bounded action requests are forced low without broad semantic guessing', () => {
  assert.equal(explicitLowActionRequestQuote('你每次都说两分钟，手机给我。'), '手机给我');
  assert.equal(explicitLowActionRequestQuote('小雨，饭好了，先别看了。'), '先别看了');
  assert.equal(explicitLowActionRequestQuote('行，抱一下。厨房也你收。'), '抱一下');
  assert.equal(explicitLowActionRequestQuote('小雨，饭好了，先把手机放下。'), '先把手机放下');
  assert.equal(explicitLowActionRequestQuote('你别一口气念这么多，我还没决定。'), '别一口气念这么多');
  assert.equal(explicitLowActionRequestQuote('你别一上来就发火，我又不是故意的。'), '别一上来就发火');
  const phone = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '你每次都说两分钟，手机给我。', currentTurnId: 'phone:USER' });
  assert.equal(phone.requestPolicy, 'FORCE_LOW_CURRENT');
  assert.equal(phone.forcedRequestQuote, '手机给我');
  assert.ok(!phone.allowedActionStances.includes('RESPOND'));
});

test('a clear fatigue disclosure remains non-request even when the character may volunteer help', () => {
  const tired = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '我今天累死了，回去什么都不想动。', currentTurnId: 'tired:USER' });
  assert.equal(tired.requestPolicy, 'FORCE_NONE');
  assert.ok(!tired.allowedActionStances.includes('ACCEPT'));
});

test('an explicit stop-firing request outranks the same message repair explanation, while a user offer stays non-request', () => {
  const stopFiring = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '你别一上来就发火，我又不是故意的。', currentTurnId: 'anger:USER' });
  assert.equal(stopFiring.requestPolicy, 'FORCE_LOW_CURRENT');
  assert.equal(stopFiring.forcedRequestQuote, '别一上来就发火');

  const foodOffer = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '我现在出发，顺路给你带点吃的。', currentTurnId: 'offer:USER' });
  assert.equal(foodOffer.requestPolicy, 'FORCE_NONE');
  assert.ok(!foodOffer.allowedActionStances.includes('ACCEPT'));
});

test('a continued plan uses historical evidence while repair and opinion turns force no request', () => {
  const continued = buildRuntimeDialogueControl({
    recentActionStances: ['ASK'],
    currentUserText: '有人把我的话传出去了，我不想见她。',
    currentTurnId: 'm3:USER',
    pendingPlanRequest: { turnId: 'm1:USER', quote: '我明天不想去了' },
  });
  assert.equal(continued.requestPolicy, 'FORCE_LOW_CONTEXT');
  assert.equal(continued.forcedRequestTurnId, 'm1:USER');

  assert.equal(isRepairExplanationWithoutRequest('妈妈是怕饭凉了，不是故意管你。'), true);
  const repair = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '妈妈是怕饭凉了，不是故意管你。', currentTurnId: 'm4:USER' });
  assert.equal(repair.requestPolicy, 'FORCE_NONE');
  assert.ok(!repair.allowedActionStances.includes('ACCEPT'));

  const opinion = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '你是不是觉得我在逃避？', currentTurnId: 'm5:USER' });
  assert.equal(opinion.requestPolicy, 'FORCE_NONE');
  const reassurance = buildRuntimeDialogueControl({ recentActionStances: [], currentUserText: '那明天你会不会又临时逼我去？', currentTurnId: 'm6:USER' });
  assert.equal(reassurance.requestPolicy, 'FORCE_NONE');
});
