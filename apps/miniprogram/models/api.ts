export type PermissionType = 'SELF' | 'OTHER' | 'MINOR'

export type VoiceStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'PREVIEW_READY'
  | 'READY'
  | 'FAILED'
  | 'DELETING'
  | 'DELETED'

export type ConversationStyle = 'NATURAL' | 'GENTLE' | 'LIVELY' | 'CALM'
export type TrialEligibility = 'ELIGIBLE' | 'GRANTED' | 'AVAILABLE' | 'UNUSED' | 'USED' | 'BOUND' | 'INELIGIBLE'
export type MessageStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'BLOCKED'
export type MessageMode = 'CHAT' | 'EXACT_TTS'
export type MessageRole = 'USER' | 'ASSISTANT'
export type OrderStatus = 'PENDING' | 'CREATED' | 'PAYING' | 'PAID' | 'CLOSED' | 'REFUNDING' | 'REFUNDED'

export interface UserProfile {
  id: string
  nickname?: string
  avatarUrl?: string
  status?: string
}

export interface AuthWechatRequest {
  code: string
  profile?: {
    nickname?: string
    avatarUrl?: string
  }
}

export interface AuthWechatResponse {
  token: string
  user: UserProfile
  trialEligibility?: TrialEligibility
}

export interface QuotaResponse {
  trialQuotaRemaining: number
  paidQuotaRemaining: number
  availableQuota: number
  trialEligibility?: TrialEligibility
}

export interface RecoverableVoiceError {
  code?: string
  message?: string
  recoverable?: boolean
}

export interface VoiceSummary {
  id: string
  name: string
  status: VoiceStatus
  permissionType?: PermissionType
  avatarUrl?: string
  stageLabel?: string
  conversationStyle?: ConversationStyle
  lastUsedAt?: string
  updatedAt?: string
  createdAt?: string
  progress?: number
  processingStage?: string
  previewText?: string
  previewAudioUrl?: string
  freeRetryRemaining?: number
  quota: QuotaResponse
  error?: RecoverableVoiceError
}

export interface VoiceDetail extends VoiceSummary {
  acceptedAt?: string
  consentVersion?: string
  consentText?: string
  previewRetryCount?: number
  trialEligible?: boolean
  sourceDurationMs?: number
  clipStartMs?: number
  clipEndMs?: number
  nextStep?: string
}

export interface HomeResponse {
  recentVoices: VoiceSummary[]
  voiceCount?: number
  trialEligibility?: TrialEligibility
}

export interface VoicesResponse {
  voices: VoiceSummary[]
  nextCursor?: string
}

export interface CreateVoiceResponse {
  voice: VoiceDetail
}

export interface UploadPolicyResponse {
  uploadUrl: string
  fileField?: string
  objectKey?: string
  mediaId?: string
  headers?: Record<string, string>
  formData?: Record<string, string>
}

export interface UploadResult {
  objectKey?: string
  mediaId?: string
  etag?: string
}

export interface PreviewResponse {
  voiceId: string
  audioUrl: string
  text: string
  durationMs?: number
  trialEligibility?: TrialEligibility
  freeRetryRemaining?: number
}

export interface AcceptPreviewResponse {
  voice: VoiceDetail
  quota: QuotaResponse
  trialGranted?: boolean
}

export interface ConversationMessage {
  id: string
  role: MessageRole
  mode: MessageMode
  status: MessageStatus
  text: string
  audioUrl?: string
  durationMs?: number
  createdAt?: string
  failureCode?: string
}

export interface ConversationResponse {
  conversationId?: string
  messages: ConversationMessage[]
  quota?: QuotaResponse
}

export interface GenerationAcceptedResponse {
  messageId: string
  status: 'PROCESSING'
}

export interface MessageStatusResponse {
  messageId: string
  status: MessageStatus
  text?: string
  audioUrl?: string
  durationMs?: number
  failureCode?: string
  message?: ConversationMessage
  quota?: QuotaResponse
}

export interface PurchaseOption {
  productCode: 'VOICE_QUOTA_10' | string
  amountFen: number
  quota: number
  autoRenew: boolean
}

export interface WechatPaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}

export interface CreateOrderResponse {
  order: OrderDetail
  payment: WechatPaymentParams
}

export interface OrderDetail {
  id: string
  voiceId?: string
  productCode?: string
  amountFen?: number
  quota?: number
  status: OrderStatus
  quotaGranted?: boolean
  quotaGrantedAt?: string
  createdAt?: string
  paidAt?: string
}

export interface OrdersResponse {
  orders: OrderDetail[]
}

export interface QuotaLedgerItem {
  id: string
  voiceId?: string
  voiceName?: string
  bucket?: 'TRIAL' | 'PAID'
  type?: string
  amount: number
  trialBalanceAfter?: number
  paidBalanceAfter?: number
  balanceAfter?: number
  createdAt?: string
}

export interface QuotaLedgersResponse {
  ledgers: QuotaLedgerItem[]
}

export interface MeResponse {
  user: UserProfile
  trialEligibility?: TrialEligibility
  voiceCount?: number
}

export interface ApiErrorBody {
  code?: string
  message?: string
  purchaseOption?: PurchaseOption
  details?: unknown
}
