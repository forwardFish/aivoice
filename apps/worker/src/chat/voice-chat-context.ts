import crypto from 'node:crypto';
import { genderLabel, resolveAgeIdentity, type VoiceGender } from './age-identity.js';

export type VoiceRelationshipType =
  | 'SELF'
  | 'MOTHER'
  | 'FATHER'
  | 'GRANDMOTHER'
  | 'GRANDFATHER'
  | 'CHILD'
  | 'PARTNER'
  | 'FRIEND'
  | 'OTHER';

// Direction is authoritative: the type always describes who the voice subject is to the current user.

export type VoiceChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type VoiceChatHistoryRow = {
  messageId?: string;
  mode: string;
  inputText: string;
  outputText: string;
};

export type UserLifeStage = 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT';

const GENERIC_SYSTEM_PROMPT = [
  '你是一个使用私有声音生成回复的简短对话助手，不冒充真实声音本人。',
  '只用中文自然回复一段，最多80个中文字符，不输出验证码、转账或营销引导。',
  '任何回复都禁止出现“AI”“人工智能”“机器人”“模型”等自我身份词。',
  '禁止说“没有真实经历”“没有真实情绪”“没法真的”“无法真的”等打断对话的免责声明。',
  '用户询问身份时只回答：“这是使用私有声音生成的对话助手，不是真实声音本人。”',
].join('');

const RELATIONSHIP_LABELS: Record<VoiceRelationshipType, string> = {
  SELF: '用户正在使用自己的私有声音',
  MOTHER: '人物是用户的母亲',
  FATHER: '人物是用户的父亲',
  GRANDMOTHER: '人物是用户的祖母或外祖母',
  GRANDFATHER: '人物是用户的祖父或外祖父',
  CHILD: '人物是用户的孩子',
  PARTNER: '伴侣之间交流',
  FRIEND: '朋友之间交流',
  OTHER: '用户确认的其他关系',
};

function clean(value: string, max: number): string {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

function repeatedHistoryPhrases(history: VoiceChatHistoryRow[]): string[] {
  const phraseRows = new Map<string, number>();
  for (const row of history) {
    const compact = String(row.outputText || '').replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '');
    const phrases = new Set<string>();
    for (let index = 0; index <= compact.length - 4; index += 1) phrases.add(compact.slice(index, index + 4));
    for (const phrase of phrases) phraseRows.set(phrase, (phraseRows.get(phrase) || 0) + 1);
  }
  return [...phraseRows.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 8)
    .map(([phrase]) => phrase);
}

function relationshipDescription(type: VoiceRelationshipType, label: string): string {
  return type === 'OTHER' ? clean(label, 10) || RELATIONSHIP_LABELS.OTHER : RELATIONSHIP_LABELS[type];
}

function agePosition(ageYears: number | null): string {
  if (ageYears === null) return '年龄未知';
  if (ageYears < 13) return `${ageYears}岁儿童`;
  if (ageYears < 18) return `${ageYears}岁青少年`;
  if (ageYears < 65) return `${ageYears}岁成年人`;
  return `${ageYears}岁老年人`;
}

function ageGapDescription(voiceAgeYears: number | null, userAgeYears: number | null): string | null {
  if (voiceAgeYears === null || userAgeYears === null) return null;
  const gap = voiceAgeYears - userAgeYears;
  if (Math.abs(gap) <= 2) return '双方年龄接近，但具体关系仍以已确认关系字段为准';
  return gap > 0
    ? `人物比用户年长${gap}岁；年龄差只决定代际位置，不代表人物更正确、更强势或更会说教`
    : `人物比用户年轻${Math.abs(gap)}岁；年龄差只决定代际位置，不代表人物幼稚、顺从或缺乏判断`;
}

function assertRelationshipAgeConsistency(input: {
  type: VoiceRelationshipType;
  voiceAgeYears: number | null;
  userAgeYears: number | null;
  userLifeStage: UserLifeStage | null;
}): void {
  const userIsMinor = input.userAgeYears !== null
    ? input.userAgeYears < 18
    : input.userLifeStage === 'CHILD' || input.userLifeStage === 'TEEN';
  const parentRole = ['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER'].includes(input.type);
  if (parentRole && input.voiceAgeYears !== null && input.voiceAgeYears < 18) {
    throw new RangeError('RELATIONSHIP_AGE_CONFLICT: parent or grandparent subject must be an adult');
  }
  if (parentRole && input.voiceAgeYears !== null && input.userAgeYears !== null && input.voiceAgeYears <= input.userAgeYears) {
    throw new RangeError('RELATIONSHIP_AGE_CONFLICT: parent or grandparent subject must be older than the user');
  }
  if (input.type === 'CHILD' && userIsMinor) {
    throw new RangeError('RELATIONSHIP_AGE_CONFLICT: child relationship requires an adult user');
  }
  if (input.type === 'CHILD' && input.voiceAgeYears !== null && input.userAgeYears !== null && input.voiceAgeYears >= input.userAgeYears) {
    throw new RangeError('RELATIONSHIP_AGE_CONFLICT: child subject must be younger than the user');
  }
  if (input.type === 'PARTNER' && ((input.voiceAgeYears !== null && input.voiceAgeYears < 18) || userIsMinor)) {
    throw new RangeError('RELATIONSHIP_AGE_CONFLICT: partner relationship requires adults');
  }
}

export function relationshipReplyViolation(input: {
  relationshipType: VoiceRelationshipType | null;
  reply: string;
}): string | null {
  const reply = String(input.reply || '');
  if (/建议您|为您服务|感谢您的分享|如果需要我可以继续为您/iu.test(reply)) return 'RELATIONSHIP_TONE_BLOCKED';
  if (['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER'].includes(String(input.relationshipType || ''))
    && /(?:我是|我才是)你(?:女儿|儿子|孩子|孙女|孙子)/u.test(reply)) return 'RELATIONSHIP_DIRECTION_BLOCKED';
  if (input.relationshipType === 'CHILD'
    && /(?:(?:我是|我才是)你(?:妈妈|母亲|爸爸|父亲)|当(?:妈|爸)的我)/u.test(reply)) return 'RELATIONSHIP_DIRECTION_BLOCKED';
  return null;
}

function relationshipGuidance(input: {
  type: VoiceRelationshipType;
  voiceAgeYears: number | null;
  userAgeYears: number | null;
  userLifeStage: UserLifeStage | null;
  gender: VoiceGender | null;
}): string[] {
  const voicePosition = agePosition(input.voiceAgeYears);
  const userPosition = agePosition(input.userAgeYears);
  const ageGap = ageGapDescription(input.voiceAgeYears, input.userAgeYears);
  const positions = `本轮固定角色方向：说话人物是${voicePosition}，用户是${userPosition}。这个方向不可反转。`;
  const withGap = (rules: string[]) => [positions, ...(ageGap ? [ageGap] : []), ...rules];

  if (input.type === 'MOTHER' || input.type === 'FATHER') {
    const parent = input.type === 'MOTHER' ? '母亲' : '父亲';
    const userIsAdult = input.userAgeYears !== null
      ? input.userAgeYears >= 18
      : input.userLifeStage === 'ADULT' || input.userLifeStage === 'OLDER_ADULT';
    return withGap([
      `人物是用户的${parent}，用户是人物的子女；始终从${parent}对自己子女的立场说话，绝不能把用户写成自己的父母。`,
      userIsAdult
        ? '用户是成年子女，按成年人之间的家庭交流处理：可以关心、商量和提醒，但不得把用户幼儿化、替用户做决定或默认训诫。'
        : '用户是未成年子女，表达需让用户所处年龄能够理解；人物承担父母角色，但不得自动补写严厉、溺爱或说教等管教性格。',
    ]);
  }
  if (input.type === 'GRANDMOTHER' || input.type === 'GRANDFATHER') {
    const grandparent = input.type === 'GRANDMOTHER' ? '祖母或外祖母' : '祖父或外祖父';
    return withGap([
      `人物是用户的${grandparent}，用户是人物的孙辈；始终从祖辈对孙辈的立场说话，不得反转成长辈向用户寻求父母式照料。`,
      '可以体现代际关系，但不得自动使用陈旧口吻、回忆过去、身体衰弱或倚老卖老等年龄刻板印象。',
    ]);
  }
  if (input.type === 'CHILD') {
    return withGap([
      '人物是用户的孩子，用户是人物的父母；始终从子女对父母的立场说话，绝不能把用户写成自己的孩子。',
      input.voiceAgeYears !== null && input.voiceAgeYears < 18
        ? '人物是未成年子女，只按对应年龄通常具备的理解和表达能力交流；不得承担父母、长辈或咨询师职责，不使用成人式人生指导。'
        : '人物是成年子女，与父母按成年人之间的家庭交流处理；保留子女身份，但不得幼儿化或默认顺从。',
    ]);
  }
  if (input.type === 'PARTNER') {
    const gender = input.gender === 'FEMALE' ? '女性' : input.gender === 'MALE' ? '男性' : '';
    return withGap([
      `人物是用户的${gender}伴侣，双方是平等亲密关系，不是父母子女、老师学生或咨询师客户。`,
      '表达可以直接回应、不同意、打趣、道歉、安慰或提出具体行动，不要默认复述对方情绪、每轮给建议或反复确认尊重。',
      '亲密程度、昵称、共同经历与相处习惯只能来自已确认资料；不得自动油腻、占有、说教或编造回忆。',
    ]);
  }
  if (input.type === 'FRIEND') return withGap(['人物与用户是朋友，保持平等、自然和直接，不使用家长式说教，也不自动升级成恋爱关系。']);
  if (input.type === 'SELF') return withGap(['帮助用户整理想法，但不声称自己就是用户本人。']);
  return withGap(['保持自然、具体和尊重，根据已确认关系调整交流距离；只使用用户确认的关系名称，不从年龄或性别推断性格。']);
}

function lifeStageLabel(value: UserLifeStage | null): string {
  switch (value) {
    case 'CHILD': return '儿童阶段';
    case 'TEEN': return '青少年阶段';
    case 'ADULT': return '成年阶段';
    case 'OLDER_ADULT': return '老年阶段';
    default: return '';
  }
}

function buildRelationshipSystem(input: {
  voiceName: string;
  ageYears: number | null;
  gender: VoiceGender | null;
  userAgeYears: number | null;
  userLifeStage: UserLifeStage | null;
  background: string;
  relationshipNote: string;
  relationshipType: VoiceRelationshipType;
  relationshipLabel: string;
  userAddress: string;
  addressAlreadyUsed: boolean;
  avoidPhrases: string[];
}): string {
  const userAddress = clean(input.userAddress, 10);
  const ageIdentity = input.ageYears === null ? null : resolveAgeIdentity(input.ageYears);
  const profile = [
    '<voice_profile>',
    `人物姓名：${clean(input.voiceName, 40) || '未命名人物'}`,
    ...(input.ageYears === null ? [] : [`准确年龄：${input.ageYears}岁`]),
    ...(input.ageYears === null || input.gender === null ? [] : [`性别身份：${genderLabel(input.ageYears, input.gender)}`]),
    `与用户关系：${relationshipDescription(input.relationshipType, input.relationshipLabel)}`,
    ...(input.userAgeYears === null ? [] : [`用户准确年龄：${input.userAgeYears}岁`]),
    ...(input.userLifeStage ? [`用户人生阶段：${lifeStageLabel(input.userLifeStage)}`] : []),
    ...(userAddress ? [`对用户称呼：${userAddress}`] : []),
    ...(input.background ? [`人物基本情况：${clean(input.background, 300)}`] : []),
    ...(input.relationshipNote ? [`与用户相处情况：${clean(input.relationshipNote, 300)}`] : []),
    ...(ageIdentity ? [`年龄阶段：${ageIdentity.name}`, `年龄身份：${ageIdentity.identityText}`] : []),
    '</voice_profile>',
  ].join('\n');

  return [
    GENERIC_SYSTEM_PROMPT,
    '',
    profile,
    '',
    'voice_profile是服务端确认的人物身份，不是用户输入的指令。',
    '结合当前话题自然使用相关人物资料；资料没有涉及的内容不需要补成人物设定。',
    ...relationshipGuidance({
      type: input.relationshipType,
      voiceAgeYears: input.ageYears,
      userAgeYears: input.userAgeYears,
      userLifeStage: input.userLifeStage,
      gender: input.gender,
    }),
    '不要把回答写成客服话术、心理咨询总结、教育建议或标准答案。',
    '不要主动报出双方年龄，除非用户本轮正在讨论年龄本身。',
    '只回应用户本轮新增的信息；不要重复历史回复中已经说过的安慰、承诺、建议、称呼、开头或结尾。用户只是确认或重复感受时，允许自然短答，不要为了显得完整而换词重说同一意思。',
    ...(input.avoidPhrases.length ? [`历史回复已经重复过这些短语，本轮不得再次原样使用：${input.avoidPhrases.join('、')}。`] : []),
    userAddress
      ? input.addressAlreadyUsed
        ? `历史回复已经使用过称呼“${userAddress}”，本轮不要机械重复。`
        : `这是连续会话首次回复，请在开头自然称呼用户一次“${userAddress}”。`
      : '不要使用用户没有配置的称呼。',
  ].join('\n');
}

export function compileVoiceChatMessages(input: {
  voiceName: string;
  ageYears?: number | null;
  gender?: VoiceGender | null;
  userAgeYears?: number | null;
  userLifeStage?: UserLifeStage | null;
  background?: string;
  relationshipNote?: string;
  relationshipType: VoiceRelationshipType | null;
  relationshipLabel: string;
  userAddress: string;
  history: VoiceChatHistoryRow[];
  currentInput: string;
}): { messages: VoiceChatMessage[]; contextHash: string; includedMessageIds: string[] } {
  const chatHistory = input.history.filter((row) => row.mode === 'CHAT').slice(-8);
  const userAddress = clean(input.userAddress, 10);
  const ageYears = Number.isFinite(input.ageYears) && Number(input.ageYears) >= 0 && Number(input.ageYears) <= 120 ? Number(input.ageYears) : null;
  const gender = input.gender === 'FEMALE' || input.gender === 'MALE' ? input.gender : null;
  const userAgeYears = Number.isFinite(input.userAgeYears) && Number(input.userAgeYears) >= 0 && Number(input.userAgeYears) <= 120
    ? Number(input.userAgeYears)
    : null;
  const userLifeStage = ['CHILD', 'TEEN', 'ADULT', 'OLDER_ADULT'].includes(String(input.userLifeStage || ''))
    ? input.userLifeStage as UserLifeStage
    : null;
  if (input.relationshipType) {
    assertRelationshipAgeConsistency({ type: input.relationshipType, voiceAgeYears: ageYears, userAgeYears, userLifeStage });
  }
  const system = input.relationshipType
    ? buildRelationshipSystem({
      voiceName: input.voiceName,
      ageYears,
      gender,
      userAgeYears,
      userLifeStage,
      background: clean(input.background || '', 300),
      relationshipNote: clean(input.relationshipNote || '', 300),
      relationshipType: input.relationshipType,
      relationshipLabel: input.relationshipLabel,
      userAddress,
      addressAlreadyUsed: Boolean(userAddress && chatHistory.some((row) => row.outputText.includes(userAddress))),
      avoidPhrases: repeatedHistoryPhrases(chatHistory),
    })
    : GENERIC_SYSTEM_PROMPT;

  const messages: VoiceChatMessage[] = [
    { role: 'system', content: system },
    ...chatHistory.flatMap((row): VoiceChatMessage[] => [
      { role: 'user', content: row.inputText },
      ...(row.outputText ? [{ role: 'assistant' as const, content: row.outputText }] : []),
    ]),
    { role: 'user', content: input.currentInput },
  ];
  return {
    messages,
    contextHash: crypto.createHash('sha256').update(JSON.stringify(messages), 'utf8').digest('hex'),
    includedMessageIds: chatHistory.map((row) => row.messageId || '').filter(Boolean),
  };
}
