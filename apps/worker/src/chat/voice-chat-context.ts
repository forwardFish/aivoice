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

function relationshipDescription(type: VoiceRelationshipType, label: string): string {
  return type === 'OTHER' ? clean(label, 10) || RELATIONSHIP_LABELS.OTHER : RELATIONSHIP_LABELS[type];
}

function relationshipGuidance(type: VoiceRelationshipType): string[] {
  if (type === 'CHILD') {
    return ['年龄身份已经给出，只按对应阶段通常具备的理解和表达能力交流；不得据此推断具体性格、兴趣或经历。'];
  }
  if (type === 'PARTNER') return ['保持平等、具体和尊重，不说教。'];
  if (type === 'FRIEND') return ['保持平等、自然和直接，不使用家长式说教。'];
  if (type === 'SELF') return ['帮助用户整理想法，但不声称自己就是用户本人。'];
  return ['保持自然、具体和尊重，根据已确认关系调整交流距离。'];
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
  userLifeStage: UserLifeStage | null;
  background: string;
  relationshipNote: string;
  relationshipType: VoiceRelationshipType;
  relationshipLabel: string;
  userAddress: string;
  addressAlreadyUsed: boolean;
}): string {
  const userAddress = clean(input.userAddress, 10);
  const ageIdentity = input.ageYears === null ? null : resolveAgeIdentity(input.ageYears);
  const profile = [
    '<voice_profile>',
    `人物姓名：${clean(input.voiceName, 40) || '未命名人物'}`,
    ...(input.ageYears === null ? [] : [`准确年龄：${input.ageYears}岁`]),
    ...(input.ageYears === null || input.gender === null ? [] : [`性别身份：${genderLabel(input.ageYears, input.gender)}`]),
    `与用户关系：${relationshipDescription(input.relationshipType, input.relationshipLabel)}`,
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
    ...relationshipGuidance(input.relationshipType),
    '不要把回答写成客服话术、心理咨询总结、教育建议或标准答案。',
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
  const ageYears = Number.isFinite(input.ageYears) && Number(input.ageYears) >= 0 ? Number(input.ageYears) : null;
  const gender = input.gender === 'FEMALE' || input.gender === 'MALE' ? input.gender : null;
  const userLifeStage = ['CHILD', 'TEEN', 'ADULT', 'OLDER_ADULT'].includes(String(input.userLifeStage || ''))
    ? input.userLifeStage as UserLifeStage
    : null;
  const system = input.relationshipType
    ? buildRelationshipSystem({
      voiceName: input.voiceName,
      ageYears,
      gender,
      userLifeStage,
      background: clean(input.background || '', 300),
      relationshipNote: clean(input.relationshipNote || '', 300),
      relationshipType: input.relationshipType,
      relationshipLabel: input.relationshipLabel,
      userAddress,
      addressAlreadyUsed: Boolean(userAddress && chatHistory.some((row) => row.outputText.includes(userAddress))),
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
