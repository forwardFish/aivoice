import { hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import { validateQuestionBehavior, type RuntimeDialogueControl } from './dialogue-control.js';
import {
  assessHumanLikenessSignals,
  detectSpeakerFactOwnershipViolation,
  hardReplyLeak,
  normalizeExplicitPreferenceSubject,
  sanitizeSelfUnsupportedPersonalHistory,
  sanitizeUnsupportedPresentSceneClaims,
} from './human-likeness.js';
import {
  buildInteractionStateCandidateFromMinimal,
  normalizeInteractionStateDetailed,
  type CharacterTurnGeneration,
  type ConversationInteractionState,
  type MinimalCharacterTurnGeneration,
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
  return playful && ['REPAIR', 'DECISION', 'AFFECTION'].includes(focus.phase) ? 0.72 : 0.55;
}

export function evaluateCharacterGenerationQuality(input: {
  generation: CharacterTurnGeneration | MinimalCharacterTurnGeneration;
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
  const preferenceSubject = normalizeExplicitPreferenceSubject({
    currentUserText: input.currentUserText,
    reply: input.generation.reply,
  });
  const selfHistorySanitization = sanitizeSelfUnsupportedPersonalHistory({
    relationshipType: input.relationshipType,
    reply: preferenceSubject.reply,
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
  let candidate;
  if ('outputFormat' in input.generation) {
    candidate = buildInteractionStateCandidateFromMinimal({
      generation: input.generation,
      currentTurn: input.currentTurn,
      control: input.control,
      previousState: input.previousState,
    });
  } else candidate = input.generation.interactionState;
  const normalized = normalizeInteractionStateDetailed({
    candidate,
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
  const personalityViolation = personalityTurnFocusReplyViolation(input.personalityTurnFocus, outputText, input.recentCharacterReplies);
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
    ...(preferenceSubject.changed ? ['EXPLICIT_PREFERENCE_SUBJECT_RESTORED'] : []),
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
  AUTHORITY_JUDGMENT: '上一版像上级评价对方认错。重写时不要再提“肯认、肯说、认错、知道”是否合格，也不要接“就行、就好、这次算了”；只表达人物自己的短暂余感，再自然推进一个当下回应。',
  UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED: '上一版把未确认的当前状态写成事实。用户说将会晚到不等于人物已经在等待；不得声称“我等的时候、让我干等、已经等累/等饿”，也不得补写疲劳、饥饿、寒冷、位置、现有安排、当前活动或损失。可以只表达对晚告知的不满，或用条件/未来语义说明可能影响。',
  PURE_ACKNOWLEDGEMENT: '上一版只有敷衍确认。重写时加入人物自己的具体反应或一个自然推进。',
  GENERIC_REPAIR_STAGE_PHRASE: '上一版直接用“翻篇、没事、不生气了”等词汇汇报修复阶段。保持人物已开始缓和，但要通过减少攻击、恢复普通交流、轻微调侃、小要求或具体选择表现变化，不要宣布阶段结束。',
  REPEATED_SAME_GRIEVANCE: '上一版重复了人物上一轮已经说过的同一项指责和边界。直接回应用户本轮新增的辩解或信息，保留立场但不要再次复述等待、晚告知或下次提醒；增加一个新的个人判断或当前选择。',
  REPEATED_EXPLICIT_CONFLICT_EMOTION: '上一版与上一轮连续使用同一个显式情绪词证明人物还在生气。情绪可以继续存在，但本轮必须回应用户新增的辩解、否认或压制动作；用新的个人判断、迟疑、让步或关系动作表现，不再重复同一个情绪名词。',
  TRIGGER_COMPLETE_COMMUNICATION_TEMPLATE: '上一版把快速不满整理成“复述事实＋命名情绪＋提出下次要求”的标准沟通模板。保留真实触发，但本轮只做一个主要关系动作，优先给出人物即时、口语化的直接反应；不要同时总结原因、感受和解决方案。',
  MODELISH_BOUNDARY_TEMPLATE: '上一版用了“时间有变、我这边不好安排、影响安排”等公文化边界模板。保持人物的边界和现实期待不变，改成24岁伴侣会自然说出的第一人称感受或需要，不声称已有具体安排受损。',
  AFFECTION_ECHO_ONLY: '上一版只是把用户的“到了先抱一下”换词复述。保持温和接受，但加入人物自己的简短参与、感受或当下动作，不需要变得热烈，也不要重新讲边界。',
  MULTIPLE_QUESTION_INTENTS: '上一版包含复合提问或连续追问。本轮用户没有要求人物采访原因；改用陈述句表达一个不满和一个现实期待，reply不出现问号，也不要用“为什么、怎么、难吗”变相追问。',
  QUICK_TRIGGER_QUESTION: '上一版把快速不满写成了反问。保留明确不满，但改为第一人称陈述和一个现实期待，不出现问号或“不能、难吗、为什么”等审问句式。',
  MULTIPLE_NEXT_STEPS: '上一版同时塞入两个安排。本轮只保留人物最想做的一件事，不能用“然后、再、接着”追加第二项活动。',
  PREMATURE_AFFECTION_REPAIR: '上一版在用户尚未邀请亲近时就主动把修复收束为拥抱或靠着。保持温柔和已经缓和，但先恢复普通交流或提出一个非身体亲近的现实下一步；把亲近留到用户真正邀请时再回应。',
  REPEATED_SAFE_ACTIVITY: '上一版又使用了最近一轮已经出现的吃饭、喝东西、散步、看电影或拥抱等安全收束。保持人物本轮意愿不变，但换成一个不同且符合已知事实的现实安排；不要再次使用最近一轮的同类活动，也不要同时塞入两个下一步。',
  BUNDLED_GENERIC_SAFE_CLOSURE: '上一版在安排轮同时打包了拥抱、吃饭或休息等多个通用安全收束。只保留人物此刻最想要的一个核心安排；不要用第二个安全动作补齐“和好流程”，也不要沿用未被用户或资料确认的计划。',
};

const SAFE_SANITIZED_FALLBACK_REASONS = new Set([
  'UNSUPPORTED_PRESENT_SCENE_CLAIM_REMOVED',
  'SELF_UNSUPPORTED_PERSONAL_HISTORY_REMOVED',
]);

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
    const sanitizedOutput = 'outputText' in result ? String((result as TResult & { outputText?: unknown }).outputText || '').trim() : '';
    if (sanitizedOutput && result.retryReasons.every((reason) => SAFE_SANITIZED_FALLBACK_REASONS.has(reason))) {
      return { ...result, attemptCount: attempt, firstAttemptReasons };
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
      content: `上一版仅因以下确定性质量问题不合格：${reasons.join('、')}。${guidance.join(' ')}人物身份、已知事实、当前阶段、主次性格、本轮立场和其他已合格内容保持不变；只修正列出的失败项，不增加新事实，不改写成另一种人物。只重新输出reply、replyTone、actionStance三个字段，不解释重试原因，不输出第二份JSON。`,
    },
    ...messages.slice(1),
  ];
}
