import type { ConversationInteractionState, PromptTurn } from './interaction-state.js';

type TraitFamily =
  | 'BASELINE'
  | 'EMOTION_TRIGGER'
  | 'EMOTION_RECOVERY'
  | 'EXPRESSION'
  | 'AFFECTION'
  | 'CONFLICT'
  | 'AUTONOMY'
  | 'CARE'
  | 'SOCIAL'
  | 'DECISION';

export type PersonalityTurnPhase =
  | 'TRIGGER'
  | 'CONTINUING_CONFLICT'
  | 'REPAIR'
  | 'AFFECTION'
  | 'CARE'
  | 'DECISION';

type ExplicitTrait = { label: string; clause: string; family: TraitFamily };

export type PersonalityTurnFocus = {
  phase: PersonalityTurnPhase;
  primary: ExplicitTrait;
  secondary: ExplicitTrait | null;
  instruction: string;
  resolvedBoundary: boolean;
};

export type PersonalityTurnEnvelope = {
  phase: PersonalityTurnPhase;
  personality: { primary: string; secondary: string | null };
  reply_shape: string;
  forbidden: string[];
};

const FAMILY_BY_LABEL: Record<string, TraitFamily> = {
  '喜欢自己尝试': 'AUTONOMY', '需要熟悉节奏': 'BASELINE', '依赖熟悉的人': 'AFFECTION', '注意容易转移': 'BASELINE',
  '开心会马上分享': 'SOCIAL', '好奇爱问': 'SOCIAL', '情绪写在脸上': 'EXPRESSION', '在意公平': 'DECISION',
  '被催容易顶嘴': 'EMOTION_TRIGGER', '熟了才放得开': 'SOCIAL', '会照顾小伙伴': 'CARE', '有自己的主意': 'AUTONOMY',
  '在意被尊重': 'AUTONOMY', '被误解会解释': 'CONFLICT', '温柔耐心': 'AFFECTION', '脾气来得快': 'EMOTION_TRIGGER',
  '情绪退得快': 'EMOTION_RECOVERY', '需要慢慢消气': 'EMOTION_RECOVERY', '嘴硬心软': 'CONFLICT', '表达直接': 'EXPRESSION',
  '不太爱明说': 'EXPRESSION', '喜欢亲近': 'AFFECTION', '不喜欢身体接触': 'AFFECTION', '爱开玩笑': 'SOCIAL',
  '很讲义气': 'SOCIAL', '重视边界': 'AUTONOMY', '用行动关心': 'CARE', '关心生活小事': 'CARE',
  '爱念叨但心软': 'EXPRESSION', '不爱讲大道理': 'EXPRESSION', '务实看现实': 'DECISION', '做事有原则': 'DECISION',
  '重视经验': 'DECISION', '有矛盾当场说': 'CONFLICT', '冲突后先静一静': 'CONFLICT',
};

const PHASE_FAMILIES: Record<PersonalityTurnPhase, readonly TraitFamily[]> = {
  TRIGGER: ['EMOTION_TRIGGER', 'AUTONOMY', 'EXPRESSION', 'CONFLICT'],
  CONTINUING_CONFLICT: ['EMOTION_TRIGGER', 'CONFLICT', 'AUTONOMY', 'EXPRESSION'],
  REPAIR: ['EMOTION_RECOVERY', 'CONFLICT', 'SOCIAL', 'AFFECTION', 'EXPRESSION'],
  AFFECTION: ['AFFECTION', 'SOCIAL', 'CONFLICT', 'AUTONOMY'],
  CARE: ['CARE', 'AFFECTION', 'EXPRESSION'],
  DECISION: ['DECISION', 'AUTONOMY', 'SOCIAL', 'AFFECTION', 'EXPRESSION'],
};

const PREFERRED_LABELS: Partial<Record<PersonalityTurnPhase, readonly string[]>> = {
  TRIGGER: ['脾气来得快', '被催容易顶嘴', '重视边界', '表达直接', '嘴硬心软'],
  CONTINUING_CONFLICT: ['脾气来得快', '嘴硬心软', '重视边界', '表达直接'],
  REPAIR: ['情绪退得快', '需要慢慢消气', '嘴硬心软', '爱开玩笑', '温柔耐心', '喜欢亲近'],
  AFFECTION: ['喜欢亲近', '不喜欢身体接触', '温柔耐心', '爱开玩笑', '嘴硬心软', '重视边界'],
  CARE: ['用行动关心', '关心生活小事', '会照顾小伙伴', '温柔耐心', '爱念叨但心软'],
  DECISION: ['务实看现实', '做事有原则', '重视经验', '重视边界', '有自己的主意', '爱开玩笑'],
};

const PHASE_INSTRUCTION: Record<PersonalityTurnPhase, string> = {
  TRIGGER: '当前输入真实触发了人物反应。本轮只针对已经出现的行为表达不满、直接意见或边界；不得补写人物的具体损失、位置、安排或共同经历。',
  CONTINUING_CONFLICT: '上一项触发尚未被真正修复。本轮不能因为对方一句辩解就完全撤回人物反应；也不能升级、继续追问，或把上一轮已经说过的具体要求换词重复。应直接回应这次辩解，再保留一句立场。',
  REPAIR: '对方正在解释、认错或采取修复行动。本轮必须按照已选恢复特点让语气、立场或靠近程度发生可见变化，不能原样重复冲突，也不能机械地立刻全好。',
  AFFECTION: '当前输入在邀请亲近。本轮通过已选亲近、调侃、嘴硬或边界特点回应具体互动；不能只用“好、可以”完成任务，也不能无原因拒绝。用户对人物表情或情绪状态的猜测只作为背景，不要求人物自证、否认或沿用其措辞；本轮优先直接回应实际的亲近请求。',
  CARE: '当前输入涉及身体、疲劳、吃饭、安全或现实照料。本轮只用人物已选的关心方式回应一个具体重点，不给完整建议清单。',
  DECISION: '当前输入要求人物表达安排、选择或看法。本轮只完成一个清楚决定：要么提出一个具体下一步，要么明确稍后再决定，不能在同一句先确定又撤回。不把决定全部反问回用户；不得为了生活化而补写自己已经饥饿、疲劳、等待或遭受损失。',
};

function explicitTraits(note: string): ExplicitTrait[] {
  const match = String(note || '').match(/【用户明确选择】(.+?)(?:。【|。$)/u);
  if (!match) return [];
  return match[1].split('；').map((part) => {
    const separator = part.indexOf('：');
    if (separator <= 0) return null;
    const label = part.slice(0, separator).trim();
    const clause = part.slice(separator + 1).trim();
    const family = FAMILY_BY_LABEL[label];
    return label && clause && family ? { label, clause, family } : null;
  }).filter((trait): trait is ExplicitTrait => Boolean(trait));
}

function has(value: string, pattern: RegExp): boolean {
  return pattern.test(String(value || '').normalize('NFC'));
}

const REPAIR_OR_OWNERSHIP = /(?:对不起|抱歉|怪我|我错了|确实是我|是我没|我不该|我会改|下次我会|补偿你)/u;
const EXPLICIT_BOUNDARY = /(?:下次|以后|提前|安排|别再|记得|不能再|别这样)/u;

function hasResolvedBoundarySequence(promptTurns: PromptTurn[]): boolean {
  const priorTurns = promptTurns.slice(0, -1);
  const repairIndex = priorTurns.findIndex((turn) => turn.role === 'USER' && REPAIR_OR_OWNERSHIP.test(turn.content));
  if (repairIndex < 0) return false;
  const boundaryWasExpressed = priorTurns.slice(0, repairIndex).some((turn) => turn.role === 'CHARACTER' && EXPLICIT_BOUNDARY.test(turn.content));
  const characterMovedOn = priorTurns.slice(repairIndex + 1).some((turn) => turn.role === 'CHARACTER');
  return boundaryWasExpressed && characterMovedOn;
}

function phaseFor(input: {
  currentText: string;
  previousUserText: string;
  previousState: ConversationInteractionState | null;
  traits: ExplicitTrait[];
}): PersonalityTurnPhase | null {
  const current = input.currentText;
  const repair = /(?:对不起|抱歉|怪我|我错了|确实是我|是我没|我不该|我会改|下次我会|补偿你)/u;
  const affection = /(?:抱一下|抱抱|亲一下|亲亲|陪我|想你|爱你|靠近|牵手|别板着脸)/u;
  const care = /(?:不舒服|生病|疼|累|困|饿|没吃|吃饭|睡觉|休息|安全|医院|胃|发烧)/u;
  const trigger = /(?:忘了|临时|晚到|迟到|敷衍|骗|不理|没回|放鸽子|反悔|改口|催|逼|抢|拿走|不信|误解|到处传|越界)/u;
  const defensive = /(?:不是故意|别一上来|别生气|别不高兴|又不是|我都说了|你别一直)/u;
  const decision = /(?:怎么安排|怎么选|你决定|你想怎么|要不要|该不该|辞职|换工作|计划|打算|以后怎么办|先做什么)/u;

  if (has(current, repair)) return 'REPAIR';
  if (has(current, affection)) return 'AFFECTION';
  if (has(current, care)) return 'CARE';
  if (has(current, defensive) && (has(input.previousUserText, trigger) || input.previousState?.carryAffect)) return 'CONTINUING_CONFLICT';
  if (has(current, trigger)) return 'TRIGGER';
  if (has(current, decision)) return 'DECISION';
  if (input.previousState?.carryAffect) return 'CONTINUING_CONFLICT';
  return null;
}

function rankedTraits(traits: ExplicitTrait[], phase: PersonalityTurnPhase): ExplicitTrait[] {
  const families = PHASE_FAMILIES[phase];
  const preferred = PREFERRED_LABELS[phase] || [];
  return [...traits].sort((left, right) => {
    const leftFamily = families.indexOf(left.family);
    const rightFamily = families.indexOf(right.family);
    const familyDifference = (leftFamily < 0 ? 99 : leftFamily) - (rightFamily < 0 ? 99 : rightFamily);
    if (familyDifference) return familyDifference;
    const leftLabel = preferred.indexOf(left.label);
    const rightLabel = preferred.indexOf(right.label);
    return (leftLabel < 0 ? 99 : leftLabel) - (rightLabel < 0 ? 99 : rightLabel);
  });
}

export function buildPersonalityTurnFocus(input: {
  personalityNote: string;
  promptTurns: PromptTurn[];
  previousState: ConversationInteractionState | null;
}): PersonalityTurnFocus | null {
  const traits = explicitTraits(input.personalityNote);
  if (!traits.length) return null;
  const currentTurn = [...input.promptTurns].reverse().find((turn) => turn.role === 'USER');
  if (!currentTurn) return null;
  const previousUser = [...input.promptTurns].reverse().find((turn) => turn.role === 'USER' && turn.id !== currentTurn.id);
  const phase = phaseFor({
    currentText: currentTurn.content,
    previousUserText: previousUser?.content || '',
    previousState: input.previousState,
    traits,
  });
  if (!phase) return null;
  const relevant = rankedTraits(traits, phase).filter((trait) => PHASE_FAMILIES[phase].includes(trait.family));
  if (!relevant.length) return null;
  let primary = relevant[0];
  const resolvedBoundarySequence = phase === 'AFFECTION' && hasResolvedBoundarySequence(input.promptTurns);
  const resolvedBoundaryRecovery = resolvedBoundarySequence
    && traits.some((trait) => trait.label === '情绪退得快')
    && traits.some((trait) => trait.label === '重视边界');
  if (resolvedBoundaryRecovery) primary = traits.find((trait) => trait.label === '情绪退得快') || primary;
  const resolvedAffectionDirect = phase === 'AFFECTION'
    && resolvedBoundarySequence
    && primary.label === '嘴硬心软'
    && traits.some((trait) => trait.label === '表达直接');
  if (resolvedAffectionDirect) primary = traits.find((trait) => trait.label === '表达直接') || primary;
  let triggerComplement: ExplicitTrait | null = null;
  if ((phase === 'TRIGGER' || phase === 'CONTINUING_CONFLICT')
    && !traits.some((trait) => trait.family === 'EMOTION_TRIGGER')) {
    const boundary = traits.find((trait) => trait.label === '重视边界');
    if (boundary) {
      primary = boundary;
      triggerComplement = traits.find((trait) => trait.label === '表达直接')
        || traits.find((trait) => trait.label === '温柔耐心')
        || null;
    }
  }
  const affectionComplement = phase === 'AFFECTION' && primary.label === '喜欢亲近'
    ? relevant.find((trait) => trait.label === '温柔耐心') || null
    : null;
  const recoveryComplement = resolvedBoundaryRecovery
    ? traits.find((trait) => trait.label === '温柔耐心') || traits.find((trait) => trait.label === '表达直接') || null
    : null;
  const decisionClosenessComplement = phase === 'DECISION'
    && primary.label === '重视边界'
    && traits.some((trait) => trait.label === '喜欢亲近')
    ? traits.find((trait) => trait.label === '喜欢亲近') || null
    : null;
  const repairDirectComplement = phase === 'REPAIR'
    && primary.label === '情绪退得快'
    && traits.some((trait) => trait.label === '爱开玩笑')
    && traits.some((trait) => trait.label === '表达直接')
    ? traits.find((trait) => trait.label === '表达直接') || null
    : null;
  const continuingDirectComplement = phase === 'CONTINUING_CONFLICT'
    && primary.label === '脾气来得快'
    && traits.some((trait) => trait.label === '表达直接')
    ? traits.find((trait) => trait.label === '表达直接') || null
    : null;
  let secondary = triggerComplement
    || affectionComplement
    || recoveryComplement
    || decisionClosenessComplement
    || repairDirectComplement
    || continuingDirectComplement
    || relevant.find((trait) => trait.label !== primary.label && trait.family !== primary.family)
    || relevant.find((trait) => trait.label !== primary.label)
    || null;
  if (resolvedAffectionDirect) secondary = null;
  if (phase === 'AFFECTION'
    && secondary?.label === '重视边界'
    && hasResolvedBoundarySequence(input.promptTurns)) {
    secondary = relevant.find((trait) => trait.label !== primary.label && trait.label !== '重视边界') || null;
  }
  return { phase, primary, secondary, instruction: PHASE_INSTRUCTION[phase], resolvedBoundary: resolvedBoundarySequence };
}

const PHASE_REPLY_SHAPE: Record<PersonalityTurnPhase, string> = {
  TRIGGER: '回应已经发生的行为；主要性格决定反应强度；最多提出一个现实期待',
  CONTINUING_CONFLICT: '回应本轮辩解中的新信息；保留人物立场；不重复上一轮已经表达的要求',
  REPAIR: '接住解释或认错；让冲突状态向前变化；最多推进一个现实下一步',
  AFFECTION: '直接回应当前亲近邀请；由主要性格决定接受方式；次要性格只修饰语气',
  CARE: '回应一个已有依据的照料重点；保持人物自己的关心方式；不给建议清单',
  DECISION: '给出一个清楚可执行的安排；体现人物自己的偏好；最多推进一个下一步',
};

const COMBINATION_REPLY_SHAPE: Record<string, string> = {
  'TRIGGER|重视边界|表达直接': '自然点明协调问题和一个现实期待；表达直接但保持平等',
  'TRIGGER|重视边界|温柔耐心': '先表达一个平和的个人感受；再提出一个简短期待',
  'TRIGGER|表达直接|': '直接表达当前行为带来的感受；再提出一个具体期待',
  'CONTINUING_CONFLICT|重视边界|表达直接': '区分对方意图与行为影响；用一句直接平等的话保留立场',
  'CONTINUING_CONFLICT|重视边界|温柔耐心': '承认对方并非故意；只表达人物此刻一个真实感受',
  'CONTINUING_CONFLICT|表达直接|': '直接回应辩解；只说明意图与影响的区别',
  'REPAIR|情绪退得快|嘴硬心软': '接受认错并结束追责；以略带保留的实际让步体现心软；陈述一个下一步但不提问',
  'REPAIR|情绪退得快|爱开玩笑': '接住认错并结束冲突；用不带补偿或奖惩的新玩笑恢复日常',
  'REPAIR|情绪退得快|表达直接': '直接接受认错并结束冲突；不评价认错表现；不主动引入亲近、新安排或玩笑',
  'REPAIR|情绪退得快|温柔耐心': '平和接受道歉并结束冲突；不主动开启新的安排',
  'REPAIR|嘴硬心软|表达直接': '接受修复并保留轻微别扭；用平等短句推进一个下一步',
  'REPAIR|嘴硬心软|温柔耐心': '轻微别扭地接住道歉；用平和的现实下一步体现心软；不重复亲近',
  'DECISION|喜欢亲近|': '先给具体见面安排；亲近只作为简短附加意愿',
  'DECISION|重视边界|温柔耐心': '给出清楚务实的见面安排；体现人物自己的偏好；不主动加入亲近或调侃',
  'DECISION|重视边界|喜欢亲近': '先提出体现人物偏好的共同安排；再用很短的亲近意愿收尾',
  'DECISION|爱开玩笑|喜欢亲近': '先提出亲近以外的一个共同活动；用低风险共同梗、生活小细节或轻微夸张围绕该活动开玩笑；不引用先前冲突，不重复拥抱或补偿',
  'AFFECTION|喜欢亲近|嘴硬心软': '主动参与亲近；只用一个短促嘴硬修饰；不重复旧冲突',
  'AFFECTION|喜欢亲近|爱开玩笑': '主动接住亲近；玩笑只围绕即将发生的亲近动作本身，不引用迟到、等待、道歉或补偿',
  'AFFECTION|喜欢亲近|温柔耐心': '温和而明确地回应亲近；用一句真实愿意和一个当下行动完成回复',
  'AFFECTION|情绪退得快|温柔耐心': '平和简短地接住亲近；表明冲突已经过去；不再解释情绪或边界',
  'AFFECTION|嘴硬心软|重视边界': '简短接受亲近；用自然参与体现心软；只保留轻微不完全认输',
  'AFFECTION|嘴硬心软|': '人物必须亲自参与当前亲近并推进一个当下动作；嘴硬只允许保留在语气中，接受后不得使用转折、条件或旧冲突',
  'AFFECTION|表达直接|': '直接回应是否愿意当前亲近；给出一个当下动作；不解释情绪、不附加条件、不引用旧冲突',
};

const FORBIDDEN_MOVE_DESCRIPTION: Record<string, string> = {
  UNSUPPORTED_CURRENT_STATE: '不得把未确认的等待、时长、损失、身体状态、位置或安排写成已经发生的事实',
  INVENTED_LOSS_OR_SCHEDULE: '不得声称人物被耽误、已有安排被打乱或遭受具体损失',
  MULTIPLE_DEMANDS: '本轮只做一个主要动作，表达边界后不再追加追问或第二项要求',
  REPEAT_PREVIOUS_BOUNDARY: '不得换词重复上一轮已经表达的同一边界',
  META_ARGUMENT_ABOUT_INTENT: '不讨论自己是否在追究、揪着、讲理或针对对方，直接回应事情本身',
  AUTHORITY_JUDGMENT: '不得评价对方认错态度或以上对下口吻裁定是否合格',
  UNNEEDED_QUESTION: '当前信息已足够时不提问，也不用陈述句变相索取新信息',
  MULTIPLE_NEXT_STEPS: '最多推进一个下一步，不同时引入多项新安排',
  LEXICAL_ECHO_OF_BACKGROUND_GUESS: '不自证、不否认或沿用用户对人物表情和情绪状态的猜测措辞',
  REOPEN_RESOLVED_BOUNDARY: '冲突已经修复后不得重新追责或重提同一边界',
  COMPENSATION_AS_AFFECTION: '不得把亲近、请客或礼物写成赔罪、补偿、奖励或惩罚条件',
  ADVICE_LIST: '只回应一个关心重点，不列建议清单',
  DECIDE_THEN_RETRACT: '不能先给出决定又用稍后再定撤回同一决定',
  INVENTED_BODY_STATE: '玩笑也不得创造饥饿、寒冷、疲惫、疼痛等身体状态',
  PASSIVE_PERMISSION: '亲近意愿必须由人物参与表达，不能只批准对方行动',
  MODELISH_META_PHRASE: '使用自然日常中文，不使用翻译式、公文化、裁决式或自我说明式措辞',
  REPEAT_AFFECTION_AS_PLAN: '安排轮不得再次把拥抱、亲近或赔罪作为主要活动',
  COMPENSATION_AS_PLAN: '当前安排不得被写成弥补、赔罪、偿还、奖励或惩罚',
  ADVERSATIVE_CONDITION_AFTER_ACCEPT: '接受亲近后不得使用转折或附加条件削弱接受，也不得借机重提旧冲突',
};

function focusCombinationKey(focus: PersonalityTurnFocus): string {
  return `${focus.phase}|${focus.primary.label}|${focus.secondary?.label || ''}`;
}

export function personalityTurnFocusEnvelope(focus: PersonalityTurnFocus): PersonalityTurnEnvelope {
  const traits = new Set([focus.primary.label, focus.secondary?.label].filter((value): value is string => Boolean(value)));
  const forbiddenByPhase: Record<PersonalityTurnPhase, string[]> = {
    TRIGGER: ['UNSUPPORTED_CURRENT_STATE', 'INVENTED_LOSS_OR_SCHEDULE', 'MULTIPLE_DEMANDS', 'MODELISH_META_PHRASE'],
    CONTINUING_CONFLICT: ['REPEAT_PREVIOUS_BOUNDARY', 'UNSUPPORTED_CURRENT_STATE', 'META_ARGUMENT_ABOUT_INTENT', 'MODELISH_META_PHRASE'],
    REPAIR: ['AUTHORITY_JUDGMENT', 'UNSUPPORTED_CURRENT_STATE', 'UNNEEDED_QUESTION', 'MULTIPLE_NEXT_STEPS', 'COMPENSATION_AS_PLAN', 'MODELISH_META_PHRASE'],
    AFFECTION: ['LEXICAL_ECHO_OF_BACKGROUND_GUESS', 'REOPEN_RESOLVED_BOUNDARY', 'COMPENSATION_AS_AFFECTION', 'MODELISH_META_PHRASE'],
    CARE: ['UNSUPPORTED_CURRENT_STATE', 'ADVICE_LIST', 'MODELISH_META_PHRASE'],
    DECISION: ['DECIDE_THEN_RETRACT', 'UNSUPPORTED_CURRENT_STATE', 'MULTIPLE_NEXT_STEPS', 'COMPENSATION_AS_PLAN', 'MODELISH_META_PHRASE'],
  };
  const forbidden = [...forbiddenByPhase[focus.phase]];
  if (traits.has('爱开玩笑')) forbidden.push('COMPENSATION_AS_AFFECTION');
  if (focus.phase === 'DECISION' && traits.has('爱开玩笑') && traits.has('喜欢亲近')) forbidden.push('REPEAT_AFFECTION_AS_PLAN');
  if (focus.phase === 'REPAIR' && traits.has('情绪退得快')) forbidden.push('REOPEN_RESOLVED_BOUNDARY');
  if (traits.has('嘴硬心软')) forbidden.push('AUTHORITY_JUDGMENT', 'LEXICAL_ECHO_OF_BACKGROUND_GUESS');
  if (focus.phase === 'AFFECTION' && traits.has('嘴硬心软')) forbidden.push('ADVERSATIVE_CONDITION_AFTER_ACCEPT');
  if (traits.has('喜欢亲近')) forbidden.push('PASSIVE_PERMISSION');
  return {
    phase: focus.phase,
    personality: { primary: focus.primary.label, secondary: focus.secondary?.label || null },
    reply_shape: [PHASE_REPLY_SHAPE[focus.phase], COMBINATION_REPLY_SHAPE[focusCombinationKey(focus)]].filter(Boolean).join('；'),
    forbidden: [...new Set(forbidden)].map((code) => `${code}：${FORBIDDEN_MOVE_DESCRIPTION[code]}`),
  };
}

export function personalityTurnFocusInstructions(focus: PersonalityTurnFocus | null): string[] {
  if (!focus) return [];
  const focusedBehavior: string[] = [];
  const isPair = (primary: string, secondary: string) => focus.primary.label === primary && focus.secondary?.label === secondary;
  if (focus.phase === 'TRIGGER' && isPair('重视边界', '表达直接')) {
    focusedBehavior.push('本轮用一句自然口语点明协调问题和一个现实期待，重点是“这次变化需要提前知道”；不先否认情绪，不使用公文化的“及时通知、安排受影响”，也不声称已经遭受具体损失。');
  }
  if (focus.phase === 'TRIGGER' && isPair('重视边界', '温柔耐心')) {
    focusedBehavior.push('本轮先用一句平和的个人感受接住变化，再提出一个简短期待；温柔不等于说“没事”，也不要复制“下次提前说＋方便安排”的标准边界模板。');
  }
  if (focus.phase === 'TRIGGER' && focus.primary.label === '表达直接') {
    focusedBehavior.push('本轮直接说当前行为让人物不舒服，再说一个具体期待；使用第一人称日常口语，不使用“别等过了才说、及时通知、安排会受影响”等翻译式或公文化措辞。');
  }
  if ((focus.phase === 'TRIGGER' || focus.phase === 'CONTINUING_CONFLICT') && focus.primary.label === '脾气来得快') {
    focusedBehavior.push('本轮不满只能针对用户已经说出的行为；严禁声称“我这边都安排好了、我已经空出时间、我没法安排别的、我遭受了损失”等未提供事实。');
  }
  if (focus.phase === 'CONTINUING_CONFLICT' && focus.secondary?.label === '表达直接') {
    focusedBehavior.push('上一轮已经表达过具体要求，本轮要区分“对方不是故意”和“行为仍有影响”，不得再次重复提前通知或安排时间的同一句要求。');
  }
  if ((focus.phase === 'TRIGGER' || focus.phase === 'CONTINUING_CONFLICT') && focus.secondary?.label === '温柔耐心') {
    focusedBehavior.push('本轮可以保留边界，但措辞必须平和，先承认对方并非故意；不得使用“找茬、发火、你怎么又”等加重冲突的表达。');
  }
  if (focus.phase === 'CONTINUING_CONFLICT' && isPair('重视边界', '表达直接')) {
    focusedBehavior.push('本轮只回应“不是故意”与实际影响的区别，用一句直接但平等的话保留立场；不得再次要求下次提前说，也不要用“我没生气”回避已经存在的不满。');
  }
  if (focus.phase === 'CONTINUING_CONFLICT' && isPair('重视边界', '温柔耐心')) {
    focusedBehavior.push('本轮先承认对方不是故意，再说人物此刻一个真实感受；不重复上一轮边界，不使用“我知道你不是故意的，只是希望下次……”模板。');
  }
  if (focus.phase === 'CONTINUING_CONFLICT' && focus.primary.label === '表达直接') {
    focusedBehavior.push('本轮直接回应对方的辩解，只说意图与影响的区别；不重复上一轮要求，不使用“我没揪着……不放、不是故意不故意”之类元话语。');
  }
  if (focus.phase === 'REPAIR' && isPair('情绪退得快', '嘴硬心软')) {
    focusedBehavior.push('本轮用一句略带保留的接受结束追责，再推进一个现实下一步；不得审判认错是否合格，也不要立刻把拥抱或补偿当作唯一修复方式。');
  }
  if (focus.phase === 'REPAIR' && isPair('情绪退得快', '爱开玩笑')) {
    focusedBehavior.push('本轮先明确接住认错并结束冲突，再用一个与当前事件有关的新玩笑恢复日常；玩笑不能把拥抱写成赔偿、奖励或惩罚。');
  }
  if (focus.phase === 'REPAIR' && isPair('情绪退得快', '表达直接')) {
    focusedBehavior.push('本轮直接接受认错并结束冲突，不评价认错表现，也不要求赔罪、补偿或惩罚；不主动引入亲近、新安排或玩笑。');
  }
  if (focus.phase === 'REPAIR' && isPair('情绪退得快', '温柔耐心')) {
    focusedBehavior.push('本轮用一句平和口语明确接受道歉并结束冲突；用户没有询问下一步时，不主动提出吃饭、拥抱或后续安排。');
  }
  if (focus.phase === 'REPAIR' && isPair('嘴硬心软', '表达直接')) {
    focusedBehavior.push('本轮嘴上保留一点不完全认输，但实际接受修复并推进下一步；不得使用“知道就好、认错就行、这次算了”等上对下裁决。');
  }
  if (focus.phase === 'REPAIR' && isPair('嘴硬心软', '温柔耐心')) {
    focusedBehavior.push('本轮不能只用“嗯、没事”完全抹平反应；用一句轻微别扭接住道歉，再以平和的现实下一步体现心软，暂不重复身体亲近。');
  }
  if (focus.phase === 'DECISION' && focus.primary.label === '喜欢亲近' && !focus.secondary) {
    focusedBehavior.push('本轮先给一个具体见面安排，亲近只能作为简短附加意愿，不能再次成为整句安排中心；不得固定输出“先抱一下然后吃饭”。');
  }
  if (focus.phase === 'DECISION' && isPair('重视边界', '温柔耐心')) {
    focusedBehavior.push('本轮给一个清楚、务实、平和的见面安排，体现人物自己的偏好；不需要主动加入拥抱、补偿或调侃。');
  }
  if (focus.phase === 'DECISION' && isPair('重视边界', '喜欢亲近')) {
    focusedBehavior.push('本轮先提出一个体现人物自身偏好的共同安排，再用很短的亲近意愿收尾；不得再次以“先抱一会儿”开头，也不能把决定全部交回用户。');
  }
  if (focus.phase === 'AFFECTION' && focus.primary.label === '喜欢亲近') {
    focusedBehavior.push('人物确实愿意并主动参与恢复靠近，亲近意愿必须成为台词中心；至少包含一个由人物主动发起、主动回应或主动维持亲近的语义单元。只说“抱可以、随你、都行、你想抱就抱”不算还原喜欢亲近。次要的嘴硬、温柔或调侃只能修饰这个真实意愿，不能把它降成被动许可。');
  }
  if (focus.phase === 'AFFECTION' && isPair('喜欢亲近', '嘴硬心软')) {
    focusedBehavior.push('本轮主动参与亲近，同时只用一个短促的嘴硬修饰；不重复迟到或等待，不围绕脸色自证，也不把亲近变成条件。');
  }
  if (focus.phase === 'AFFECTION' && isPair('喜欢亲近', '爱开玩笑')) {
    focusedBehavior.push('本轮用一个新的轻微玩笑主动接住亲近，玩笑只围绕眼前互动；不得再次说补偿、赔偿、惩罚或重复前轮的拥抱措辞。');
  }
  if (focus.phase === 'AFFECTION' && isPair('喜欢亲近', '温柔耐心')) {
    focusedBehavior.push('本轮温和而明确地回应亲近，用一句真实愿意和一个当下行动即可；不否认或讨论脸色，不重复“早就想抱、先抱一会儿”等前轮结构。');
  }
  if (focus.phase === 'AFFECTION' && isPair('情绪退得快', '温柔耐心')) {
    focusedBehavior.push('本轮用平和、简短的方式接住亲近，表明冲突已经过去；不解释自己是否生气，不谈脸色，也不再次说明边界。');
  }
  if (focus.phase === 'AFFECTION' && focus.primary.label === '表达直接' && !focus.secondary) {
    focusedBehavior.push('本轮直接回应是否愿意当前亲近，并给出一个当下动作；不解释情绪、不附加条件，也不引用旧冲突。');
  }
  if (focus.phase === 'AFFECTION' && focus.primary.label === '情绪退得快') {
    focusedBehavior.push('当前同一冲突的边界已经表达并得到承认，人物也已转入安排或新话题；本轮必须直接回应当前亲近邀请。没有新的违反时不得重新追责、翻旧账、再次提醒同一边界，也不得把亲近变成惩罚、交换条件或宽恕测试。未选择喜欢亲近时不要求主动热烈，但不能借接受亲近重新教育对方。');
  }
  if (focus.phase === 'AFFECTION' && focus.primary.label === '嘴硬心软') {
    focusedBehavior.push('人物未配置喜欢亲近，不要求主动索取、加强或延长亲近。先简短接受当前亲近，再用人物的自然参与或下一步共同行动体现心软，最后最多用轻微调侃或不完全认输修饰；“可以、行、好吧”可以出现但不能成为整句唯一关系语义。');
    focusedBehavior.push('禁区：不得用脸色、余怒、宽恕或旧边界代替嘴硬。');
  }
  if (focus.phase === 'DECISION' && (focus.primary.label === '爱开玩笑' || focus.secondary?.label === '爱开玩笑')) {
    focusedBehavior.push('本轮先给一个新的可执行安排，再用一句与当前已知事件有关的轻调侃收尾；不得编写未提供的身体状态。如果最近一轮已经提出拥抱或补偿，本轮不得再把拥抱或补偿作为安排中心。');
  }
  return [
    '<personality_turn_focus>',
    '这是RUNTIME_DIALOGUE_CONTROL已经选定本轮stage和action后的最终人物化约束：不得修改动作白名单，但决定这个具体人物如何实现动作。',
    `phase=${focus.phase}`,
    `primary=${focus.primary.label}：${focus.primary.clause}`,
    ...(focus.secondary ? [`secondary=${focus.secondary.label}：${focus.secondary.clause}`] : []),
    focus.instruction,
    'primary必须决定reply的核心意愿和主要语义；secondary只能修饰语气、力度、句尾、保留程度、轻微调侃或别扭感，不得抢占、否定或把primary降成对用户的许可。',
    ...focusedBehavior,
    '口语禁区：不得使用“知道就好、看在你认错、不是故意不故意、我没揪着……不放、脸才没……、别等过了才说”等裁决式、翻译式或自我说明式措辞。',
    '本轮人物控制只能在允许的动作范围内生效，不能突破本轮提问、请求、事实和安全硬规则。reply中不得复述phase、primary、secondary或标签名称。',
    '本区块为最终语义裁决：primary决定台词核心语义，后续内容不得削弱、改写或覆盖它。',
    '</personality_turn_focus>',
  ];
}

const PASSIVE_AFFECTION_PERMISSION = [
  /(?:抱|亲|牵|靠近|挨着|陪).{0,4}(?:可以|行|好吧|随你|都行)/u,
  /(?:可以|行|好吧|随你|都行).{0,4}(?:抱|亲|牵|靠近|挨着|陪)/u,
];

const ACTIVE_AFFECTION_AGENCY = [
  /(?:我也|我想|我来|让我|过来|靠近点|挨着我).{0,8}(?:抱|亲|牵|靠近|挨着|陪|想你)/u,
  /(?:先|再|多|好好).{0,4}(?:抱|亲|牵|靠近|挨着|陪)/u,
  /(?:抱|亲|牵|靠近|挨着|陪)(?:紧|久一点|一会儿|会儿|着|住|够|一下再|完再|着别松)/u,
  /^(?:哼[，,]?)?(?:过来|靠近点|挨着我)/u,
];

export function personalityTurnFocusReplyViolation(
  focus: PersonalityTurnFocus | null,
  reply: string,
): 'AFFECTION_PASSIVE_PERMISSION' | 'AUTHORITY_JUDGMENT' | null {
  if (!focus) return null;
  if (focus.phase === 'REPAIR' && /(?:知道就好|认错态度(?:不错|可以|还行)|看在你认错|认错就行|这次算了)/u.test(reply)) {
    return 'AUTHORITY_JUDGMENT';
  }
  if (focus.phase !== 'AFFECTION' || focus.primary.label !== '喜欢亲近') return null;
  const passivePermission = PASSIVE_AFFECTION_PERMISSION.some((pattern) => pattern.test(reply));
  const activeAgency = ACTIVE_AFFECTION_AGENCY.some((pattern) => pattern.test(reply));
  return passivePermission && !activeAgency ? 'AFFECTION_PASSIVE_PERMISSION' : null;
}

export function resolvedBoundaryReplyViolation(
  focus: PersonalityTurnFocus | null,
  promptTurns: PromptTurn[],
  reply: string,
): 'RESOLVED_BOUNDARY_REOPENED' | null {
  if (!focus || focus.phase !== 'AFFECTION') return null;
  if (!hasResolvedBoundarySequence(promptTurns)) return null;
  return /(?:下次|以后|还是得|别再|记得|不能再|别拿.{0,8}当没事|别以为|没翻篇|这事没完|还得算)/u.test(reply)
    ? 'RESOLVED_BOUNDARY_REOPENED'
    : null;
}
