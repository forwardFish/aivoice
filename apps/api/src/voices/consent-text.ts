import type { PermissionType } from '@aivoice/contracts';

export const CONSENT_VERSION = 'voice-consent-v0.5';

export const CONSENT_TEXT: Record<PermissionType, string> = Object.freeze({
  SELF: '我同意将我的声音样本交由那年的TA及火山引擎处理，用于生成仅限当前账户使用的私有 AI 声音。',
  OTHER: '我已告知声音本人，并取得其对声音样本交由那年的TA及火山引擎处理、用于 AI 语音生成的明确同意。',
  MINOR: '我是该未成年人的监护人，或已取得其监护人的明确授权，并同意将其声音样本交由那年的TA及火山引擎处理，用于 AI 语音生成。',
});
