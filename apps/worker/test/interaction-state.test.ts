import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activePreviousInteractionState,
  normalizeInteractionStateDetailed,
  parseCharacterTurnGeneration,
  type ConversationInteractionState,
} from '../src/chat/interaction-state.js';

const currentTurn = { id: 'current:USER', role: 'USER' as const, content: '你每次都说两分钟，手机给我。' };
const profile = { personalityNote: '有自己的主意。', speechHabitNote: '多用短句。', relationshipNote: '母女会直接说清楚。' };

test('V2 structured generation separates reply tone, carried affect and action', () => {
  const parsed = parseCharacterTurnGeneration({
    replyTone: 'IRRITATED', reply: '等一下，我真的马上就好了。',
    carryEmotion: 'ANNOYED', carryIntensity: 1, carryCauseSource: 'CURRENT_OR_RECENT_DIALOGUE', carryCauseTurnId: 'current:USER', carryCauseQuote: '手机给我', carryEmotionEvidence: '等一下', carryRemainingTurns: 1,
    actionStance: 'DEFER', actionCurrentWant: '先把当前内容看完', actionCauseSource: 'CURRENT_OR_RECENT_DIALOGUE', actionCauseTurnId: 'current:USER', actionCauseQuote: '手机给我',
    requestKind: 'REQUEST', requestLoad: 'LOW', requestBasisSource: 'CURRENT_REQUEST', requestBasisTurnId: 'current:USER', requestBasisEvidence: '手机给我', requestBasisField: 'NONE',
  });
  assert.equal(parsed.replyTone, 'IRRITATED');
  assert.equal(parsed.interactionState.carryAffect?.emotion, 'ANNOYED');
  assert.equal(parsed.interactionState.action.stance, 'DEFER');
});

test('tone mismatch drops only carried affect and preserves valid action', () => {
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2,
      carryAffect: { emotion: 'HURT', intensity: 1, cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '手机给我' }, emotionEvidence: '好耶', remainingTurns: 1 },
      action: { stance: 'DEFER', currentWant: '继续看完', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '手机给我' }, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: { source: 'CURRENT_REQUEST', turnId: 'current:USER', evidence: '手机给我' } } },
    },
    replyTone: 'POSITIVE', reply: '好耶，那周末去书店！', currentTurn, recentTurns: [], previousState: null, profile,
  });
  assert.equal(normalized.state.carryAffect, null);
  assert.equal(normalized.state.action.stance, 'DEFER');
  assert.ok(normalized.issues.includes('AFFECT_NOT_ALLOWED_BY_REPLY_TONE'));
});

test('valid affect requires both dialogue cause and observable reply evidence', () => {
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2,
      carryAffect: { emotion: 'ANNOYED', intensity: 2, cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '手机给我' }, emotionEvidence: '别直接拿', remainingTurns: 3 },
      action: { stance: 'SET_BOUNDARY', currentWant: '先说完再交手机', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '手机给我' }, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: { source: 'CURRENT_CONTEXT', turnId: 'current:USER', evidence: '手机给我' } } },
    },
    replyTone: 'IRRITATED', reply: '你别直接拿，我说完就给。', currentTurn, recentTurns: [], previousState: null, profile,
  });
  assert.equal(normalized.state.carryAffect?.emotion, 'ANNOYED');
  assert.equal(normalized.state.carryAffect?.remainingTurns, 2);
  assert.equal(normalized.state.action.stance, 'SET_BOUNDARY');
  assert.equal(normalized.accepted, true);
});

test('previous affect can only decay and an action requires fresh dialogue evidence', () => {
  const previous: ConversationInteractionState = {
    version: 2,
    carryAffect: { emotion: 'HURT', intensity: 2, cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'old:USER', quote: '你总是这样' }, emotionEvidence: '这话挺伤人', remainingTurns: 2 },
    action: { stance: 'DEFER', currentWant: '先缓一会儿', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'old:USER', quote: '你总是这样' }, requestDecision: { kind: 'NONE' } },
    createdAt: new Date().toISOString(),
  };
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2,
      carryAffect: { emotion: 'HURT', intensity: 3, cause: { source: 'PREVIOUS_STATE' }, emotionEvidence: '我还没缓过来', remainingTurns: 3 },
      action: { stance: 'RESPOND', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } },
    },
    replyTone: 'SAD_OR_HURT', reply: '我还没缓过来，等会儿再说。', currentTurn, recentTurns: [], previousState: previous, profile,
  });
  assert.equal(normalized.state.carryAffect?.intensity, 2);
  assert.equal(normalized.state.carryAffect?.remainingTurns, 1);
  assert.equal(normalized.state.action.stance, 'RESPOND');
});

test('material full acceptance based only on the request is a quality failure', () => {
  const materialTurn = { id: 'material:USER', role: 'USER' as const, content: '以后所有家务都你来。' };
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2, carryAffect: null,
      action: { stance: 'ACCEPT', currentWant: '把所有家务包下来', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'material:USER', quote: '以后所有家务都你来' }, requestDecision: { kind: 'REQUEST', load: 'MATERIAL', basis: { source: 'CURRENT_REQUEST', turnId: 'material:USER', evidence: '以后所有家务都你来' } } },
    },
    replyTone: 'PLAIN', reply: '行，都交给我。', currentTurn: materialTurn, recentTurns: [], previousState: null, profile,
  });
  assert.ok(normalized.qualityFlags.includes('UNSUPPORTED_MATERIAL_FULL_ACCEPTANCE'));
});

test('an ordinary bounded household task is not hard material even if the model mislabeled it', () => {
  const kitchenTurn = { id: 'kitchen:USER', role: 'USER' as const, content: '今晚厨房你收一下。' };
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2, carryAffect: null,
      action: { stance: 'ACCEPT', currentWant: '今晚收厨房', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'kitchen:USER', quote: '今晚厨房你收一下' }, requestDecision: { kind: 'REQUEST', load: 'MATERIAL', basis: { source: 'CURRENT_REQUEST', turnId: 'kitchen:USER', evidence: '今晚厨房你收一下' } } },
    },
    replyTone: 'PLAIN', reply: '行，今晚我收。', currentTurn: kitchenTurn, recentTurns: [], previousState: null, profile,
  });
  assert.ok(normalized.qualityFlags.includes('MODEL_LOAD_MATERIAL_UNCONFIRMED'));
  assert.ok(!normalized.qualityFlags.includes('UNSUPPORTED_MATERIAL_FULL_ACCEPTANCE'));
});

test('a uniquely matching historical request is deterministically relocated to current context', () => {
  const normalized = normalizeInteractionStateDetailed({
    candidate: {
      version: 2, carryAffect: null,
      action: { stance: 'ACCEPT', currentWant: '明天先不去', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '有人传话' }, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: { source: 'CURRENT_REQUEST', turnId: 'current:USER', evidence: '我明天不想去了' } } },
    },
    replyTone: 'PLAIN', reply: '那明天先不去。', currentTurn: { id: 'current:USER', role: 'USER', content: '有人传话，我不想见她。' }, recentTurns: [{ id: 'old:USER', role: 'USER', content: '我明天不想去了。' }], previousState: null, profile,
  });
  assert.equal(normalized.state.action.requestDecision.kind, 'REQUEST');
  if (normalized.state.action.requestDecision.kind === 'REQUEST') assert.equal(normalized.state.action.requestDecision.basis?.source, 'CURRENT_CONTEXT');
  assert.ok(normalized.qualityFlags.includes('REQUEST_EVIDENCE_RELOCATED'));
});

test('accepting an explanation without an action request is normalized to respond and fails metadata acceptance', () => {
  const normalized = normalizeInteractionStateDetailed({
    candidate: { version: 2, carryAffect: null, action: { stance: 'ACCEPT', currentWant: '接受解释', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '不是故意管你' }, requestDecision: { kind: 'NONE' } } },
    replyTone: 'PLAIN', reply: '我知道，马上就好。', currentTurn: { id: 'current:USER', role: 'USER', content: '不是故意管你。' }, recentTurns: [], previousState: null, profile,
  });
  assert.equal(normalized.state.action.stance, 'RESPOND');
  assert.equal(normalized.accepted, false);
  assert.equal(normalized.resetReason, 'REQUEST_STANCE_WITHOUT_ACTION_REQUEST');
});

test('turn control rejects a disallowed ASK and an ACCEPT under force-none', () => {
  const askBlocked = normalizeInteractionStateDetailed({
    candidate: { version: 2, carryAffect: null, action: { stance: 'ASK', currentWant: '继续问', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '每天都很压抑' }, requestDecision: { kind: 'NONE' } } },
    replyTone: 'PLAIN', reply: '那你接下来怎么安排？', currentTurn: { id: 'current:USER', role: 'USER', content: '每天都很压抑。' }, recentTurns: [], previousState: null, profile,
    control: { questionPolicy: 'FORBIDDEN', allowedActionStances: ['RESPOND', 'SHARE', 'REPAIR'], requestPolicy: 'AUTO', forcedRequestTurnId: '', forcedRequestQuote: '' },
  });
  assert.equal(askBlocked.accepted, false);
  assert.ok(askBlocked.issues.includes('ACTION_STANCE_NOT_ALLOWED'));

  const forceNone = normalizeInteractionStateDetailed({
    candidate: { version: 2, carryAffect: null, action: { stance: 'ACCEPT', currentWant: '接受解释', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'current:USER', quote: '不是故意管你' }, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: { source: 'CURRENT_REQUEST', turnId: 'current:USER', evidence: '不是故意管你' } } } },
    replyTone: 'PLAIN', reply: '我知道，马上就好。', currentTurn: { id: 'current:USER', role: 'USER', content: '不是故意管你。' }, recentTurns: [], previousState: null, profile,
    control: { questionPolicy: 'AT_MOST_ONE', allowedActionStances: ['RESPOND', 'SHARE', 'ASK', 'DISAGREE', 'SET_BOUNDARY', 'DEFER', 'REPAIR', 'END_TOPIC'], requestPolicy: 'FORCE_NONE', forcedRequestTurnId: '', forcedRequestQuote: '' },
  });
  assert.equal(forceNone.state.action.stance, 'RESPOND');
  assert.equal(forceNone.state.action.requestDecision.kind, 'NONE');
  assert.ok(forceNone.issues.includes('REQUEST_ONLY_STANCE_UNDER_FORCE_NONE'));
});

test('turn control deterministically supplies a forced low current request', () => {
  const forced = normalizeInteractionStateDetailed({
    candidate: { version: 2, carryAffect: null, action: { stance: 'ASK', currentWant: '了解原因', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'plan:USER', quote: '我明天不想去了' }, requestDecision: { kind: 'NONE' } } },
    replyTone: 'PLAIN', reply: '是出了什么事？', currentTurn: { id: 'plan:USER', role: 'USER', content: '爸，我明天不想去了。' }, recentTurns: [], previousState: null, profile,
    control: { questionPolicy: 'AT_MOST_ONE', allowedActionStances: ['ASK', 'ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE', 'DISAGREE', 'SET_BOUNDARY', 'DEFER'], requestPolicy: 'FORCE_LOW_CURRENT', forcedRequestTurnId: 'plan:USER', forcedRequestQuote: '我明天不想去了' },
  });
  assert.equal(forced.accepted, true);
  assert.equal(forced.state.action.requestDecision.kind, 'REQUEST');
  if (forced.state.action.requestDecision.kind === 'REQUEST') {
    assert.equal(forced.state.action.requestDecision.load, 'LOW');
    assert.equal(forced.state.action.requestDecision.basis?.source, 'CURRENT_REQUEST');
  }
  assert.ok(forced.qualityFlags.includes('REQUEST_FIELDS_OVERRIDDEN_BY_CONTROL'));
});

test('a cause-less pure share is safely canonicalized to respond without rejecting natural text', () => {
  const normalized = normalizeInteractionStateDetailed({
    candidate: { version: 2, carryAffect: null, action: { stance: 'SHARE', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } } },
    replyTone: 'POSITIVE', reply: '真的吗？那我想去书店看看。', currentTurn: { id: 'choice:USER', role: 'USER', content: '周末你自己选去哪儿。' }, recentTurns: [], previousState: null, profile,
  });
  assert.equal(normalized.accepted, true);
  assert.equal(normalized.state.action.stance, 'RESPOND');
  assert.ok(normalized.qualityFlags.includes('ACTION_SHARE_WITHOUT_CAUSE_CANONICALIZED'));
});

test('stored V2 state expires after thirty minutes', () => {
  const state: ConversationInteractionState = {
    version: 2,
    carryAffect: { emotion: 'PLEASED', intensity: 1, cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'm1:USER', quote: '成功了' }, emotionEvidence: '真不错', remainingTurns: 1 },
    action: { stance: 'SHARE', currentWant: '继续说', cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 'm1:USER', quote: '成功了' }, requestDecision: { kind: 'NONE' } },
    createdAt: '2026-08-28T00:00:00.000Z',
  };
  assert.ok(activePreviousInteractionState(state, Date.parse('2026-08-28T00:29:59.000Z')));
  assert.equal(activePreviousInteractionState(state, Date.parse('2026-08-28T00:30:01.000Z')), null);
});
