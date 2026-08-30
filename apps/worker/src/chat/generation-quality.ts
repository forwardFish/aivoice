import { hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import { validateQuestionBehavior, type RuntimeDialogueControl } from './dialogue-control.js';
import {
  assessHumanLikenessSignals,
  detectSpeakerFactOwnershipViolation,
  hardReplyLeak,
  sanitizeSelfUnsupportedPersonalHistory,
  sanitizeUnsupportedPresentSceneClaims,
} from './human-likeness.js';
import {
  normalizeInteractionStateDetailed,
  type CharacterTurnGeneration,
  type ConversationInteractionState,
  type PromptTurn,
} from './interaction-state.js';
import {
  personalityTurnFocusReplyViolation,
  resolvedBoundaryReplyViolation,
  type PersonalityTurnFocus,
} from './personality-turn-focus.js';
import { relationshipReplyViolation, type VoiceChatMessage, type VoiceRelationshipType } from './voice-chat-context.js';

const PRODUCTION_BLOCKING_STATE_ISSUES = new Set([
  'ACTION_STANCE_NOT_ALLOWED',
  'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE',
  'FORCED_REQUEST_STANCE_INVALID',
]);

const RETRYABLE_HUMAN_SIGNALS = new Set([
  'COUNSELOR_TEMPLATE',
  'PURE_ACKNOWLEDGEMENT',
  'EXACT_REPLY_REPEAT',
  'HIGH_REPLY_SIMILARITY',
  'REPEATED_OPENING_SEQUENCE',
  'GENERIC_PERFECT_SUPPORT',
]);

export type CharacterGenerationQuality = {
  outputText: string;
  replyTone: CharacterTurnGeneration['replyTone'];
  interactionState: ConversationInteractionState;
  interactionStateAccepted: boolean;
  interactionStateResetReason: string | null;
  interactionStateIssues: string[];
  qualitySignals: string[];
  retryReasons: string[];
};

export function chatTemperatureForFocus(focus: PersonalityTurnFocus | null): number {
  if (!focus) return 0.55;
  const playful = focus.primary.label === '爱开玩笑' || focus.secondary?.label === '爱开玩笑';
  return playful && ['REPAIR', 'DECISION', 'AFFECTION'].includes(focus.phase) ? 0.85 : 0.55;
}

export function evaluateCharacterGenerationQuality(input: {
  generation: CharacterTurnGeneration;
  currentUserText: string;
  relationshipType: VoiceRelationshipType | null;
  subjectBackground: string | null;
  recentUserInputs: readonly string[];
  recentCharacterReplies: readonly string[];
  currentTurn: PromptTurn;
  recentTurns: PromptTurn[];
  previousState: ConversationInteractionState | null;
  control: RuntimeDialogueControl;
  personalityTurnFocus: PersonalityTurnFocus | null;
  profile: { personalityNote: string | null; speechHabitNote: string | null; relationshipNote: string | null };
}): CharacterGenerationQuality {
  const selfHistorySanitization = sanitizeSelfUnsupportedPersonalHistory({
    relationshipType: input.relationshipType,
    reply: input.generation.reply,
    currentUserText: input.currentUserText,
    recentUserInputs: input.recentUserInputs,
    subjectBackground: input.subjectBackground,
  });
  const presentSceneSanitization = sanitizeUnsupportedPresentSceneClaims({
    reply: selfHistorySanitization.reply,
    currentUserText: input.currentUserText,
    recentUserInputs: input.recentUserInputs,
    recentCharacterReplies: input.recentCharacterReplies,
    subjectBackground: input.subjectBackground,
    allowPlayfulEmbellishment: Boolean(input.personalityTurnFocus
      && ['REPAIR', 'DECISION', 'AFFECTION'].includes(input.personalityTurnFocus.phase)
      && (input.personalityTurnFocus.primary.label === '爱开玩笑' || input.personalityTurnFocus.secondary?.label === '爱开玩笑')),
    allowLowRiskConversationalEmbellishment: input.relationshipType === 'PARTNER',
  });
  const outputText = presentSceneSanitization.reply;
  const normalized = normalizeInteractionStateDetailed({
    candidate: input.generation.interactionState,
    replyTone: input.generation.replyTone,
    reply: outputText,
    currentTurn: input.currentTurn,
    recentTurns: input.recentTurns,
    previousState: input.previousState,
    control: input.control,
    profile: input.profile,
  });
  const controlViolation = normalized.issues.find((issue) => PRODUCTION_BLOCKING_STATE_ISSUES.has(issue)) || null;
  const questionIssues = validateQuestionBehavior(outputText, normalized.state.action, input.control);
  const personalityViolation = personalityTurnFocusReplyViolation(input.personalityTurnFocus, outputText);
  const boundaryReopenViolation = resolvedBoundaryReplyViolation(input.personalityTurnFocus, [...input.recentTurns, input.currentTurn], outputText);
  const leakViolation = hardReplyLeak(outputText);
  const identityViolation = hasForbiddenAssistantIdentityDisclosure(outputText) ? 'IDENTITY_DISCLOSURE_BLOCKED' : null;
  const relationshipViolation = relationshipReplyViolation({ relationshipType: input.relationshipType, reply: outputText });
  const ownershipViolation = detectSpeakerFactOwnershipViolation({
    currentUserText: input.currentUserText,
    reply: outputText,
    subjectBackground: input.subjectBackground,
    recentCharacterReplies: input.recentCharacterReplies,
  }) ? 'SPEAKER_FACT_OWNERSHIP_VIOLATION' : null;
  const humanSignals = assessHumanLikenessSignals(outputText, [...input.recentCharacterReplies]);
  const qualitySignals = [
    ...humanSignals,
    ...normalized.qualityFlags,
    ...(selfHistorySanitization.removed ? ['SELF_UNSUPPORTED_PERSONAL_HISTORY_REMOVED'] : []),
    ...(presentSceneSanitization.removed ? ['UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED'] : []),
    ...(personalityViolation ? [personalityViolation] : []),
    ...(boundaryReopenViolation ? [boundaryReopenViolation] : []),
    ...questionIssues,
  ];
  const retryReasons = [
    controlViolation,
    ...questionIssues,
    personalityViolation,
    boundaryReopenViolation,
    leakViolation,
    identityViolation,
    relationshipViolation,
    ownershipViolation,
    selfHistorySanitization.removed ? 'SELF_UNSUPPORTED_PERSONAL_HISTORY_REMOVED' : null,
    presentSceneSanitization.removed ? 'UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED' : null,
    ...humanSignals.filter((signal) => RETRYABLE_HUMAN_SIGNALS.has(signal)),
  ].filter((value): value is string => Boolean(value));
  return {
    outputText,
    replyTone: input.generation.replyTone,
    interactionState: normalized.state,
    interactionStateAccepted: normalized.accepted,
    interactionStateResetReason: normalized.resetReason,
    interactionStateIssues: normalized.issues,
    qualitySignals: [...new Set(qualitySignals)],
    retryReasons: [...new Set(retryReasons)],
  };
}

export class GenerationQualityError extends Error {
  constructor(readonly reasons: string[]) {
    super('GENERATION_QUALITY_REJECTED');
  }
}

const QUALITY_RETRY_GUIDANCE: Record<string, string> = {
  AFFECTION_PASSIVE_PERMISSION: '上一版只是允许对方亲近。重写时必须让人物用第一人称表达自己的亲近意愿或主动动作，明确人物也想靠近；不能只说可以、行、好吧、随你或给对方许可。',
  RESOLVED_BOUNDARY_REOPENED: '上一版重新开启了已经解决的冲突。重写时只回应当前新互动，不再提旧边界、迟到、认错、翻篇或惩罚条件。',
  AUTHORITY_JUDGMENT: '上一版像上级评价对方认错。重写时平等接住解释或道歉，不评价态度是否合格。',
  UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED: '上一版把未确认的当前状态写成事实。重写时保留自然口语，但不要声称已经发生具体位置、安排、损失或高风险事实。',
  PURE_ACKNOWLEDGEMENT: '上一版只有敷衍确认。重写时加入人物自己的具体反应或一个自然推进。',
};

export async function withOneQualityRetry<TGeneration, TResult extends { retryReasons: string[] }>(input: {
  generate: (attempt: 1 | 2, previousReasons: string[]) => Promise<TGeneration>;
  evaluate: (generation: TGeneration) => TResult;
  onRetry?: (reasons: string[]) => void | Promise<void>;
}): Promise<TResult & { attemptCount: 1 | 2; firstAttemptReasons: string[] }> {
  let firstAttemptReasons: string[] = [];
  for (const attempt of [1, 2] as const) {
    const generation = await input.generate(attempt, firstAttemptReasons);
    const result = input.evaluate(generation);
    if (!result.retryReasons.length) return { ...result, attemptCount: attempt, firstAttemptReasons };
    if (attempt === 1) {
      firstAttemptReasons = result.retryReasons;
      await input.onRetry?.(firstAttemptReasons);
      continue;
    }
    throw new GenerationQualityError(result.retryReasons);
  }
  throw new GenerationQualityError(firstAttemptReasons);
}

export function qualityRetryMessages(messages: VoiceChatMessage[], reasons: string[]): VoiceChatMessage[] {
  const guidance = reasons.map((reason) => QUALITY_RETRY_GUIDANCE[reason]).filter(Boolean);
  return [
    messages[0],
    {
      role: 'system',
      content: `上一版被服务端确定性质量检查拒绝：${reasons.join('、')}。${guidance.join(' ')}重新独立生成，不复用上一版措辞；严格执行本轮reply_shape和forbidden，保持人物身份、事实边界与扁平V2.2 JSON字段，不解释重试原因。`,
    },
    ...messages.slice(1),
  ];
}
