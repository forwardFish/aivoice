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

export function hardReplyLeak(reply: string): string | null {
  if (/interactionState|causeTurnId|causeEvidence|remainingTurns|prompt_turn_ids|previous_interaction_state/iu.test(reply)) {
    return 'INTERNAL_STATE_LEAK_BLOCKED';
  }
  if (/[{[]\s*"?(?:emotion|stance|currentWant|causeSource)"?\s*:/u.test(reply)) return 'INTERNAL_STATE_LEAK_BLOCKED';
  if (/我是.{0,8}(?:助手|客服|咨询师)|作为(?:助手|客服|咨询师)/u.test(reply)) return 'ASSISTANT_IDENTITY_BLOCKED';
  if (/我(?:就是|确实是)现实中的/u.test(reply)) return 'REAL_PERSON_IMPERSONATION_BLOCKED';
  return null;
}

export function assessHumanLikenessSignals(reply: string, recentReplies: string[]): string[] {
  const signals: string[] = [];
  if (COUNSELOR_GROUPS.filter((pattern) => pattern.test(reply)).length >= 2) signals.push('COUNSELOR_TEMPLATE');
  if (PURE_ACKNOWLEDGEMENT.test(reply.trim())) signals.push('PURE_ACKNOWLEDGEMENT');
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
