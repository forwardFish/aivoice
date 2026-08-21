import type { PermissionType } from '@aivoice/contracts';

export const CONSENT_VERSION = 'voice-consent-v0.4';

export const CONSENT_TEXT: Record<PermissionType, string> = Object.freeze({
  SELF: '我同意使用我的声音样本创建私有 AI 声音。',
  OTHER: '我已告知声音本人，并取得其对声音克隆和 AI 合成使用的明确同意。',
  MINOR: '我是该未成年人的监护人，或已取得其监护人的明确授权。',
});
