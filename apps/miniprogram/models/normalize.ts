import {
  AcceptPreviewResponse,
  ConversationMessage,
  ConversationResponse,
  CreateOrderResponse,
  HomeResponse,
  MessageStatusResponse,
  OrderDetail,
  OrdersResponse,
  PermissionType,
  RelationshipType,
  PointsBalanceResponse,
  PointsLedgersResponse,
  ProductListResponse,
  PreviewResponse,
  PurchaseOption,
  PointsLedgerItem,
  QuotaResponse,
  TrialEligibility,
  UploadPolicyResponse,
  UserProfile,
  VoiceDetail,
  VoiceStatus,
  VoiceSummary,
  VoicesResponse,
  WechatPaymentParams
} from './api'

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function voiceFailureMessage(code: string, message: string): string {
  const messages: Record<string, string> = {
    MULTIPLE_SPEAKERS: '检测到片段中有多个人声，请重新选择只有目标人物单独说话的片段。',
    OVERLAPPING_SPEECH: '检测到多人重叠说话，无法安全提取目标声音，请重新选择片段。',
    SPEAKER_UNCERTAIN: '暂时无法确认片段中是否只有一个人说话，请试听后重新选择更清晰的片段。'
  }
  if (message && message !== code) return message
  return messages[code] || message || code
}

export function normalizeQuota(input: unknown): QuotaResponse {
  const outer = record(input)
  const raw = record(outer.points || outer.quota || input)
  const legacyTrial = numberOr(raw.trialQuotaRemaining ?? raw.trial_quota_remaining, 0)
  const legacyPaid = numberOr(raw.paidQuotaRemaining ?? raw.paid_quota_remaining, 0)
  const explicit = raw.availablePoints ?? raw.available_points ?? raw.balance ?? raw.availableQuota ?? raw.available_quota
  return {
    availablePoints: explicit == null ? legacyTrial + legacyPaid : numberOr(explicit, legacyTrial + legacyPaid),
    trialEligibility: (raw.trialEligibility ?? raw.trial_eligibility) as TrialEligibility | undefined
  }
}

function normalizePermission(value: unknown): PermissionType | undefined {
  const text = stringOr(value).toUpperCase()
  if (text === 'SELF') return 'SELF'
  if (text === 'AUTHORIZED_ADULT' || text === 'OTHER' || text === 'THIRD_PARTY') return 'OTHER'
  if (text === 'MINOR') return 'MINOR'
  return undefined
}

function normalizeRelationship(value: unknown): RelationshipType | undefined {
  const text = stringOr(value).toUpperCase()
  const allowed: RelationshipType[] = [
    'SELF', 'MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'CHILD', 'PARTNER', 'FRIEND', 'OTHER'
  ]
  return allowed.indexOf(text as RelationshipType) >= 0 ? text as RelationshipType : undefined
}

function normalizeVoiceStatus(value: unknown): VoiceStatus {
  const text = stringOr(value, 'DRAFT').toUpperCase()
  const allowed: VoiceStatus[] = [
    'DRAFT', 'UPLOADING', 'QUEUED', 'PROCESSING', 'PREVIEW_READY', 'READY', 'FAILED', 'DELETING', 'DELETED'
  ]
  return allowed.indexOf(text as VoiceStatus) >= 0 ? text as VoiceStatus : 'DRAFT'
}

export function normalizeVoice(input: unknown): VoiceDetail {
  const outer = record(input)
  const raw = record(outer.voice || outer.profile || input)
  const points = normalizeQuota(raw.points || raw.quota || raw)
  const nestedError = record(raw.error || raw.recoverableError || raw.recoverable_error)
  const errorRaw = Object.keys(nestedError).length ? nestedError : {
    code: raw.failureCode ?? raw.failure_code,
    message: raw.failureMessage ?? raw.failure_message,
    recoverable: true
  }
  const errorCode = stringOr(errorRaw.code)
  const errorText = stringOr(errorRaw.message)
  const acceptedAt = stringOr(raw.acceptedAt ?? raw.accepted_at) || undefined
  const rawStatus = normalizeVoiceStatus(raw.status)
  const status: VoiceStatus = rawStatus === 'READY' && !acceptedAt ? 'PREVIEW_READY' : rawStatus
  const previewRetryCount = raw.previewRetryCount == null && raw.preview_retry_count == null
    ? undefined
    : numberOr(raw.previewRetryCount ?? raw.preview_retry_count)
  return {
    id: stringOr(raw.id ?? raw.voiceId ?? raw.voice_id),
    name: stringOr(raw.name ?? raw.displayName ?? raw.display_name, '未命名声音'),
    status,
    permissionType: normalizePermission(raw.permissionType ?? raw.permission_type),
    relationshipType: normalizeRelationship(raw.relationshipType ?? raw.relationship_type),
    relationshipLabel: stringOr(raw.relationshipLabel ?? raw.relationship_label) || undefined,
    userAddress: stringOr(raw.userAddress ?? raw.user_address) || undefined,
    avatarUrl: stringOr(raw.avatarUrl ?? raw.avatar_url) || undefined,
    stageLabel: stringOr(raw.stageLabel ?? raw.stage_label) || undefined,
    conversationStyle: raw.conversationStyle ?? raw.conversation_style,
    lastUsedAt: stringOr(raw.lastUsedAt ?? raw.last_used_at) || undefined,
    updatedAt: stringOr(raw.updatedAt ?? raw.updated_at) || undefined,
    createdAt: stringOr(raw.createdAt ?? raw.created_at) || undefined,
    progress: raw.progress == null ? undefined : Math.max(0, Math.min(100, numberOr(raw.progress))),
    processingStage: stringOr(raw.processingStage ?? raw.processing_stage ?? raw.stage) || undefined,
    previewText: stringOr(raw.previewText ?? raw.preview_text ?? record(raw.preview).text) || undefined,
    previewAudioUrl: stringOr(raw.previewAudioUrl ?? raw.preview_audio_url ?? record(raw.preview).audioUrl ?? record(raw.preview).audio_url) || undefined,
    freeRetryRemaining: raw.freeRetryRemaining == null && raw.free_retry_remaining == null
      ? (previewRetryCount == null ? undefined : Math.max(0, 1 - previewRetryCount))
      : numberOr(raw.freeRetryRemaining ?? raw.free_retry_remaining),
    points,
    quota: points,
    error: (errorRaw.code || errorRaw.message) ? {
      code: errorCode || undefined,
      message: voiceFailureMessage(errorCode, errorText) || undefined,
      recoverable: errorRaw.recoverable !== false
    } : undefined,
    acceptedAt,
    consentVersion: stringOr(raw.consentVersion ?? raw.consent_version) || undefined,
    consentText: stringOr(raw.consentText ?? raw.consent_text) || undefined,
    previewRetryCount,
    trialEligible: raw.trialEligible ?? raw.trial_eligible,
    sourceDurationMs: raw.sourceDurationMs == null && raw.source_duration_ms == null
      ? undefined
      : numberOr(raw.sourceDurationMs ?? raw.source_duration_ms),
    clipStartMs: raw.clipStartMs == null && raw.clip_start_ms == null
      ? undefined
      : numberOr(raw.clipStartMs ?? raw.clip_start_ms),
    clipEndMs: raw.clipEndMs == null && raw.clip_end_ms == null
      ? undefined
      : numberOr(raw.clipEndMs ?? raw.clip_end_ms),
    nextStep: stringOr(raw.nextStep ?? raw.next_step) || undefined
  }
}

export function normalizeHome(input: unknown): HomeResponse {
  const raw = record(input)
  const list = raw.recentVoices ?? raw.recent_voices ?? raw.voices ?? []
  return {
    recentVoices: Array.isArray(list) ? list.map(normalizeVoice).filter(item => item.id && item.status === 'READY').slice(0, 3) : [],
    voiceCount: raw.voiceCount == null && raw.voice_count == null ? undefined : numberOr(raw.voiceCount ?? raw.voice_count),
    trialEligibility: (raw.trialEligibility ?? raw.trial_eligibility) as TrialEligibility | undefined
  }
}

export function normalizeVoices(input: unknown): VoicesResponse {
  const raw = record(input)
  const list = Array.isArray(input) ? input : raw.voices ?? raw.items ?? []
  return {
    voices: Array.isArray(list) ? list.map(normalizeVoice).filter(item => item.id) : [],
    nextCursor: stringOr(raw.nextCursor ?? raw.next_cursor) || undefined
  }
}

export function normalizeUploadPolicy(input: unknown): UploadPolicyResponse {
  const raw = record(record(input).policy || input)
  const method = stringOr(raw.uploadMethod ?? raw.upload_method ?? raw.method, 'POST').toUpperCase()
  const mode = stringOr(raw.mode, method === 'PUT' ? 'signed-put' : 'server-upload')
  return {
    mode: mode === 'signed-put' ? 'signed-put' : 'server-upload',
    uploadUrl: stringOr(raw.uploadUrl ?? raw.upload_url ?? raw.url),
    uploadMethod: method === 'PUT' ? 'PUT' : 'POST',
    fileField: stringOr(raw.fileField ?? raw.file_field ?? raw.fieldName ?? raw.field_name ?? raw.name, 'file'),
    objectKey: stringOr(raw.objectKey ?? raw.object_key ?? raw.key) || undefined,
    mediaId: stringOr(raw.mediaId ?? raw.media_id) || undefined,
    headers: record(raw.headers) as Record<string, string>,
    formData: record(raw.formData ?? raw.form_data ?? raw.fields) as Record<string, string>,
    maxBytes: raw.maxBytes == null && raw.max_bytes == null ? undefined : numberOr(raw.maxBytes ?? raw.max_bytes),
    expiresAt: stringOr(raw.expiresAt ?? raw.expires_at) || undefined
  }
}

export function normalizePreview(input: unknown, voice?: VoiceDetail): PreviewResponse {
  const outer = record(input)
  const raw = record(outer.preview || input)
  return {
    voiceId: stringOr(raw.voiceId ?? raw.voice_id ?? voice?.id),
    audioUrl: stringOr(raw.audioUrl ?? raw.audio_url ?? raw.url ?? raw.signedUrl ?? raw.signed_url ?? voice?.previewAudioUrl),
    text: stringOr(raw.text ?? raw.previewText ?? raw.preview_text ?? voice?.previewText, '你好呀，今天过得怎么样？'),
    durationMs: raw.durationMs == null && raw.duration_ms == null ? undefined : numberOr(raw.durationMs ?? raw.duration_ms),
    trialEligibility: (raw.trialEligibility ?? raw.trial_eligibility ?? voice?.points.trialEligibility ?? voice?.quota.trialEligibility) as TrialEligibility | undefined,
    freeRetryRemaining: raw.freeRetryRemaining == null && raw.free_retry_remaining == null
      ? voice?.freeRetryRemaining
      : numberOr(raw.freeRetryRemaining ?? raw.free_retry_remaining)
  }
}

export function normalizeAcceptPreview(input: unknown): AcceptPreviewResponse {
  const raw = record(input)
  const voice = normalizeVoice(raw.voice || raw)
  return {
    voice,
    points: normalizeQuota(raw.points || raw.quota || voice.points || voice.quota),
    quota: normalizeQuota(raw.points || raw.quota || voice.points || voice.quota),
    trialGranted: Boolean(raw.trialGranted ?? raw.trial_granted)
  }
}

export function normalizeMessage(input: unknown): ConversationMessage {
  const raw = record(input)
  const roleText = stringOr(raw.role, 'ASSISTANT').toUpperCase()
  const modeText = stringOr(raw.mode, 'CHAT').toUpperCase()
  const statusText = stringOr(raw.status, 'READY').toUpperCase()
  const audio = record(raw.audio || raw.output)
  return {
    id: stringOr(raw.id ?? raw.messageId ?? raw.message_id),
    role: roleText === 'USER' ? 'USER' : 'ASSISTANT',
    mode: modeText === 'EXACT_TTS' || modeText === 'EXACT_SPEECH' || modeText === 'EXACT' ? 'EXACT_TTS' : 'CHAT',
    status: (['PENDING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED'].indexOf(statusText) >= 0 ? statusText : 'READY') as any,
    text: stringOr(raw.text ?? raw.content ?? raw.outputText ?? raw.output_text ?? raw.inputText ?? raw.input_text),
    audioUrl: stringOr(raw.audioUrl ?? raw.audio_url ?? raw.signedAudioUrl ?? raw.signed_audio_url ?? audio.url ?? audio.audioUrl) || undefined,
    durationMs: raw.durationMs == null && raw.duration_ms == null && audio.durationMs == null
      ? undefined
      : numberOr(raw.durationMs ?? raw.duration_ms ?? audio.durationMs),
    createdAt: stringOr(raw.createdAt ?? raw.created_at) || undefined,
    failureCode: stringOr(raw.failureCode ?? raw.failure_code ?? raw.errorCode ?? raw.error_code) || undefined
  }
}

export function normalizeConversation(input: unknown): ConversationResponse {
  const raw = record(input)
  const conversation = record(raw.conversation)
  const list = raw.messages ?? conversation.messages ?? []
  return {
    conversationId: stringOr(raw.conversationId ?? raw.conversation_id ?? conversation.id) || undefined,
    messages: Array.isArray(list) ? list.map(normalizeMessage).filter(item => item.id || item.text) : [],
    points: raw.points || raw.quota ? normalizeQuota(raw.points || raw.quota) : undefined,
    quota: raw.points || raw.quota ? normalizeQuota(raw.points || raw.quota) : undefined
  }
}

export function normalizeMessageStatus(input: unknown): MessageStatusResponse {
  const raw = record(input)
  const messageRaw = raw.message ? record(raw.message) : raw
  const message = normalizeMessage(messageRaw)
  return {
    messageId: stringOr(raw.messageId ?? raw.message_id ?? message.id),
    status: message.status,
    text: stringOr(raw.text ?? message.text) || undefined,
    audioUrl: stringOr(raw.audioUrl ?? raw.audio_url ?? message.audioUrl) || undefined,
    durationMs: raw.durationMs == null && raw.duration_ms == null ? message.durationMs : numberOr(raw.durationMs ?? raw.duration_ms),
    failureCode: stringOr(raw.failureCode ?? raw.failure_code ?? raw.errorCode ?? raw.error_code ?? message.failureCode) || undefined,
    message,
    points: raw.points || raw.quota ? normalizeQuota(raw.points || raw.quota) : undefined,
    quota: raw.points || raw.quota ? normalizeQuota(raw.points || raw.quota) : undefined
  }
}

export function normalizePurchaseOption(input: unknown): PurchaseOption | undefined {
  const raw = record(input)
  const productCode = raw.productCode ?? raw.product_code
  const amountFen = raw.amountFen ?? raw.amount_fen
  const points = raw.points ?? raw.point_count ?? raw.balance ?? raw.quota
  const autoRenew = raw.autoRenew ?? raw.auto_renew
  if (!productCode || amountFen == null || points == null || autoRenew == null) return undefined
  return {
    productCode: stringOr(productCode),
    amountFen: numberOr(amountFen),
    points: numberOr(points),
    quota: numberOr(raw.quota ?? points),
    autoRenew: Boolean(autoRenew),
    title: stringOr(raw.title ?? raw.name) || undefined,
    description: stringOr(raw.description ?? raw.desc) || undefined
  }
}

export function normalizeOrder(input: unknown): OrderDetail {
  const raw = record(record(input).order || input)
  return {
    id: stringOr(raw.id ?? raw.orderId ?? raw.order_id),
    voiceId: stringOr(raw.voiceId ?? raw.voice_id ?? raw.voiceProfileId ?? raw.voice_profile_id) || undefined,
    productCode: stringOr(raw.productCode ?? raw.product_code) || undefined,
    amountFen: raw.amountFen == null && raw.amount_fen == null ? undefined : numberOr(raw.amountFen ?? raw.amount_fen),
    points: raw.points == null && raw.point_count == null && raw.quota == null ? undefined : numberOr(raw.points ?? raw.point_count ?? raw.quota),
    quota: raw.quota == null ? undefined : numberOr(raw.quota),
    status: stringOr(raw.status, 'CREATED').toUpperCase() as any,
    pointsGranted: Boolean(raw.pointsGranted ?? raw.points_granted ?? raw.pointsGrantedAt ?? raw.points_granted_at ?? raw.quotaGranted ?? raw.quota_granted),
    pointsGrantedAt: stringOr(raw.pointsGrantedAt ?? raw.points_granted_at ?? raw.quotaGrantedAt ?? raw.quota_granted_at) || undefined,
    quotaGranted: Boolean(raw.quotaGranted ?? raw.quota_granted ?? raw.quotaGrantedAt ?? raw.quota_granted_at),
    quotaGrantedAt: stringOr(raw.quotaGrantedAt ?? raw.quota_granted_at) || undefined,
    createdAt: stringOr(raw.createdAt ?? raw.created_at) || undefined,
    paidAt: stringOr(raw.paidAt ?? raw.paid_at) || undefined
  }
}

function normalizePayment(input: unknown): WechatPaymentParams {
  const raw = record(input)
  return {
    timeStamp: stringOr(raw.timeStamp ?? raw.timestamp),
    nonceStr: stringOr(raw.nonceStr ?? raw.nonce_str),
    package: stringOr(raw.package),
    signType: stringOr(raw.signType ?? raw.sign_type, 'RSA'),
    paySign: stringOr(raw.paySign ?? raw.pay_sign)
  }
}

export function normalizeCreateOrder(input: unknown): CreateOrderResponse {
  const raw = record(input)
  return {
    order: normalizeOrder(raw.order || raw),
    payment: normalizePayment(raw.payment ?? raw.paymentParams ?? raw.payment_params ?? raw.jsapi)
  }
}

export function normalizeOrders(input: unknown): OrdersResponse {
  const raw = record(input)
  const list = Array.isArray(input) ? input : raw.orders ?? raw.items ?? []
  return { orders: Array.isArray(list) ? list.map(normalizeOrder).filter(item => item.id) : [] }
}

export function normalizeQuotaLedgers(input: unknown): PointsLedgersResponse {
  const raw = record(input)
  const list = Array.isArray(input) ? input : raw.ledgers ?? raw.items ?? []
  const ledgers: PointsLedgerItem[] = Array.isArray(list) ? list.map(item => {
    const row = record(item)
    return {
      id: stringOr(row.id),
      voiceId: stringOr(row.voiceId ?? row.voice_id) || undefined,
      voiceName: stringOr(row.voiceName ?? row.voice_name) || undefined,
      type: stringOr(row.type) || undefined,
      amount: numberOr(row.amount),
      balanceAfter: row.balanceAfter == null && row.balance_after == null && row.availablePointsAfter == null && row.available_points_after == null
        ? undefined
        : numberOr(row.balanceAfter ?? row.balance_after ?? row.availablePointsAfter ?? row.available_points_after),
      createdAt: stringOr(row.createdAt ?? row.created_at) || undefined
    }
  }).filter(item => item.id) : []
  return { ledgers }
}

export function normalizeProducts(input: unknown): ProductListResponse {
  const raw = record(input)
  const list = Array.isArray(input) ? input : raw.products ?? raw.items ?? raw.list ?? []
  return {
    products: Array.isArray(list) ? list.map(normalizePurchaseOption).filter(Boolean) as PurchaseOption[] : []
  }
}

export function normalizeUser(input: unknown): UserProfile {
  const raw = record(record(input).user || input)
  return {
    id: stringOr(raw.id),
    nickname: stringOr(raw.nickname ?? raw.nickName ?? raw.name) || undefined,
    avatarUrl: stringOr(raw.avatarUrl ?? raw.avatar_url ?? raw.avatar) || undefined,
    status: stringOr(raw.status) || undefined
  }
}
