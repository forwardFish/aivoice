import { INTERACTION_STANCES, type InteractionStance, type TurnActionState } from './interaction-state.js';

export type ConversationBoundary = 'NONE' | 'NO_MORE_QUESTIONS' | 'NO_DECISION_FOR_ME' | 'NO_LECTURE' | 'NO_COACHING';
export type QuestionPolicy = 'FORBIDDEN' | 'AT_MOST_ONE';
export type RequestPolicy = 'FORCE_NONE' | 'FORCE_LOW_CURRENT' | 'FORCE_LOW_CONTEXT' | 'AUTO';

export type PendingPlanRequest = {
  turnId: string;
  quote: string;
};

export type TurnGenerationControl = {
  questionPolicy: QuestionPolicy;
  allowedActionStances: InteractionStance[];
  requestPolicy: RequestPolicy;
  forcedRequestTurnId: string;
  forcedRequestQuote: string;
};

export type RuntimeDialogueControl = TurnGenerationControl & {
  recentActionStances: InteractionStance[];
  askCountInLastFour: number;
  askCooldown: boolean;
  conversationBoundary: ConversationBoundary;
  noMoreQuestionsActive: boolean;
  noCoachingActive: boolean;
};

const QUESTION_INVITATION = /(?:你问吧|可以问|你可以问|有什么想问|你想问什么|还有什么要问)/u;
const COACHING_REJECTION = /(?:别|不要|不用|少)(?:再|又)?(?:跟我说|给我|教我|讲)?[^，。！？]{0,10}(?:套话|建议|列提纲|提纲|深呼吸|方法|步骤|教我怎么做|怎么做)/u;
const REASK_DIRECTIVE = /(?:你|那你)(?:先)?(?:说说|讲讲|告诉我)|说说原因|讲讲原因|到底怎么回事/u;
const COMPOUND_QUESTION_INTENT_PATTERNS = [
  /(?:怎么|为什么|哪里|哪儿|什么时候|几点|多少)[^。！？?]{0,30}(?:是不是|有没有|要不要|能不能|会不会)/u,
  /(?:怎么|为什么|哪里|哪儿|什么时候|几点|多少|什么|时间|地址|多不多|几个人|哪一步)[^。！？?]{0,30}(?:怎么|为什么|哪里|哪儿|什么时候|几点|多少|什么|时间|地址|多不多|几个人|哪一步)/u,
  /(?:怎么|为什么|哪里|哪儿|什么时候|几点|多少)[^。！？?]{0,30}[？?][^。！？?]{0,30}还是[^。！？?]{1,30}/u,
] as const;
const FORBIDDEN_QUESTION_LIKE_PATTERNS = [
  /(?:是[^，。！？]{0,20}还是[^，。！？]{0,20})/u,
  /(?:你|那你)(?:先)?(?:说说|讲讲|告诉我)/u,
  /(?:你选|选一个|挑一个)/u,
  /(?:到底怎么回事|到底为什么)/u,
  /(?:要不要|能不能|可不可以|行不行)/u,
  /(?:在家还是|去[^，。！？]{0,20}还是去)/u,
] as const;

const EXPLICIT_PLAN_CHANGE_PATTERNS = [
  /我(?:明天|今天|今晚|周末|这次)?[^，。！？]{0,8}不想去(?:了)?/u,
  /我(?:明天|今天|今晚|周末|这次)?[^，。！？]{0,8}不去了/u,
  /我不参加(?:了)?/u,
  /这次我不去(?:了)?/u,
  /我想取消/u,
  /我想改(?:时间|到[^，。！？]+)/u,
  /反正我不去/u,
] as const;

const EXPLICIT_LOW_ACTION_REQUEST_PATTERNS = [
  /手机给我/u,
  /把[^，。！？]{1,16}给我/u,
  /帮我[^，。！？]{1,20}/u,
  /(?:抱我?一下|抱一下)/u,
  /先别(?:看|玩|弄|做)[^，。！？]{0,12}/u,
  /先把[^，。！？]{1,16}(?:放下|收起来|关掉)/u,
  /别(?:一口气|一直|再)?(?:念|唠叨)[^，。！？]{0,8}/u,
  /别(?:一上来就)?发火/u,
  /(?:厨房|客厅|卫生间|家务)[^，。！？]{0,10}(?:你收|你来收|你做|你来做|你处理)/u,
] as const;

const EXPLICIT_CONTINUATION_PATTERNS = [
  /(?:反正|我还是)?我?不去/u,
  /我不想见(?:他|她|他们|她们)/u,
  /我就是不想见那个人/u,
  /我还是不参加/u,
  /还是取消吧/u,
  /还是改到[^，。！？]+/u,
] as const;

const REPAIR_OR_EXPLANATION_PATTERNS = [
  /不是故意/u,
  /我只是怕/u,
  /只是怕/u,
  /对不起/u,
  /刚才.{0,8}(?:语气|态度).{0,8}不好/u,
  /不是那个意思/u,
  /我没有那个意思/u,
  /我只是想/u,
] as const;

const EXPLICIT_ACTION_OUTCOME_PATTERNS = [
  /我不去/u,
  /我不参加/u,
  /我想取消/u,
  /我想改时间/u,
  /你来(?:做|收拾|处理)/u,
  /帮我/u,
] as const;

const OPINION_OR_RELATION_QUESTION = /(?:你觉得|你怎么看|你怎么想|你是不是觉得|你认为|你对.{0,12}怎么看|你会不会.{0,12}逼我)/u;
const STATE_DISCLOSURE_WITHOUT_REQUEST = /(?:我(?:今天|现在)?[^，。！？]{0,10}(?:累死了|很累|太累|累坏了|很压抑|心情不好)|什么都不想动)/u;
const USER_OFFER_OR_SELF_PLAN_WITHOUT_REQUEST = /(?:我(?:现在|马上)?[^，。！？]{0,12}(?:出发|给你带|去买|顺路带)|我来(?:做|拿|带|处理))/u;
const REQUEST_ONLY_STANCES = new Set<InteractionStance>(['ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE']);
const REQUEST_STANCES = new Set<InteractionStance>(['ASK', 'ACCEPT', 'PARTIAL_ACCEPT', 'NEGOTIATE', 'DISAGREE', 'SET_BOUNDARY', 'DEFER']);

function normalized(value: string): string {
  return String(value || '').normalize('NFC').replace(/\s+/gu, '');
}

function firstMatch(text: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return null;
}

export function detectConversationBoundary(text: string): ConversationBoundary {
  const value = normalized(text);
  if (/(?:别|不要|先别|别再|别老|别一直)(?:再)?(?:问我|追问我|问了|问那么多|问这个|问这件事|问)/u.test(value)) return 'NO_MORE_QUESTIONS';
  if (/(?:别|不要|不用)(?:替我|帮我)(?:决定|做决定|拿主意)/u.test(value)) return 'NO_DECISION_FOR_ME';
  if (COACHING_REJECTION.test(value)) return 'NO_COACHING';
  if (/(?:别|不要|先别|别再)(?:说教|教育我|讲大道理)/u.test(value)) return 'NO_LECTURE';
  return 'NONE';
}

export function explicitLowPlanChangeQuote(text: string): string | null {
  return firstMatch(String(text || '').normalize('NFC'), EXPLICIT_PLAN_CHANGE_PATTERNS);
}

export function explicitLowActionRequestQuote(text: string): string | null {
  return firstMatch(String(text || '').normalize('NFC'), EXPLICIT_LOW_ACTION_REQUEST_PATTERNS);
}

export function explicitlyContinuesPlanOutcome(text: string): boolean {
  return EXPLICIT_CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalized(text)));
}

export function isRepairExplanationWithoutRequest(text: string): boolean {
  const value = normalized(text);
  const hasRepair = REPAIR_OR_EXPLANATION_PATTERNS.some((pattern) => pattern.test(value));
  const restatesAction = EXPLICIT_ACTION_OUTCOME_PATTERNS.some((pattern) => pattern.test(value));
  return hasRepair && !restatesAction;
}

function deriveRequestPolicy(input: {
  currentUserText: string;
  currentTurnId: string;
  pendingPlanRequest: PendingPlanRequest | null;
}): Pick<TurnGenerationControl, 'requestPolicy' | 'forcedRequestTurnId' | 'forcedRequestQuote'> {
  if (COACHING_REJECTION.test(normalized(input.currentUserText))) {
    return { requestPolicy: 'FORCE_NONE', forcedRequestTurnId: '', forcedRequestQuote: '' };
  }
  if (OPINION_OR_RELATION_QUESTION.test(normalized(input.currentUserText))) {
    return { requestPolicy: 'FORCE_NONE', forcedRequestTurnId: '', forcedRequestQuote: '' };
  }
  const currentPlanChange = explicitLowPlanChangeQuote(input.currentUserText);
  if (currentPlanChange) {
    return { requestPolicy: 'FORCE_LOW_CURRENT', forcedRequestTurnId: input.currentTurnId, forcedRequestQuote: currentPlanChange };
  }
  const currentActionRequest = explicitLowActionRequestQuote(input.currentUserText);
  if (currentActionRequest) {
    return { requestPolicy: 'FORCE_LOW_CURRENT', forcedRequestTurnId: input.currentTurnId, forcedRequestQuote: currentActionRequest };
  }
  if (STATE_DISCLOSURE_WITHOUT_REQUEST.test(normalized(input.currentUserText)) || USER_OFFER_OR_SELF_PLAN_WITHOUT_REQUEST.test(normalized(input.currentUserText))) {
    return { requestPolicy: 'FORCE_NONE', forcedRequestTurnId: '', forcedRequestQuote: '' };
  }
  if (isRepairExplanationWithoutRequest(input.currentUserText)) {
    return { requestPolicy: 'FORCE_NONE', forcedRequestTurnId: '', forcedRequestQuote: '' };
  }
  if (input.pendingPlanRequest && explicitlyContinuesPlanOutcome(input.currentUserText)) {
    return { requestPolicy: 'FORCE_LOW_CONTEXT', forcedRequestTurnId: input.pendingPlanRequest.turnId, forcedRequestQuote: input.pendingPlanRequest.quote };
  }
  return { requestPolicy: 'AUTO', forcedRequestTurnId: '', forcedRequestQuote: '' };
}

export function buildRuntimeDialogueControl(input: {
  recentActionStances: readonly InteractionStance[];
  currentUserText: string;
  currentTurnId: string;
  pendingPlanRequest?: PendingPlanRequest | null;
  previousUserRequestedNoMoreQuestions?: boolean;
  previousUserRequestedNoCoaching?: boolean;
}): RuntimeDialogueControl {
  const recent = input.recentActionStances.slice(-4);
  const askCountInLastFour = recent.filter((stance) => stance === 'ASK').length;
  const askCooldown = recent.at(-1) === 'ASK' || askCountInLastFour >= 2;
  const conversationBoundary = detectConversationBoundary(input.currentUserText);
  const explicitlyInvitesQuestion = conversationBoundary === 'NONE' && QUESTION_INVITATION.test(normalized(input.currentUserText));
  const noMoreQuestionsActive = conversationBoundary === 'NO_MORE_QUESTIONS'
    || (input.previousUserRequestedNoMoreQuestions === true && !explicitlyInvitesQuestion);
  const noCoachingActive = conversationBoundary === 'NO_COACHING'
    || (input.previousUserRequestedNoCoaching === true && !explicitlyInvitesQuestion);
  const questionPolicy: QuestionPolicy = !explicitlyInvitesQuestion && (askCooldown || noMoreQuestionsActive || noCoachingActive)
    ? 'FORBIDDEN'
    : 'AT_MOST_ONE';
  const request = deriveRequestPolicy({
    currentUserText: input.currentUserText,
    currentTurnId: input.currentTurnId,
    pendingPlanRequest: input.pendingPlanRequest || null,
  });

  let allowedActionStances = [...INTERACTION_STANCES];
  if (questionPolicy === 'FORBIDDEN') allowedActionStances = allowedActionStances.filter((stance) => stance !== 'ASK');
  if (request.requestPolicy === 'FORCE_NONE') {
    allowedActionStances = allowedActionStances.filter((stance) => !REQUEST_ONLY_STANCES.has(stance));
  } else if (request.requestPolicy === 'FORCE_LOW_CURRENT' || request.requestPolicy === 'FORCE_LOW_CONTEXT') {
    allowedActionStances = allowedActionStances.filter((stance) => REQUEST_STANCES.has(stance));
  }

  return {
    recentActionStances: recent,
    askCountInLastFour,
    askCooldown,
    conversationBoundary,
    noMoreQuestionsActive,
    noCoachingActive,
    questionPolicy,
    allowedActionStances,
    ...request,
  };
}

export function violatesStatementOnlyPolicy(reply: string): boolean {
  if (/[？?]/u.test(reply)) return true;
  return FORBIDDEN_QUESTION_LIKE_PATTERNS.some((pattern) => pattern.test(reply));
}

export function validateQuestionBehavior(reply: string, action: TurnActionState, control: RuntimeDialogueControl): string[] {
  const issues: string[] = [];
  const questionMarks = Array.from(reply).filter((character) => character === '？' || character === '?').length;
  if (questionMarks > 1) issues.push('MULTIPLE_QUESTIONS_IN_ONE_REPLY');
  if (COMPOUND_QUESTION_INTENT_PATTERNS.some((pattern) => pattern.test(reply))) issues.push('MULTIPLE_QUESTION_INTENTS');
  if (control.questionPolicy === 'FORBIDDEN' && (action.stance === 'ASK' || REASK_DIRECTIVE.test(reply) || violatesStatementOnlyPolicy(reply))) {
    issues.push(control.noMoreQuestionsActive ? 'EXPLICIT_QUESTION_BOUNDARY_VIOLATION' : 'ASK_COOLDOWN_VIOLATION');
  }
  if (control.askCountInLastFour >= 2 && action.stance === 'ASK') issues.push('ASK_BUDGET_EXCEEDED');
  return [...new Set(issues)];
}
