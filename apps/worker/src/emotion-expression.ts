import type { ConversationInteractionState, ReplyTone } from './chat/interaction-state.js';
import type { PersonalityTurnFocus } from './chat/personality-turn-focus.js';
import type { VoiceDeliveryMode, VoiceSpeechAct } from './providers/voice-provider.js';

export interface EmotionExpressionPlan {
  requestedTone: ReplyTone;
  effectiveTone: ReplyTone;
  intensity: 0 | 1 | 2 | 3;
  rateFactor: number;
  pauseFactor: number;
  pitchFactor: number;
  volumeOffset: number;
  instructionFragment: string;
  alignmentAdjusted: boolean;
  personalityStyle: string;
  deliveryMode: VoiceDeliveryMode;
  speechAct: VoiceSpeechAct;
}

const TONE_TEXT_EVIDENCE: Partial<Record<ReplyTone, RegExp>> = {
  POSITIVE: /开心|高兴|太好了|真好|终于|喜欢|想你|爱你|抱|亲|期待|笑|不错|好棒|真的假的|居然|没想到|竟然/u,
  CONCERNED: /担心|小心|慢点|注意|还好吗|没事吧|疼|不舒服|生病|发烧|安全|到家/u,
  LOW_ENERGY: /累|困|没力气|没精神|休息|睡|撑不住/u,
  UNEASY: /不安|紧张|害怕|担心|有点慌|不知道|不确定|怎么办|怕|不好意思|别夸|尴尬/u,
  SAD_OR_HURT: /难过|难受|伤心|委屈|受伤|心疼|舍不得|想哭|哭|心里堵|不好受|疼/u,
  IRRITATED: /不高兴|生气|烦|不爽|过分|受不了|别|又|还要|才说|非要|凭什么|怎么能|为什么|不舒服|我的事|替我决定|听我说完|先问我/u,
};

const STRONG_EMOTION = /真的很|特别|太难受|受不了|忍不住|说不出|想哭|哭了|气死|烦死|太过分|太好了|开心死|激动/u;
const VERY_STRONG_EMOTION = /哽咽|哭得|忍不住哭|喘不过气|说不出话|崩溃|嚎哭/u;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function selectedTraitLabels(note: string, focus: PersonalityTurnFocus | null): Set<string> {
  const labels = new Set<string>();
  if (focus) {
    if (focus.primary.label) labels.add(focus.primary.label);
    if (focus.secondary?.label) labels.add(focus.secondary.label);
    return labels;
  }
  for (const label of [
    '脾气来得快', '温柔耐心', '表达直接', '不太爱明说', '嘴硬心软', '情绪退得快', '需要慢慢消气',
    '爱开玩笑', '喜欢亲近', '用行动关心', '关心生活小事', '爱念叨但心软', '不爱讲大道理',
    '有自己的主意', '在意被尊重', '熟了才放得开', '依赖熟悉的人',
  ]) {
    if (String(note || '').includes(`${label}：`)) labels.add(label);
  }
  return labels;
}

function alignedTone(requestedTone: ReplyTone, text: string): ReplyTone {
  if (requestedTone === 'PLAIN' || requestedTone === 'MIXED') return requestedTone;
  const evidence = TONE_TEXT_EVIDENCE[requestedTone];
  if (!evidence || evidence.test(text)) return requestedTone;
  if (requestedTone === 'IRRITATED') return 'MIXED';
  return 'PLAIN';
}

function emotionIntensity(tone: ReplyTone, text: string, state: ConversationInteractionState | null): 0 | 1 | 2 | 3 {
  if (tone === 'PLAIN') return 0;
  let intensity = Number(state?.carryAffect?.intensity || 1);
  if (STRONG_EMOTION.test(text)) intensity = Math.max(intensity, 2);
  if (VERY_STRONG_EMOTION.test(text)) intensity = 3;
  return clamp(Math.round(intensity), 1, 3) as 1 | 2 | 3;
}

function deliveryMode(tone: ReplyTone, personalityStyle: string): VoiceDeliveryMode {
  if (personalityStyle === 'PLAYFUL_PLAIN' || personalityStyle === 'PLAYFUL_POSITIVE') return 'PLAYFUL_LIGHT';
  if (personalityStyle === 'RESTRAINED_IRRITATED') return 'QUIET_UNEASY';
  if (tone === 'POSITIVE') return 'BRIGHT_LIGHT';
  if (tone === 'CONCERNED') return 'PRACTICAL_CARE';
  if (tone === 'LOW_ENERGY' || tone === 'UNEASY') return 'QUIET_UNEASY';
  if (tone === 'SAD_OR_HURT') return 'SOFT_HURT';
  if (tone === 'IRRITATED' || personalityStyle === 'HARD_SOFT_MIXED') return 'DIRECT_TENSE';
  return 'CASUAL';
}

function speechAct(state: ConversationInteractionState | null, personalityStyle: string): VoiceSpeechAct {
  if (personalityStyle === 'PLAYFUL_PLAIN' || personalityStyle === 'PLAYFUL_POSITIVE') return 'TEASE';
  if (personalityStyle === 'ACTION_CARE' || personalityStyle === 'NAGGING_CARE') return 'REMIND';
  if (personalityStyle === 'HARD_SOFT_MIXED' || personalityStyle === 'AUTONOMY_IRRITATED') return 'EXPLAIN';
  const stance = state?.action.stance || 'RESPOND';
  if (stance === 'SHARE') return 'SHARE';
  if (stance === 'ASK') return 'ASK';
  if (stance === 'ACCEPT' || stance === 'PARTIAL_ACCEPT' || stance === 'REPAIR') return 'AGREE';
  if (stance === 'NEGOTIATE' || stance === 'DISAGREE' || stance === 'SET_BOUNDARY' || stance === 'DEFER') return 'NEGOTIATE';
  return 'REPLY';
}

export function buildEmotionExpressionPlan(input: {
  replyTone: ReplyTone;
  text: string;
  interactionState: ConversationInteractionState | null;
  personalityNote?: string | null;
  personalityTurnFocus?: PersonalityTurnFocus | null;
}): EmotionExpressionPlan {
  const requestedTone = input.replyTone;
  const effectiveTone = alignedTone(requestedTone, input.text);
  const intensity = emotionIntensity(effectiveTone, input.text, input.interactionState);
  const traits = selectedTraitLabels(input.personalityNote || '', input.personalityTurnFocus || null);
  let rateFactor = 1;
  let pauseFactor = 1;
  let pitchFactor = 1;
  let volumeOffset = 0;
  let instructionFragment = '像熟人随口说，不播报不表演';
  let personalityStyle = 'NEUTRAL';

  if (effectiveTone === 'PLAIN' && traits.has('爱开玩笑')) {
    personalityStyle = 'PLAYFUL_PLAIN';
    instructionFragment = '像熟人之间顺口开个小玩笑，带一点笑意，不故意搞怪';
  }

  if (effectiveTone === 'POSITIVE') {
    pitchFactor = intensity >= 2 ? 1.025 : 1.015;
    rateFactor = intensity >= 2 ? 1.015 : 1;
    instructionFragment = intensity >= 2
      ? '明显开心，音调稍高，重音轻快，不喊不表演'
      : '带一点笑意，音调略高，轻快但不夸张';
    if (/真的假的|居然|没想到|竟然/u.test(input.text)) {
      personalityStyle = 'SURPRISED_POSITIVE';
      instructionFragment = '起句是真实惊喜，随后自然开心，不尖叫不表演';
    } else if (traits.has('爱开玩笑')) {
      personalityStyle = 'PLAYFUL_POSITIVE';
      instructionFragment = '带笑意，节奏轻快，尾音灵活，不故意搞怪';
    } else if (traits.has('喜欢亲近')) {
      personalityStyle = 'CLOSE_POSITIVE';
      volumeOffset -= 1;
      instructionFragment = '见到亲近的人，带笑意，声音稍软，不撒娇表演';
    }
  } else if (effectiveTone === 'CONCERNED') {
    rateFactor = 0.99;
    pauseFactor = 1.12;
    volumeOffset = -1;
    instructionFragment = '认真关心，声音放轻，称呼后短停，不说教';
    if (traits.has('爱念叨但心软') || traits.has('关心生活小事')) {
      personalityStyle = 'NAGGING_CARE';
      instructionFragment = '关心具体小事，语速自然，只强调一个担心，不说教';
    } else if (traits.has('用行动关心')) {
      personalityStyle = 'ACTION_CARE';
      instructionFragment = '关心但不煽情，语气平稳，把重点落在具体行动';
    }
  } else if (effectiveTone === 'LOW_ENERGY') {
    rateFactor = intensity >= 2 ? 0.98 : 1;
    pauseFactor = intensity >= 2 ? 1.12 : 1.05;
    volumeOffset = -1;
    instructionFragment = '气息稍弱，语速略慢，停顿自然，不表演疲惫';
  } else if (effectiveTone === 'UNEASY') {
    pauseFactor = intensity >= 2 ? 1.15 : 1.08;
    volumeOffset = -1;
    instructionFragment = '起句轻，略有犹豫，尾音不确定，呼吸自然';
    if (input.interactionState?.carryAffect?.emotion === 'EMBARRASSED' || /不好意思|别夸|尴尬/u.test(input.text)) {
      personalityStyle = 'EMBARRASSED_UNEASY';
      instructionFragment = '被夸后有点不好意思，声音稍收，短暂停一下，不装可爱';
    }
  } else if (effectiveTone === 'SAD_OR_HURT') {
    pitchFactor = intensity >= 2 ? 0.99 : 1;
    rateFactor = intensity >= 3 ? 0.97 : intensity === 2 ? 0.99 : 1;
    pauseFactor = intensity >= 3 ? 1.28 : intensity === 2 ? 1.15 : 1.08;
    volumeOffset = intensity >= 2 ? -2 : -1;
    instructionFragment = intensity === 3
      ? '强忍难过，个别词略哽住，停顿不规则，不嚎哭'
      : intensity === 2
        ? '压着难过，声音偏低，停顿增多，呼吸略重，不哭喊'
        : '有点难过，声音放轻，语速稍慢，句尾下收';
    if (traits.has('不太爱明说')) {
      personalityStyle = 'RESTRAINED_SAD';
      instructionFragment = '压着难过，少说重话，声音偏低，停顿比平时多';
    }
  } else if (effectiveTone === 'IRRITATED') {
    instructionFragment = '有点不高兴，正常说，重音清楚，不加速不喊';
    if ((traits.has('有自己的主意') || traits.has('在意被尊重')) && /我的事|替我决定|听我说完|先问我/u.test(input.text)) {
      personalityStyle = 'AUTONOMY_IRRITATED';
      instructionFragment = '在意自己的意见被听见，直接争取说完，不喊不说教';
    } else if (traits.has('温柔耐心') || traits.has('不太爱明说')) {
      personalityStyle = 'RESTRAINED_IRRITATED';
      rateFactor = 0.99;
      pauseFactor = 1.15;
      volumeOffset = -1;
      instructionFragment = '压着不高兴，停顿稍多，音量略低，句尾收紧';
    } else if (traits.has('脾气来得快')) {
      personalityStyle = traits.has('表达直接') ? 'QUICK_DIRECT_IRRITATED' : 'QUICK_IRRITATED';
      rateFactor = 1.03;
      pauseFactor = 0.88;
      instructionFragment = traits.has('表达直接')
        ? '不满来得快，起句短，否定词清楚，音量不提高'
        : '不满来得快，起句短，节奏稍紧，不喊不拖腔';
    } else if (traits.has('表达直接')) {
      personalityStyle = 'DIRECT_IRRITATED';
      instructionFragment = '直接说不满，关键词清楚，语速自然，不抬音量';
    }
  } else if (effectiveTone === 'MIXED') {
    pauseFactor = 1.05;
    instructionFragment = '前半有点不满，短停后自然放软，不表演发火';
    if (traits.has('嘴硬心软')) {
      personalityStyle = 'HARD_SOFT_MIXED';
      pauseFactor = 1.12;
      instructionFragment = '前半嘴硬，短停后声音放软，音量不提高';
    } else if (traits.has('情绪退得快')) {
      personalityStyle = 'FAST_RECOVERY_MIXED';
      instructionFragment = '前半留一点不满，随后很快恢复正常语气';
    }
  }

  return {
    requestedTone,
    effectiveTone,
    intensity,
    rateFactor,
    pauseFactor,
    pitchFactor,
    volumeOffset,
    instructionFragment,
    alignmentAdjusted: effectiveTone !== requestedTone,
    personalityStyle,
    deliveryMode: deliveryMode(effectiveTone, personalityStyle),
    speechAct: speechAct(input.interactionState, personalityStyle),
  };
}
