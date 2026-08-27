export const POINTS_PRODUCT_DEFAULTS = Object.freeze({
  productCode: 'POINTS_50',
  amountFen: 990,
  points: 50,
  validityDays: 180,
  autoRenew: false,
});

/** @deprecated Compatibility alias for older mini-program builds. */
export const VOICE_QUOTA_PRODUCT = Object.freeze({
  ...POINTS_PRODUCT_DEFAULTS,
  quota: POINTS_PRODUCT_DEFAULTS.points,
});

export const ERROR_CODES = [
  'UNAUTHORIZED',
  'INVALID_MEDIA',
  'CLIP_TOO_SHORT',
  'CLIP_TOO_LONG',
  'AUDIO_DECODE_FAILED',
  'NO_VALID_SPEECH',
  'LOW_VOLUME',
  'TOO_MUCH_SILENCE',
  'VOICE_REJECTED',
  'CONSENT_REQUIRED',
  'VOICE_NOT_READY',
  'PREVIEW_NOT_PLAYED',
  'PREVIEW_RETRY_EXHAUSTED',
  'GENERATION_IN_PROGRESS',
  'QUOTA_EXHAUSTED',
  'POINTS_EXHAUSTED',
  'CONTENT_BLOCKED',
  'PROVIDER_FAILED',
  'ORDER_NOT_FOUND',
  'PAYMENT_MISMATCH',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof ERROR_CODES)[number];
export type PermissionType = 'SELF' | 'OTHER' | 'MINOR';
export type RelationshipType =
  | 'SELF'
  | 'MOTHER'
  | 'FATHER'
  | 'GRANDMOTHER'
  | 'GRANDFATHER'
  | 'CHILD'
  | 'PARTNER'
  | 'FRIEND'
  | 'OTHER';
export type TrialEligibility = 'ELIGIBLE' | 'GRANTED' | 'USED';
export type VoiceStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'DELETING'
  | 'DELETED';
export type MessageStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'BLOCKED';

export interface QuotaView {
  trialQuotaRemaining: number;
  paidQuotaRemaining: number;
  availableQuota: number;
  trialEligibility: TrialEligibility;
}

export interface PointsProduct {
  productCode: string;
  amountFen: number;
  points: number;
  validityDays: number;
  autoRenew: false;
}

export interface PointsView {
  balance: number;
  availablePoints: number;
  generationCost: number;
  signupBonusPoints: number;
  purchaseOption: PointsProduct;
}

export interface PurchaseOption {
  productCode: string;
  amountFen: number;
  points: number;
  validityDays: number;
  /** @deprecated Use points. */
  quota?: number;
  autoRenew: false;
}

export interface QuotaExhaustedResponse {
  code: 'QUOTA_EXHAUSTED';
  purchaseOption: PurchaseOption;
}

export interface PointsExhaustedResponse {
  code: 'POINTS_EXHAUSTED';
  availablePoints: number;
  generationCost: number;
  purchaseOption: PointsProduct;
}

export interface WechatLoginRequest {
  code: string;
  profile?: {
    nickname?: string;
    avatarUrl?: string;
  };
}

export interface GenerationAcceptedResponse {
  messageId: string;
  status: 'PROCESSING';
}

export interface ContentSafetyResult {
  safe: boolean;
  reason?: string;
}

const CONTENT_SAFETY_RULES: ReadonlyArray<{ reason: string; pattern: RegExp }> = [
  { reason: 'VERIFICATION_CODE', pattern: /(验证码|短信码|动态码|支付码|取件码).{0,6}\d{4,8}/u },
  { reason: 'LARGE_NUMBER_SEQUENCE', pattern: /\d{10,}/u },
  { reason: 'FINANCIAL_OPERATION', pattern: /转账|汇款|借款|贷款|收款码|银行卡|中奖|提现|打款/u },
  { reason: 'IMPERSONATION', pattern: /(我是|这里是|代表).{0,8}(客服|公安|警察|法院|检察院|银行|税务|政府)/u },
  { reason: 'IDENTITY_VERIFICATION', pattern: /身份验证|身份核验|声纹验证|刷脸验证|验证本人|财产操作/u },
  { reason: 'MARKETING', pattern: /限时优惠|扫码购买|加微信|代理招商|全网最低|点击链接/u },
  { reason: 'SEXUAL_OR_VIOLENT', pattern: /色情|裸聊|强奸|杀人|绑架|爆炸物|制作炸弹/u },
  { reason: 'ILLEGAL_OR_EXTREMIST', pattern: /贩毒|洗钱|恐怖袭击|极端组织/u },
  { reason: 'SELF_HARM', pattern: /自杀|自残|不想活|结束生命/u },
  { reason: 'PUBLIC_FIGURE_IMPERSONATION', pattern: /(冒充|模仿).{0,8}(明星|演员|歌手|主播|公众人物|领导人)/u },
];

export function evaluateContentSafety(text: string): ContentSafetyResult {
  const normalized = text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  for (const rule of CONTENT_SAFETY_RULES) {
    if (rule.pattern.test(normalized)) return { safe: false, reason: rule.reason };
  }
  return { safe: true };
}

const FORBIDDEN_ASSISTANT_IDENTITY_DISCLOSURE = /A[\s._\-·]*I|人工智能|机器人|智能助手|虚拟助手|(?:语言|大)模型|没有真实(?:的)?(?:经历|情绪|感受|生活)|不具备真实(?:的)?(?:经历|情绪|感受|生活)|没法真的|无法真的/iu;

/**
 * Generated assistant replies must never disclose or explain a machine identity.
 * User-authored input is intentionally not checked by this function.
 */
export function hasForbiddenAssistantIdentityDisclosure(text: string): boolean {
  const normalized = String(text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .trim();
  return FORBIDDEN_ASSISTANT_IDENTITY_DISCLOSURE.test(normalized);
}
