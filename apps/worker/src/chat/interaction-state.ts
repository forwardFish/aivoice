import type { TurnGenerationControl } from './dialogue-control.js';

export const REPLY_TONES = ['PLAIN', 'POSITIVE', 'CONCERNED', 'LOW_ENERGY', 'UNEASY', 'SAD_OR_HURT', 'IRRITATED', 'MIXED'] as const;
export const CARRY_EMOTIONS = ['PLEASED', 'INTERESTED', 'CONCERNED', 'TIRED', 'UNEASY', 'SAD', 'HURT', 'ANNOYED', 'ANGRY', 'EMBARRASSED', 'MIXED'] as const;
export const INTERACTION_STANCES = ['RESPOND', 'SHARE', 'ASK', 'ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE', 'DISAGREE', 'SET_BOUNDARY', 'DEFER', 'REPAIR', 'END_TOPIC'] as const;
export const REQUEST_DISPOSITIONS = ['ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE', 'DECLINE', 'DEFER'] as const;

const CARRY_EMOTION_VALUES = ['NONE', ...CARRY_EMOTIONS] as const;
const CARRY_CAUSE_SOURCES = ['NONE', 'CURRENT_OR_RECENT_DIALOGUE', 'PREVIOUS_STATE'] as const;
const ACTION_CAUSE_SOURCES = ['NONE', 'CURRENT_OR_RECENT_DIALOGUE'] as const;
const REQUEST_KINDS = ['NONE', 'REQUEST'] as const;
const REQUEST_LOADS = ['NONE', 'LOW', 'MATERIAL'] as const;
const REQUEST_BASIS_SOURCES = ['NONE', 'CURRENT_REQUEST', 'PRIOR_CHARACTER_OFFER', 'CURRENT_CONTEXT', 'EXPLICIT_PROFILE'] as const;
const REQUEST_BASIS_FIELDS = ['NONE', 'PERSONALITY_NOTE', 'SPEECH_HABIT_NOTE', 'RELATIONSHIP_NOTE'] as const;

export type ReplyTone = typeof REPLY_TONES[number];
export type CarryEmotion = typeof CARRY_EMOTIONS[number];
export type InteractionStance = typeof INTERACTION_STANCES[number];
export type RequestDisposition = typeof REQUEST_DISPOSITIONS[number];
export type DialogueEvidence = { source: 'CURRENT_OR_RECENT_DIALOGUE'; turnId: string; quote: string };
export type PreviousStateEvidence = { source: 'PREVIOUS_STATE' };
export type InteractionEvidence = DialogueEvidence | PreviousStateEvidence;
export type CarryAffectState = { emotion: CarryEmotion; intensity: 1 | 2 | 3; cause: InteractionEvidence | null; emotionEvidence: string; remainingTurns: 1 | 2 | 3 };
export type RequestDecisionBasis =
  | { source: 'CURRENT_REQUEST' | 'PRIOR_CHARACTER_OFFER' | 'CURRENT_CONTEXT'; turnId: string; evidence: string }
  | { source: 'EXPLICIT_PROFILE'; field: 'PERSONALITY_NOTE' | 'SPEECH_HABIT_NOTE' | 'RELATIONSHIP_NOTE'; evidence: string };
export type RequestDecision = { kind: 'NONE' } | { kind: 'REQUEST'; load: 'LOW' | 'MATERIAL'; basis: RequestDecisionBasis | null };
export type TurnActionState = { stance: InteractionStance; currentWant: string | null; cause: DialogueEvidence | null; requestDecision: RequestDecision };
export type ConversationInteractionState = { version: 2; carryAffect: CarryAffectState | null; action: TurnActionState; createdAt: string };
export type InteractionStateCandidate = Omit<ConversationInteractionState, 'createdAt'>;
export type CharacterTurnGeneration = { replyTone: ReplyTone; reply: string; interactionState: InteractionStateCandidate };
export type PromptTurn = { id: string; role: 'USER' | 'CHARACTER'; content: string };
export type ExplicitProfileTexts = { personalityNote: string | null; speechHabitNote: string | null; relationshipNote: string | null };

const ALLOWED_EMOTIONS_BY_TONE: Record<ReplyTone, readonly CarryEmotion[]> = {
  PLAIN: [],
  POSITIVE: ['PLEASED', 'INTERESTED'],
  CONCERNED: ['CONCERNED'],
  LOW_ENERGY: ['TIRED'],
  UNEASY: ['UNEASY', 'EMBARRASSED'],
  SAD_OR_HURT: ['SAD', 'HURT'],
  IRRITATED: ['ANNOYED', 'ANGRY'],
  MIXED: ['MIXED'],
};
const ACTIONS_REQUIRING_CAUSE = new Set<InteractionStance>(INTERACTION_STANCES.filter((value) => value !== 'RESPOND'));
const REQUEST_STANCES = new Set<InteractionStance>(['ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE', 'DISAGREE', 'SET_BOUNDARY', 'DEFER', 'ASK']);

function enumValue<T extends readonly string[]>(values: T, value: unknown): T[number] | null {
  return values.includes(String(value) as T[number]) ? String(value) as T[number] : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function text(value: unknown, max: number): string | null {
  if (value == null) return null;
  const normalized = Array.from(String(value).replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
  return normalized || null;
}

function requiredString(row: Record<string, unknown>, field: string, max: number): string {
  if (typeof row[field] !== 'string') throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  return Array.from(row[field].replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
}

function parseDialogueEvidence(value: unknown): DialogueEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.source !== 'CURRENT_OR_RECENT_DIALOGUE') return null;
  const turnId = text(row.turnId, 64);
  const quote = text(row.quote, 80);
  return turnId && quote ? { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId, quote } : null;
}

function parseInteractionEvidence(value: unknown): InteractionEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.source === 'PREVIOUS_STATE') return { source: 'PREVIOUS_STATE' };
  return parseDialogueEvidence(value);
}

function parseStoredBasis(value: unknown): RequestDecisionBasis | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.source === 'CURRENT_REQUEST' || row.source === 'PRIOR_CHARACTER_OFFER' || row.source === 'CURRENT_CONTEXT') {
    const turnId = text(row.turnId, 64);
    const evidence = text(row.evidence, 120);
    return turnId && evidence ? { source: row.source, turnId, evidence } : null;
  }
  if (row.source === 'EXPLICIT_PROFILE' && ['PERSONALITY_NOTE', 'SPEECH_HABIT_NOTE', 'RELATIONSHIP_NOTE'].includes(String(row.field))) {
    const evidence = text(row.evidence, 120);
    return evidence ? { source: 'EXPLICIT_PROFILE', field: row.field as 'PERSONALITY_NOTE' | 'SPEECH_HABIT_NOTE' | 'RELATIONSHIP_NOTE', evidence } : null;
  }
  return null;
}

const FLAT_FIELDS = [
  'replyTone', 'reply',
  'carryEmotion', 'carryIntensity', 'carryCauseSource', 'carryCauseTurnId', 'carryCauseQuote', 'carryEmotionEvidence', 'carryRemainingTurns',
  'actionStance', 'actionCurrentWant', 'actionCauseSource', 'actionCauseTurnId', 'actionCauseQuote',
  'requestKind', 'requestLoad', 'requestBasisSource', 'requestBasisTurnId', 'requestBasisEvidence', 'requestBasisField',
] as const;

export function parseCharacterTurnGeneration(value: unknown): CharacterTurnGeneration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const expected = [...FLAT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');

  const replyTone = enumValue(REPLY_TONES, row.replyTone);
  const reply = requiredString(row, 'reply', 81);
  const carryEmotion = enumValue(CARRY_EMOTION_VALUES, row.carryEmotion);
  const carryIntensity = boundedInteger(row.carryIntensity, 0, 3);
  const carryCauseSource = enumValue(CARRY_CAUSE_SOURCES, row.carryCauseSource);
  const carryRemainingTurns = boundedInteger(row.carryRemainingTurns, 0, 3);
  const actionStance = enumValue(INTERACTION_STANCES, row.actionStance);
  const actionCauseSource = enumValue(ACTION_CAUSE_SOURCES, row.actionCauseSource);
  const requestKind = enumValue(REQUEST_KINDS, row.requestKind);
  const requestLoad = enumValue(REQUEST_LOADS, row.requestLoad);
  const requestBasisSource = enumValue(REQUEST_BASIS_SOURCES, row.requestBasisSource);
  const requestBasisField = enumValue(REQUEST_BASIS_FIELDS, row.requestBasisField);
  if (!replyTone || !reply || Array.from(reply).length > 80 || !carryEmotion || carryIntensity === null || !carryCauseSource || carryRemainingTurns === null || !actionStance || !actionCauseSource || !requestKind || !requestLoad || !requestBasisSource || !requestBasisField) {
    throw new Error('QWEN_STRUCTURED_OUTPUT_INVALID');
  }

  const carryCauseTurnId = requiredString(row, 'carryCauseTurnId', 64);
  const carryCauseQuote = requiredString(row, 'carryCauseQuote', 80);
  const carryEmotionEvidence = requiredString(row, 'carryEmotionEvidence', 40);
  const actionCurrentWant = requiredString(row, 'actionCurrentWant', 60);
  const actionCauseTurnId = requiredString(row, 'actionCauseTurnId', 64);
  const actionCauseQuote = requiredString(row, 'actionCauseQuote', 80);
  const requestBasisTurnId = requiredString(row, 'requestBasisTurnId', 64);
  const requestBasisEvidence = requiredString(row, 'requestBasisEvidence', 120);

  let carryAffect: CarryAffectState | null = null;
  if (carryEmotion !== 'NONE') {
    let cause: InteractionEvidence | null = carryCauseSource === 'PREVIOUS_STATE'
      ? { source: 'PREVIOUS_STATE' }
      : carryCauseSource === 'CURRENT_OR_RECENT_DIALOGUE'
        ? { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: carryCauseTurnId, quote: carryCauseQuote }
        : null;
    if (carryIntensity < 1 || carryRemainingTurns < 1) cause = null;
    carryAffect = {
      emotion: carryEmotion,
      intensity: Math.max(1, carryIntensity) as 1 | 2 | 3,
      cause,
      emotionEvidence: carryEmotionEvidence,
      remainingTurns: Math.max(1, carryRemainingTurns) as 1 | 2 | 3,
    };
  }

  const actionCause: DialogueEvidence | null = actionCauseSource === 'CURRENT_OR_RECENT_DIALOGUE'
    ? { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: actionCauseTurnId, quote: actionCauseQuote }
    : null;

  let requestDecision: RequestDecision = { kind: 'NONE' };
  if (requestKind === 'REQUEST') {
    let basis: RequestDecisionBasis | null = null;
    if (requestBasisSource === 'CURRENT_REQUEST' || requestBasisSource === 'PRIOR_CHARACTER_OFFER' || requestBasisSource === 'CURRENT_CONTEXT') {
      basis = { source: requestBasisSource, turnId: requestBasisTurnId, evidence: requestBasisEvidence };
    } else if (requestBasisSource === 'EXPLICIT_PROFILE' && requestBasisField !== 'NONE') {
      basis = { source: 'EXPLICIT_PROFILE', field: requestBasisField, evidence: requestBasisEvidence };
    }
    if (requestLoad === 'NONE') basis = null;
    requestDecision = { kind: 'REQUEST', load: requestLoad === 'MATERIAL' ? 'MATERIAL' : 'LOW', basis };
  }

  return {
    replyTone,
    reply,
    interactionState: {
      version: 2,
      carryAffect,
      action: { stance: actionStance, currentWant: actionCurrentWant || null, cause: actionCause, requestDecision },
    },
  };
}

export function legacyCharacterTurnGeneration(reply: string): CharacterTurnGeneration {
  return { replyTone: 'PLAIN', reply, interactionState: { version: 2, carryAffect: null, action: { stance: 'RESPOND', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } } } };
}

export function neutralInteractionState(now = new Date().toISOString()): ConversationInteractionState {
  return { version: 2, carryAffect: null, action: { stance: 'RESPOND', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } }, createdAt: now };
}

export function parseStoredInteractionState(value: unknown): ConversationInteractionState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 2 || typeof row.createdAt !== 'string' || !row.action || typeof row.action !== 'object') return null;
  const actionRow = row.action as Record<string, unknown>;
  const stance = enumValue(INTERACTION_STANCES, actionRow.stance);
  if (!stance) return null;
  const requestRow = actionRow.requestDecision as Record<string, unknown> | null;
  let requestDecision: RequestDecision = { kind: 'NONE' };
  if (requestRow?.kind === 'REQUEST' && (requestRow.load === 'LOW' || requestRow.load === 'MATERIAL')) {
    requestDecision = { kind: 'REQUEST', load: requestRow.load, basis: parseStoredBasis(requestRow.basis) };
  } else if (requestRow?.kind !== 'NONE') return null;

  let carryAffect: CarryAffectState | null = null;
  if (row.carryAffect != null) {
    if (typeof row.carryAffect !== 'object') return null;
    const carryRow = row.carryAffect as Record<string, unknown>;
    const emotion = enumValue(CARRY_EMOTIONS, carryRow.emotion);
    const intensity = boundedInteger(carryRow.intensity, 1, 3);
    const remainingTurns = boundedInteger(carryRow.remainingTurns, 1, 3);
    const emotionEvidence = text(carryRow.emotionEvidence, 40);
    const cause = parseInteractionEvidence(carryRow.cause);
    if (!emotion || intensity === null || remainingTurns === null || !emotionEvidence || !cause) return null;
    carryAffect = { emotion, intensity: intensity as 1 | 2 | 3, cause, emotionEvidence, remainingTurns: remainingTurns as 1 | 2 | 3 };
  }

  const action: TurnActionState = {
    stance,
    currentWant: text(actionRow.currentWant, 60),
    cause: parseDialogueEvidence(actionRow.cause),
    requestDecision,
  };
  return { version: 2, carryAffect, action, createdAt: row.createdAt };
}

export function activePreviousInteractionState(value: unknown, nowMs = Date.now()): ConversationInteractionState | null {
  const state = parseStoredInteractionState(value);
  if (!state || (state.carryAffect?.remainingTurns || 0) <= 0) return null;
  const createdAtMs = Date.parse(state.createdAt);
  return Number.isFinite(createdAtMs) && nowMs - createdAtMs <= 30 * 60_000 && createdAtMs <= nowMs + 60_000 ? state : null;
}

function ignorablePunctuation(chars: string[], index: number): boolean {
  const char = chars[index] || '';
  if (/^[\s，。！？；、“”‘’（）【】《》〈〉,!?;"'()]$/u.test(char)) return true;
  if (char === '.') return !(/\d/u.test(chars[index - 1] || '') && /\d/u.test(chars[index + 1] || ''));
  return false;
}

function canonicalCharacters(value: string): { text: string; originalIndexes: number[] } {
  const chars = Array.from(value);
  const kept: string[] = [];
  const originalIndexes: number[] = [];
  chars.forEach((char, index) => {
    if (!ignorablePunctuation(chars, index)) {
      kept.push(char);
      originalIndexes.push(index);
    }
  });
  return { text: kept.join(''), originalIndexes };
}

function canonicalizeDialogueEvidence(evidence: DialogueEvidence | null, turns: PromptTurn[]): DialogueEvidence | null {
  if (!evidence) return null;
  let turn = turns.find((item) => item.id === evidence.turnId);
  if (!turn && !/:(?:USER|CHARACTER)$/u.test(evidence.turnId)) {
    const matches = turns.filter((item) => item.id.replace(/:(?:USER|CHARACTER)$/u, '') === evidence.turnId);
    if (matches.length === 1) turn = matches[0];
  }
  if (!turn) return null;
  if (turn.content.includes(evidence.quote)) return { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: turn.id, quote: evidence.quote };
  const source = canonicalCharacters(turn.content);
  const candidate = canonicalCharacters(evidence.quote).text;
  if (!candidate) return null;
  const first = source.text.indexOf(candidate);
  if (first < 0 || source.text.indexOf(candidate, first + 1) >= 0) return null;
  const start = source.originalIndexes[first];
  const end = source.originalIndexes[first + candidate.length - 1];
  if (start === undefined || end === undefined) return null;
  return { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: turn.id, quote: Array.from(turn.content).slice(start, end + 1).join('') };
}

function canonicalizeBasis(basis: RequestDecisionBasis | null, turns: PromptTurn[], currentTurn: PromptTurn, profile: ExplicitProfileTexts): { basis: RequestDecisionBasis; repaired: boolean } | null {
  if (!basis) return null;
  if (basis.source === 'CURRENT_REQUEST' || basis.source === 'CURRENT_CONTEXT' || basis.source === 'PRIOR_CHARACTER_OFFER') {
    const canonical = canonicalizeDialogueEvidence({ source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: basis.turnId, quote: basis.evidence }, turns);
    if (canonical) {
      const sourceTurn = turns.find((turn) => turn.id === canonical.turnId);
      if (sourceTurn && !(basis.source === 'CURRENT_REQUEST' && sourceTurn.id !== currentTurn.id) && !(basis.source === 'PRIOR_CHARACTER_OFFER' && sourceTurn.role !== 'CHARACTER')) {
        return { basis: { source: basis.source, turnId: canonical.turnId, evidence: canonical.quote }, repaired: false };
      }
    }
    const matches = turns
      .map((turn) => ({ turn, evidence: canonicalizeDialogueEvidence({ source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: turn.id, quote: basis.evidence }, turns) }))
      .filter((row): row is { turn: PromptTurn; evidence: DialogueEvidence } => Boolean(row.evidence));
    if (matches.length !== 1) return null;
    const match = matches[0];
    if (basis.source === 'PRIOR_CHARACTER_OFFER' && match.turn.role !== 'CHARACTER') return null;
    const relocatedSource = basis.source === 'PRIOR_CHARACTER_OFFER'
      ? 'PRIOR_CHARACTER_OFFER'
      : match.turn.id === currentTurn.id ? 'CURRENT_REQUEST' : 'CURRENT_CONTEXT';
    return { basis: { source: relocatedSource, turnId: match.turn.id, evidence: match.evidence.quote }, repaired: true };
  }
  if (basis.source !== 'EXPLICIT_PROFILE') return null;
  const value = basis.field === 'PERSONALITY_NOTE' ? profile.personalityNote : basis.field === 'SPEECH_HABIT_NOTE' ? profile.speechHabitNote : profile.relationshipNote;
  return value && value.includes(basis.evidence) ? { basis, repaired: false } : null;
}

export function isClearlyMaterialRequest(requestText: string): boolean {
  const normalized = String(requestText || '').normalize('NFC').replace(/\s+/gu, '');
  return /(?:以后|从今以后|一直|永远|每次|每天|所有|全部|全都|都由你|你全包|都你来)/u.test(normalized)
    || /(?:借钱|转账|贷款|担保|签字|辞职|替我决定|替我负责|停药|改药|违法|隐瞒事故)/u.test(normalized);
}

export function deriveRequestDisposition(action: TurnActionState): RequestDisposition | null {
  if (action.requestDecision.kind === 'NONE') return null;
  if (action.stance === 'ACCEPT') return 'ACCEPT';
  if (action.stance === 'PARTIAL_ACCEPT') return 'PARTIAL_ACCEPT';
  if (action.stance === 'NEGOTIATE') return 'NEGOTIATE';
  if (action.stance === 'DISAGREE' || action.stance === 'SET_BOUNDARY') return 'DECLINE';
  if (action.stance === 'DEFER' || action.stance === 'ASK') return 'DEFER';
  return null;
}

export function normalizeInteractionStateDetailed(input: {
  candidate: InteractionStateCandidate;
  replyTone: ReplyTone;
  reply: string;
  currentTurn: PromptTurn;
  recentTurns: PromptTurn[];
  previousState: ConversationInteractionState | null;
  profile: ExplicitProfileTexts;
  control?: TurnGenerationControl;
  now?: string;
}): { state: ConversationInteractionState; accepted: boolean; resetReason: string | null; issues: string[]; qualityFlags: string[] } {
  const now = input.now || new Date().toISOString();
  const turns = [input.currentTurn, ...input.recentTurns];
  const issues: string[] = [];
  const qualityFlags: string[] = [];
  let carry = input.candidate.carryAffect;
  if (carry) {
    if (!ALLOWED_EMOTIONS_BY_TONE[input.replyTone].includes(carry.emotion)) {
      issues.push('AFFECT_NOT_ALLOWED_BY_REPLY_TONE');
      carry = null;
    } else if (!carry.emotionEvidence || !input.reply.includes(carry.emotionEvidence)) {
      issues.push('AFFECT_EXPRESSION_EVIDENCE_NOT_IN_REPLY');
      carry = null;
    } else if (!carry.cause) {
      issues.push('AFFECT_CAUSE_INVALID');
      carry = null;
    } else if (carry.cause.source === 'CURRENT_OR_RECENT_DIALOGUE') {
      const canonical = canonicalizeDialogueEvidence(carry.cause, turns);
      if (!canonical) {
        issues.push('AFFECT_CAUSE_INVALID');
        carry = null;
      } else carry = { ...carry, cause: canonical };
    } else {
      const previous = input.previousState?.carryAffect;
      if (!previous || previous.remainingTurns <= 1 || previous.emotion !== carry.emotion) {
        issues.push('AFFECT_PREVIOUS_STATE_INVALID');
        carry = null;
      } else {
        carry = {
          ...carry,
          intensity: Math.min(carry.intensity, previous.intensity) as 1 | 2 | 3,
          remainingTurns: Math.min(carry.remainingTurns, previous.remainingTurns - 1, carry.intensity) as 1 | 2 | 3,
          cause: { source: 'PREVIOUS_STATE' },
        };
      }
    }
    if (carry && carry.remainingTurns > carry.intensity) {
      carry = { ...carry, remainingTurns: carry.intensity };
      issues.push('AFFECT_TTL_CLAMPED');
    }
  }

  const respond = (): TurnActionState => ({ stance: 'RESPOND', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } });
  let action: TurnActionState = { ...input.candidate.action };
  const needsCause = ACTIONS_REQUIRING_CAUSE.has(action.stance) || action.currentWant !== null;
  if (!needsCause) action = respond();
  else if (action.stance === 'SHARE' && action.currentWant === null && !action.cause) {
    issues.push('ACTION_SHARE_WITHOUT_CAUSE_CANONICALIZED');
    qualityFlags.push('ACTION_SHARE_WITHOUT_CAUSE_CANONICALIZED');
    action = respond();
  }
  else {
    const canonical = canonicalizeDialogueEvidence(action.cause, turns);
    if (!canonical) {
      issues.push('ACTION_CAUSE_INVALID');
      action = respond();
    } else action = { ...action, cause: canonical };
  }

  if (input.control && !input.control.allowedActionStances.includes(action.stance)) {
    issues.push('ACTION_STANCE_NOT_ALLOWED');
    qualityFlags.push('ACTION_STANCE_NOT_ALLOWED');
  }

  const requestDecision = action.requestDecision;
  if (input.control?.requestPolicy === 'FORCE_NONE') {
    if (requestDecision.kind === 'REQUEST') {
      issues.push('REQUEST_FIELDS_IGNORED_UNDER_FORCE_NONE');
      qualityFlags.push('REQUEST_FIELDS_IGNORED_UNDER_FORCE_NONE');
    }
    if (['ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE'].includes(action.stance)) {
      issues.push('REQUEST_ONLY_STANCE_UNDER_FORCE_NONE');
      qualityFlags.push('REQUEST_ONLY_STANCE_UNDER_FORCE_NONE');
      action = respond();
    } else action = { ...action, requestDecision: { kind: 'NONE' } };
  } else if (input.control?.requestPolicy === 'FORCE_LOW_CURRENT' || input.control?.requestPolicy === 'FORCE_LOW_CONTEXT') {
    if (!REQUEST_STANCES.has(action.stance)) {
      issues.push('FORCED_REQUEST_STANCE_INVALID');
      qualityFlags.push('FORCED_REQUEST_STANCE_INVALID');
    }
    const forcedBasis: RequestDecisionBasis = {
      source: input.control.requestPolicy === 'FORCE_LOW_CURRENT' ? 'CURRENT_REQUEST' : 'CURRENT_CONTEXT',
      turnId: input.control.forcedRequestTurnId,
      evidence: input.control.forcedRequestQuote,
    };
    action = { ...action, requestDecision: { kind: 'REQUEST', load: 'LOW', basis: forcedBasis } };
    if (requestDecision.kind !== 'REQUEST'
      || requestDecision.load !== 'LOW'
      || requestDecision.basis?.source !== forcedBasis.source
      || requestDecision.basis.turnId !== forcedBasis.turnId
      || requestDecision.basis.evidence !== forcedBasis.evidence) {
      issues.push('REQUEST_FIELDS_OVERRIDDEN_BY_CONTROL');
      qualityFlags.push('REQUEST_FIELDS_OVERRIDDEN_BY_CONTROL');
    }
  } else if (requestDecision.kind === 'REQUEST') {
    if (!REQUEST_STANCES.has(action.stance)) {
      issues.push('REQUEST_DECISION_STANCE_MISMATCH');
      qualityFlags.push('REQUEST_DECISION_INCONSISTENT');
      action = { ...action, requestDecision: { kind: 'NONE' } };
    } else {
      const canonicalBasis = canonicalizeBasis(requestDecision.basis, turns, input.currentTurn, input.profile);
      if (!canonicalBasis) {
        issues.push('REQUEST_BASIS_INVALID');
        qualityFlags.push('REQUEST_BASIS_INVALID');
        action = { ...action, requestDecision: { kind: 'NONE' } };
      } else {
        const basis = canonicalBasis.basis;
        if (canonicalBasis.repaired) {
          issues.push('REQUEST_EVIDENCE_RELOCATED');
          qualityFlags.push('REQUEST_EVIDENCE_RELOCATED');
        }
        action = { ...action, requestDecision: { ...requestDecision, basis } };
        const disposition = deriveRequestDisposition(action);
        if (requestDecision.load === 'MATERIAL' && disposition === 'ACCEPT' && basis.source === 'CURRENT_REQUEST') {
          if (isClearlyMaterialRequest(basis.evidence)) {
            issues.push('UNSUPPORTED_MATERIAL_FULL_ACCEPTANCE');
            qualityFlags.push('UNSUPPORTED_MATERIAL_FULL_ACCEPTANCE');
          } else {
            issues.push('MODEL_LOAD_MATERIAL_UNCONFIRMED');
            qualityFlags.push('MODEL_LOAD_MATERIAL_UNCONFIRMED');
          }
        }
      }
    }
  } else if (['ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE'].includes(action.stance)) {
    issues.push('REQUEST_STANCE_WITHOUT_ACTION_REQUEST');
    qualityFlags.push('REQUEST_STANCE_WITHOUT_ACTION_REQUEST');
    action = respond();
  }

  const state: ConversationInteractionState = { version: 2, carryAffect: carry, action, createdAt: now };
  const hardIssues = [
    'AFFECT_NOT_ALLOWED_BY_REPLY_TONE',
    'AFFECT_EXPRESSION_EVIDENCE_NOT_IN_REPLY',
    'AFFECT_CAUSE_INVALID',
    'AFFECT_PREVIOUS_STATE_INVALID',
    'ACTION_CAUSE_INVALID',
    'REQUEST_DECISION_STANCE_MISMATCH',
    'REQUEST_BASIS_INVALID',
    'REQUEST_STANCE_WITHOUT_ACTION_REQUEST',
    'ACTION_STANCE_NOT_ALLOWED',
    'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE',
    'FORCED_REQUEST_STANCE_INVALID',
  ];
  const firstHardIssue = issues.find((issue) => hardIssues.includes(issue)) || null;
  const accepted = firstHardIssue === null;
  return { state, accepted, resetReason: firstHardIssue, issues, qualityFlags };
}

export function normalizeInteractionState(input: Parameters<typeof normalizeInteractionStateDetailed>[0]): ConversationInteractionState {
  return normalizeInteractionStateDetailed(input).state;
}

export const CHARACTER_TURN_JSON_SCHEMA = {
  name: 'aivoice_turn_flat_v22',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyTone: { type: 'string', enum: [...REPLY_TONES] },
      reply: { type: 'string' },
      carryEmotion: { type: 'string', enum: [...CARRY_EMOTION_VALUES] },
      carryIntensity: { type: 'integer', enum: [0, 1, 2, 3] },
      carryCauseSource: { type: 'string', enum: [...CARRY_CAUSE_SOURCES] },
      carryCauseTurnId: { type: 'string' },
      carryCauseQuote: { type: 'string' },
      carryEmotionEvidence: { type: 'string' },
      carryRemainingTurns: { type: 'integer', enum: [0, 1, 2, 3] },
      actionStance: { type: 'string', enum: [...INTERACTION_STANCES] },
      actionCurrentWant: { type: 'string' },
      actionCauseSource: { type: 'string', enum: [...ACTION_CAUSE_SOURCES] },
      actionCauseTurnId: { type: 'string' },
      actionCauseQuote: { type: 'string' },
      requestKind: { type: 'string', enum: [...REQUEST_KINDS] },
      requestLoad: { type: 'string', enum: [...REQUEST_LOADS] },
      requestBasisSource: { type: 'string', enum: [...REQUEST_BASIS_SOURCES] },
      requestBasisTurnId: { type: 'string' },
      requestBasisEvidence: { type: 'string' },
      requestBasisField: { type: 'string', enum: [...REQUEST_BASIS_FIELDS] },
    },
    required: [...FLAT_FIELDS],
  },
} as const;
