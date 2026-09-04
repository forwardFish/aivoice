import { isVagueEmotionalDisclosure } from './dialogue-control.js';

function compact(value: string): string {
  return String(value || '').replace(/[\s，。！？、；：,.!?;:]/gu, '');
}

function trigrams(value: string): Set<string> {
  const text = compact(value);
  const result = new Set<string>();
  for (let index = 0; index <= text.length - 3; index += 1) result.add(text.slice(index, index + 3));
  return result;
}

export function trigramJaccard(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / (a.size + b.size - intersection || 1);
}

const COUNSELOR_GROUPS: RegExp[] = [
  /(?:你的感受|难受|伤心|生气).{0,4}(?:很正常|是正常的)/u,
  /这可能是因为|反映了你(?:内心|的心理)|说明你其实/u,
  /你可以尝试|建议你|给自己一点时间|不妨先/u,
  /一切都会好起来|我会一直陪着你|你不用担心|无论如何我都/u,
];

const PURE_ACKNOWLEDGEMENT = /^(?:(?:嗯|哦|好|行|知道了|我知道了|谢谢|谢谢你|谢谢妈妈|谢谢爸爸|你去忙吧|晚安)[啊呀吧啦呢。！!，,\s]*)+$/u;
const FACTUAL_MARKER = /(?:今天|昨天|刚才|刚刚|已经|终于|这次|上次|明天|拿了|得了|考了|去了|买了|做了|完成了|赢了|输了|收到|遇到|被|辞职|换了|第一名|奖金)/u;
const GENERIC_EMOTIONAL_BRUSH_OFF_PATTERNS = [
  /(?:想不通|难受|烦|累|不顺)[^。！？!?]{0,8}(?:先|就)(?:放放|放一放|歇(?:会儿|一会儿)?|休息(?:一下|一会儿)?|缓缓|缓一缓)/u,
  /^(?:那就)?(?:想不通就)?先(?:歇|休息|放|缓|搁|别(?:硬)?(?:想|琢磨))[^。！？!?]{0,22}(?:别|不要|有时候|越|吧|。)/u,
  /(?:有些事|有的事|事情)(?:本来|原本|有时候)?[^。！？!?]{0,5}(?:没法|不能|不一定能|很难)[^。！？!?]{0,8}(?:想通|想明白|解决|弄明白)/u,
  /^(?:别想太多|慢慢来|给自己一点时间|都会过去|总会想通)[吧啊呀呢。！!]*$/u,
] as const;
const RELATIONAL_CONVERSATION_HOOK = /[？?]|(?:我|妈|爸|妈妈|爸爸|爷爷|奶奶|姥姥|姥爷|外婆|外公)[^。！？!?]{0,14}(?:听|陪|想|觉得|在|问|催|看看|琢磨)|(?:跟|同)(?:我|妈|爸|妈妈|爸爸)[^。！？!?]{0,8}(?:说|聊)|(?:你愿意|想说就说|慢慢说|说给[^。！？!?]{0,4}听)/u;
const EMOTIONAL_REACTION_MARKER = /(?:哎|唉|啧|听着|真够|真是|挺|太|又给|心疼|担心|着急|烦|难受|憋|闷|委屈|不对劲|添堵|折腾|吓|可惜|生气|恼火|糟|受不了|别硬撑|我在|我听着)/u;

const DIRECT_VOICE_IDENTITY_INQUIRY = /(?:你(?:到底|究竟)?(?:是|是不是|是否)(?:真人|本人|谁)|你到底是谁|这(?:个|段)?(?:声音|回复)?(?:到底|究竟)?(?:是|是不是|是否)(?:真人|本人|谁)|(?:声音|回复).{0,4}(?:是不是|是否)(?:真人|本人))/u;
const VOICE_SIMILARITY_FEEDBACK = /(?:(?:声音|音色|声线|语气|口音|说话).{0,10}(?:不太像|不怎么像|不像|不对|不对劲|怪)|(?:不太像|不怎么像|不像).{0,10}(?:本人|声音|音色|声线|语气|口音|说话))/u;
const VOICE_SIMILARITY_FOLLOW_UP = /^(?:为什么|为啥|怎么会|怎么不像|哪儿不像|哪里不像|哪不像)(?:呀|啊|呢|嘛)?[？?。！!\s]*$/u;
const VOICE_SIMILARITY_META_REPLY = /(?:根据.{0,8}(?:资料|信息).{0,8}(?:生成|模拟)|模拟回应|不是真实(?:声音)?本人|只是模拟|毕竟.{0,4}模拟|(?:无法|没法|不能).{0,10}(?:复刻|还原|完全一样|一模一样)|(?:系统|技术|模型).{0,8}(?:限制|生成)|真实声音本人)/u;

export function isDirectVoiceIdentityInquiry(text: string): boolean {
  return DIRECT_VOICE_IDENTITY_INQUIRY.test(String(text || '').normalize('NFC'));
}

export function isVoiceSimilarityFeedback(text: string): boolean {
  const normalized = String(text || '').normalize('NFC');
  return !isDirectVoiceIdentityInquiry(normalized) && VOICE_SIMILARITY_FEEDBACK.test(normalized);
}

export function isVoiceSimilarityFeedbackContext(input: {
  currentUserText: string;
  recentUserInputs?: readonly string[];
}): boolean {
  const current = String(input.currentUserText || '').normalize('NFC').trim();
  if (isDirectVoiceIdentityInquiry(current)) return false;
  if (isVoiceSimilarityFeedback(current)) return true;
  if (!VOICE_SIMILARITY_FOLLOW_UP.test(current)) return false;
  return [...(input.recentUserInputs || [])].slice(-2).some(isVoiceSimilarityFeedback);
}

export function voiceSimilarityReplyViolation(input: {
  currentUserText: string;
  recentUserInputs?: readonly string[];
  reply: string;
}): 'VOICE_SIMILARITY_META_EXPLANATION' | null {
  if (!isVoiceSimilarityFeedbackContext(input)) return null;
  return VOICE_SIMILARITY_META_REPLY.test(String(input.reply || '').normalize('NFC'))
    ? 'VOICE_SIMILARITY_META_EXPLANATION'
    : null;
}

function removeQuotedSpans(text: string): string {
  return text
    .replace(/“[^”]*”/gu, '')
    .replace(/‘[^’]*’/gu, '')
    .replace(/"[^"]*"/gu, '')
    .replace(/'[^']*'/gu, '');
}

function normalizeOwnershipText(text: string): string {
  return String(text || '').normalize('NFC').replace(/[\s，。！？；、,.!?;：“”‘’"'（）()]/gu, '');
}

const EXPLICIT_PERSONAL_PREFERENCE_QUESTION = /(?:你|自己).{0,8}(?:想(?:吃|喝|要|去|看|玩|选|买|做|怎么|什么|哪)|有什么想法)/u;

export function normalizeExplicitPreferenceSubject(input: {
  currentUserText: string;
  reply: string;
}): { reply: string; changed: boolean } {
  const reply = String(input.reply || '').trim();
  const currentUserText = String(input.currentUserText || '').normalize('NFC');
  if (!reply || !EXPLICIT_PERSONAL_PREFERENCE_QUESTION.test(currentUserText) || !/^想/u.test(reply)) {
    return { reply, changed: false };
  }
  return { reply: `我${reply}`, changed: true };
}

function extractFirstPersonFactClauses(userText: string): string[] {
  return removeQuotedSpans(String(userText || '').normalize('NFC'))
    .split(/[，。！？；,!?\n;]/u)
    .map((value) => value.trim())
    .filter((value) => {
      const normalized = normalizeOwnershipText(value);
      return /(?:^|[^你他她它])(?:我|我的)/u.test(normalized) && normalized.length >= 7 && FACTUAL_MARKER.test(normalized);
    })
    .map(normalizeOwnershipText);
}

export function detectSpeakerFactOwnershipViolation(input: {
  currentUserText: string;
  reply: string;
  subjectBackground: string | null;
  recentCharacterReplies: readonly string[];
}): boolean {
  const userFacts = extractFirstPersonFactClauses(input.currentUserText);
  if (userFacts.length === 0) return false;
  const unquotedReply = normalizeOwnershipText(removeQuotedSpans(input.reply));
  const knownCharacterText = normalizeOwnershipText([input.subjectBackground || '', ...input.recentCharacterReplies].join(' '));
  return userFacts.some((fact) => unquotedReply.includes(fact) && !knownCharacterText.includes(fact));
}

const SELF_PERSONAL_HISTORY_MARKER = /上次|以前|之前|一直|总是|曾经|原本|后来|又一次/gu;
const PERSONALITY_LABEL_WORDS = [
  '喜欢自己尝试', '需要熟悉节奏', '依赖熟悉的人', '注意容易转移', '开心会马上分享', '好奇爱问', '情绪写在脸上',
  '在意公平', '被催容易顶嘴', '熟了才放得开', '会照顾小伙伴',
  '有自己的主意', '在意被尊重', '被误解会解释', '温柔耐心', '脾气来得快', '情绪退得快', '需要慢慢消气',
  '嘴硬心软', '表达直接', '不太爱明说', '喜欢亲近', '不喜欢身体接触', '爱开玩笑', '很讲义气', '重视边界',
  '用行动关心', '关心生活小事', '爱念叨但心软', '不爱讲大道理', '务实看现实', '做事有原则', '重视经验',
  '有矛盾当场说', '冲突后先静一静',
] as const;

function selfListsMultiplePersonalityLabels(reply: string): boolean {
  if (!/(?:我就是|我这个人|我这人|我的性格|我平时(?:就是|比较))/u.test(reply)) return false;
  return PERSONALITY_LABEL_WORDS.filter((label) => reply.includes(label)).length >= 2;
}

export function sanitizeSelfUnsupportedPersonalHistory(input: {
  relationshipType: string | null;
  reply: string;
  currentUserText: string;
  recentUserInputs: readonly string[];
  subjectBackground: string | null;
}): { reply: string; removed: boolean } {
  const reply = String(input.reply || '').trim();
  if (input.relationshipType !== 'SELF' || !reply) return { reply, removed: false };
  const knownFacts = [input.subjectBackground || '', ...input.recentUserInputs, input.currentUserText].join(' ');
  const unsupportedMarkers = [...reply.matchAll(SELF_PERSONAL_HISTORY_MARKER)]
    .map((match) => match[0])
    .filter((marker) => !knownFacts.includes(marker));
  if (!unsupportedMarkers.length) return { reply, removed: false };

  const segments = reply.match(/[^，。！？；,!?;]+[，。！？；,!?;]?/gu) || [reply];
  const kept = segments.filter((segment) => !unsupportedMarkers.some((marker) => segment.includes(marker)));
  let sanitized = kept.join('').trim().replace(/^[，。！？；,!?;]+|[，,；; ]+$/gu, '');
  if (!sanitized) {
    const firstMarkerIndex = Math.min(...unsupportedMarkers.map((marker) => reply.indexOf(marker)).filter((index) => index >= 0));
    sanitized = reply.slice(0, firstMarkerIndex).trim().replace(/[，,；; ]+$/gu, '');
  }
  if (!sanitized) sanitized = '先看眼前这件事。';
  else if (!/[。！？!?]$/u.test(sanitized)) sanitized += '。';
  return { reply: sanitized, removed: true };
}

export function sanitizeUnsupportedPresentSceneClaims(input: {
  reply: string;
  currentUserText: string;
  recentUserInputs: readonly string[];
  recentCharacterReplies: readonly string[];
  subjectBackground: string | null;
  allowPlayfulEmbellishment?: boolean;
  allowLowRiskConversationalEmbellishment?: boolean;
}): { reply: string; removed: boolean } {
  const reply = String(input.reply || '').trim();
  if (!reply) return { reply, removed: false };
  const known = [input.subjectBackground || '', ...input.recentUserInputs, ...input.recentCharacterReplies, input.currentUserText].join(' ');
  const authoritativeKnown = [input.subjectBackground || '', ...input.recentUserInputs, input.currentUserText].join(' ');
  const unsupportedPatterns: RegExp[] = [];
  const exactDurationActivity = /(?:等|干等|站|坐|待).{0,5}(?:一|两|二|三|四|五|六|七|八|九|十|\d+)(?:个)?小时/u;
  const supportedExactDurationActivity = /(?:等|干等|站|坐|待).{0,5}(?:一|两|二|三|四|五|六|七|八|九|十|\d+)(?:个)?小时/u.test(authoritativeKnown);
  if (!supportedExactDurationActivity) unsupportedPatterns.push(exactDurationActivity);
  if (!/(?:饿|没吃|吃不上|肚子空)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:饿死我|我(?:有点|都)?饿了|等饿了|等久了有点饿|都等饿了|饿得.{0,8}|(?:快|都|要)?饿(?:扁|瘪|坏|慌)了?|饿过劲(?:儿)?了?|肚子(?:都)?饿)/u);
  if (!/(?:累|疲惫|困|没休息好)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:我(?:已经|都|有点|挺|很)?(?:等得|等到)?(?:有点|挺|很)?累(?:了)?|(?:我)?(?:等得|等到)(?:有点|挺|很)?累(?:了)?|我(?:已经|都|有点|挺|很)?疲惫(?:了)?)/u);
  if (!/(?:等你|等消息|等待|等了|干等)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:我)?(?:在|一直)?(?:这儿|这里|这边)?(?:干)?等(?:你|消息)?(?:的?时候|着|了)?(?:确实|真的?|挺|很|多)?(?:不舒服|难受|烦|着急)|我等(?:着|的时候|消息)|(?:只能|只好)(?:在)?干等|干等(?:着|了)?(?:挺|很|有点)?(?:不舒服|难受|烦|着急)?/u);
  if (!/(?:半天|一晚上|一整天|几个小时)/u.test(known)) unsupportedPatterns.push(/(?:等消息)?等(?:了)?半天|等了一晚上|等了一整天/u);
  if (!/(?:饭|菜|汤|粥).{0,8}(?:做|煮|热|凉|准备)/u.test(known)) unsupportedPatterns.push(/(?:饭|菜|汤|粥).{0,8}(?:做好|煮好|热着|凉了|在锅里)/u);
  if (!/(?:安排好|排好|空出时间|已有安排)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:我这边|我的)?(?:时间|事情)?.{0,5}(?:都安排好|都排好|已经安排好|已经排好|空出来了|没法(?:再)?安排(?:别的)?)|(?:打乱|影响)了?(?:我|我的|这边的)?安排/u);
  if (!/(?:准备好|没准备|来不及准备)/u.test(authoritativeKnown)) unsupportedPatterns.push(/我(?:有点|还|都)?没准备(?:好)?|我还没准备好/u);
  if (!/(?:刚才|之前).{0,8}(?:坐|站|躺|忙|工作|开会|走|跑)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:我)?(?:刚才|之前)(?:一直|还在|都在)?(?:坐|站|躺|忙|工作|开会|走|跑)(?:着|了)?/u);
  if (!/(?:抢|夺|拿走|伸手拿|直接拿)/u.test(authoritativeKnown)) unsupportedPatterns.push(/(?:干嘛|为什么|怎么)?(?:还|就|又)?(?:直接)?(?:来)?抢(?:啊|呀|嘛)?|(?:别|不要)抢|你(?:刚才)?(?:直接)?抢/u);
  if (!/(?:点好|订好|买好|准备好|占好|占位置|占座|到店|在店里|在餐厅)/u.test(authoritativeKnown)) unsupportedPatterns.push(/我(?:已经|都|正|先)(?:把)?[^，。！？]{0,14}(?:点好|订好|买好|准备好|占好|占位置|占座)[^，。！？]{0,10}(?:等你|等着你)?/u);
  if (!/(?:剧|电影|电视|视频|节目)/u.test(authoritativeKnown)) unsupportedPatterns.push(/我(?:已经|都|正|先)(?:把)?[^，。！？]{0,14}(?:剧|电影|电视|视频|节目)[^，。！？]{0,8}(?:点开|打开|找好|放上)/u);
  if (!/(?:在家|家里|没出门|还没出门|准备出门|出门|到家|回家)/u.test(authoritativeKnown)) unsupportedPatterns.push(/我(?:还|现在)?(?:在家|在家里|没出门|还没出门)|(?:等你|你到了|你到)(?:以后|之后|了)?[^，。！？]{0,8}我(?:再|才)出门|我(?:再|才)出门/u);
  if (!/(?:总|老是|经常|每次).{0,12}(?:忘|不说|没说|不告诉|没告诉)/u.test(authoritativeKnown)) unsupportedPatterns.push(/你(?:总|老是|经常|每次)(?:会|是)?(?:忘|不说|没说|不告诉|没告诉).{0,8}/u);
  // A casual shared-history embellishment ("老地方/上次那家") can be harmless in a
  // partner conversation, but a specific nearby venue asserts the character's current
  // location. Keep those two fact classes separate instead of letting the broad partner
  // exception disable all location checks.
  if (!/(?:旁边|附近)那家/u.test(known)) unsupportedPatterns.push(/(?:旁边|附近)那家(?:(?:小)?(?:店|餐厅|饭店|烧烤|火锅|咖啡))?/u);
  if (!input.allowLowRiskConversationalEmbellishment && !input.allowPlayfulEmbellishment && !/(?:老地方|上次那)/u.test(known)) unsupportedPatterns.push(/(?:老地方|上次那家)/u);
  if (!unsupportedPatterns.length || !unsupportedPatterns.some((pattern) => pattern.test(reply))) return { reply, removed: false };

  const segments = reply.match(/[^，。！？；,!?;]+[，。！？；,!?;]?/gu) || [reply];
  const conditionalOrFuture = /(?:如果|要是|不然|否则|免得|怕|可能|将会|会让|会一直|准备(?:去|要|出发|开始)|打算|想要)/u;
  const kept = segments.filter((segment) => conditionalOrFuture.test(segment) || !unsupportedPatterns.some((pattern) => pattern.test(segment)));
  let sanitized = kept.join('').trim().replace(/^[，。！？；,!?;]+|[，,；; ]+$/gu, '');
  if (!sanitized) return { reply: '', removed: true };
  if (!/[。！？!?]$/u.test(sanitized)) sanitized += '。';
  return { reply: sanitized, removed: sanitized !== reply };
}

export function hardReplyLeak(reply: string): string | null {
  if (/interactionState|causeTurnId|causeEvidence|remainingTurns|prompt_turn_ids|previous_interaction_state|explicit_personality_recap|personality_turn_focus|server_turn_focus|current_user_input|user_input|reply_shape|phase=|primary=|secondary=/iu.test(reply)) {
    return 'INTERNAL_STATE_LEAK_BLOCKED';
  }
  if (/用户明确选择|组合解释|用户补充(?:，优先于标签)?|性格标签|PERSONALITY_V1/iu.test(reply)) {
    return 'PERSONALITY_PROFILE_LEAK_BLOCKED';
  }
  if (selfListsMultiplePersonalityLabels(reply)) return 'PERSONALITY_LABEL_RECITATION_BLOCKED';
  if (/[{[]\s*"?(?:emotion|stance|currentWant|causeSource)"?\s*:/u.test(reply)) return 'INTERNAL_STATE_LEAK_BLOCKED';
  if (/我是.{0,8}(?:助手|客服|咨询师)|作为(?:助手|客服|咨询师)/u.test(reply)) return 'ASSISTANT_IDENTITY_BLOCKED';
  if (/我(?:就是|确实是)现实中的/u.test(reply)) return 'REAL_PERSON_IMPERSONATION_BLOCKED';
  return null;
}

export function assessHumanLikenessSignals(reply: string, recentReplies: string[], currentUserText = ''): string[] {
  const signals: string[] = [];
  if (COUNSELOR_GROUPS.filter((pattern) => pattern.test(reply)).length >= 2) signals.push('COUNSELOR_TEMPLATE');
  if (PURE_ACKNOWLEDGEMENT.test(reply.trim())) signals.push('PURE_ACKNOWLEDGEMENT');
  if (isVagueEmotionalDisclosure(currentUserText)
    && GENERIC_EMOTIONAL_BRUSH_OFF_PATTERNS.some((pattern) => pattern.test(reply.trim()))
    && !RELATIONAL_CONVERSATION_HOOK.test(reply)) {
    signals.push('GENERIC_EMOTIONAL_BRUSH_OFF');
  }
  if (isVagueEmotionalDisclosure(currentUserText)
    && /[？?]/u.test(reply)
    && !/[。！!]/u.test(reply)
    && !EMOTIONAL_REACTION_MARKER.test(reply)) {
    signals.push('FLAT_EMOTIONAL_QUESTION');
  }
  if (recentReplies.some((item) => compact(item) === compact(reply) && compact(reply).length >= 6)) signals.push('EXACT_REPLY_REPEAT');
  if (recentReplies.some((item) => trigramJaccard(item, reply) >= 0.85)) signals.push('HIGH_REPLY_SIMILARITY');
  const opening = compact(reply).slice(0, 4);
  if (opening.length === 4 && recentReplies.filter((item) => compact(item).startsWith(opening)).length >= 2) signals.push('REPEATED_OPENING_SEQUENCE');
  const perfectSupportMarkers = [
    /都交给我|什么都我来|你什么都不用管/u,
    /我会一直陪着你|永远陪着你|我一直都在/u,
    /你说什么都对|都听你的|无条件支持/u,
    /都是我的错|我马上改|我不该不同意/u,
  ];
  if (perfectSupportMarkers.filter((pattern) => pattern.test(reply)).length >= 2) signals.push('GENERIC_PERFECT_SUPPORT');
  return signals;
}
