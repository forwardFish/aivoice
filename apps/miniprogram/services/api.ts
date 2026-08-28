import {
  API_BASE_URL,
  API_PREFIX,
  CLOUDBASE_API_TRANSPORT,
  CLOUDBASE_ENV_ID,
  CLOUDBASE_HTTP_FUNCTION_NAME,
  CLOUDBASE_RUN_ENV_ID,
  CLOUDBASE_RUN_SERVICE_NAME,
  LOCAL_DEV_MODE,
  PURE_CLOUD_MODE,
  REQUEST_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS
} from '../config'
import {
  AcceptPreviewResponse,
  AuthWechatRequest,
  AuthWechatResponse,
  ConversationResponse,
  CreateOrderResponse,
  GenerationAcceptedResponse,
  HomeResponse,
  MeResponse,
  MessageStatusResponse,
  OrderDetail,
  OrdersResponse,
  PermissionType,
  PaymentParams,
  PointsBalanceResponse,
  PointsLedgersResponse,
  ProductListResponse,
  PreviewResponse,
  PurchaseOption,
  UploadPolicyResponse,
  UploadResult,
  UserProfile,
  VoiceDetail,
  VoicesResponse,
} from '../models/api'
import {
  normalizeAcceptPreview,
  normalizeConversation,
  normalizeCreateOrder,
  normalizeHome,
  normalizeMessageStatus,
  normalizeOrder,
  normalizeOrders,
  normalizeProducts,
  normalizePreview,
  normalizePurchaseOption,
  normalizeQuota,
  normalizeQuotaLedgers,
  normalizeUploadPolicy,
  normalizeUser,
  normalizeVoice,
  normalizeVoices
} from '../models/normalize'
import { clearAuth, getToken, setPostLoginRoute } from '../utils/storage'
import { uuidV4 } from '../utils/uuid'
import { cloudEnvConfig, getCloudClient } from './cloud-client'

export class ApiError extends Error {
  statusCode: number
  code: string
  data: Record<string, any>
  purchaseOption?: PurchaseOption
  isPaymentCancel?: boolean

  constructor(message: string, options: {
    statusCode?: number
    code?: string
    data?: Record<string, any>
    purchaseOption?: PurchaseOption
  } = {}) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = options.statusCode || 0
    this.code = options.code || 'INTERNAL_ERROR'
    this.data = options.data || {}
    this.purchaseOption = options.purchaseOption
  }
}

interface RequestOptions {
  path: string
  method?: string
  data?: unknown
  headers?: Record<string, string>
  auth?: boolean
  timeout?: number
}

function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL.replace(/\/+$/, '')}${API_PREFIX}${normalized}`
}

function errorMessage(code: string, fallback = ''): string {
  const messages: Record<string, string> = {
    UNAUTHORIZED: '登录状态已失效，请重新登录。',
    INVALID_MEDIA: '视频信息无效，请重新选择。',
    VIDEO_TOO_SHORT: '视频不足 8 秒，请更换视频。',
    VIDEO_TOO_LONG: '视频超过 60 秒，请先在相册中裁短。',
    VIDEO_TOO_LARGE: '视频文件过大，请裁短或压缩后重试。',
    CLIP_TOO_SHORT: '声音片段至少需要 8 秒。',
    CLIP_TOO_LONG: '声音片段最长为 20 秒。',
    AUDIO_DECODE_FAILED: '无法解码这段声音，请更换视频或片段。',
    NO_VALID_SPEECH: '有效人声不足 8 秒，请选择更清晰的片段。',
    LOW_VOLUME: '片段音量过低，请选择声音更清楚的片段。',
    TOO_MUCH_SILENCE: '片段静音过多，请重新选择说话更连续的片段。',
    MULTIPLE_SPEAKERS: '检测到片段中有多个人声，请重新选择只有目标人物单独说话的片段。',
    OVERLAPPING_SPEECH: '检测到多人重叠说话，无法安全提取目标声音，请重新选择片段。',
    SPEAKER_UNCERTAIN: '暂时无法确认片段中是否只有一个人说话，请试听后重新选择更清晰的片段。',
    VOICE_REJECTED: '声音质量未通过，请免费换一段重试。',
    CONSENT_REQUIRED: '请先确认声音使用授权。',
    VOICE_NOT_READY: '声音仍在处理中，请稍后再试。',
    PREVIEW_NOT_PLAYED: '请先完整播放当前试听。',
    PREVIEW_RETRY_EXHAUSTED: '本次免费重试机会已使用。',
    GENERATION_IN_PROGRESS: '当前声音已有生成任务，请等待完成。',
    POINTS_EXHAUSTED: '当前积分不足，请先购买积分。',
    QUOTA_EXHAUSTED: '当前积分不足，请先购买积分。',
    CONTENT_BLOCKED: '这段内容不符合使用规则，请修改后重试。',
    PROVIDER_FAILED: '声音服务暂时不可用，本次不会扣积分。',
    ORDER_NOT_FOUND: '订单不存在或已失效。',
    PAYMENT_MISMATCH: '支付信息校验失败，请联系客服。',
    PAYMENT_PENDING: '支付结果正在确认，请稍候。',
    PAYMENT_PAID_QUOTA_PENDING: '已支付，积分正在入账，请稍候。',
    INTERNAL_ERROR: '服务暂时不可用，请稍后重试。'
  }
  return fallback || messages[code] || '请求失败，请稍后重试。'
}

function bodyRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

function transportErrorText(error: any): string {
  const raw = String(error?.errMsg || error?.message || '').trim()
  if (/failed to fetch|network|request:fail|timeout|timed out|abort/i.test(raw)) {
    return '网络连接失败，请检查网络后重试。'
  }
  return raw || '网络连接失败，请检查网络后重试。'
}

function isCloudTransportFailure(error: any): boolean {
  const raw = String(error?.errMsg || error?.message || '')
  return /failed to fetch|network|request:fail|timeout|timed out|abort/i.test(raw)
}

function isDevToolsRuntime(): boolean {
  try {
    return typeof (wx as any).getDeviceInfo === 'function'
      && String((wx as any).getDeviceInfo()?.platform || '').toLowerCase() === 'devtools'
  } catch (_error) {
    return false
  }
}

function unauthorizedRedirect(): void {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  if (current && current.route && current.route !== 'pages/login/index') {
    const options = current.options || {}
    const query = Object.keys(options)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
      .join('&')
    setPostLoginRoute(`/${current.route}${query ? `?${query}` : ''}`)
  }
  clearAuth()
  if (current && current.route === 'pages/login/index') return
  wx.reLaunch({ url: '/pages/login/index' })
}

export function requestRaw<T = any>(options: RequestOptions): Promise<T> {
  const useAuth = options.auth !== false
  const token = getToken()
  if (useAuth && !token) {
    unauthorizedRedirect()
    return Promise.reject(new ApiError('请先登录。', { statusCode: 401, code: 'UNAUTHORIZED' }))
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers || {})
  }
  if (useAuth && token) headers.Authorization = `Bearer ${token}`

  return new Promise((resolve, reject) => {
    const requestOptions: Record<string, any> = {
      method: options.method || 'GET',
      data: options.data,
      header: headers,
      timeout: options.timeout || REQUEST_TIMEOUT_MS,
      success(response: any) {
        const statusCode = Number(response.statusCode || 0)
        const data = response.data
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data as T)
          return
        }
        const body = bodyRecord(data)
        const code = String(body.code || (statusCode === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR'))
        if (statusCode === 401 || code === 'UNAUTHORIZED') unauthorizedRedirect()
        reject(new ApiError(errorMessage(code, String(body.message || '')), {
          statusCode,
          code,
          data: body,
          purchaseOption: normalizePurchaseOption(body.purchaseOption || body.purchase_option)
        }))
      },
      fail(error: any) {
        reject(new ApiError(transportErrorText(error), {
          statusCode: 0,
          code: 'NETWORK_ERROR',
          data: bodyRecord(error)
        }))
      }
    }
    if (PURE_CLOUD_MODE) {
      const normalized = options.path.startsWith('/') ? options.path : `/${options.path}`
      const method = String(requestOptions.method || 'GET').toUpperCase()
      if (method === 'GET' && isDevToolsRuntime() && typeof wx.request === 'function') {
        wx.request({ ...requestOptions, url: apiUrl(options.path) })
        return
      }
      const targetEnv = CLOUDBASE_API_TRANSPORT === 'container' ? CLOUDBASE_RUN_ENV_ID : CLOUDBASE_ENV_ID
      void getCloudClient(targetEnv).then((binding) => {
        const cloud = binding.client
        if (CLOUDBASE_API_TRANSPORT === 'container') {
          if (typeof cloud.callContainer !== 'function') {
            reject(new ApiError('当前微信基础库不支持云托管私有调用，请升级微信后重试。', {
              code: 'CLOUD_CONTAINER_UNAVAILABLE'
            }))
            return
          }
          cloud.callContainer({
            ...requestOptions,
            ...cloudEnvConfig(binding),
            path: `${API_PREFIX}${normalized}`,
            header: {
              ...headers,
              'X-WX-SERVICE': CLOUDBASE_RUN_SERVICE_NAME
            }
          })
          return
        }
        if (typeof cloud.callFunction !== 'function') {
          reject(new ApiError('当前微信基础库不支持云函数调用，请升级微信后重试。', {
            code: 'CLOUD_FUNCTION_UNAVAILABLE'
          }))
          return
        }
        cloud.callFunction({
          ...cloudEnvConfig(binding),
          name: CLOUDBASE_HTTP_FUNCTION_NAME,
          data: {
            path: `${API_PREFIX}${normalized}`,
            method: requestOptions.method,
            data: requestOptions.data,
            headers,
          },
          success(result: any) {
            requestOptions.success(result.result || {})
          },
          fail(error: any) {
            if (method === 'GET' && isCloudTransportFailure(error) && typeof wx.request === 'function') {
              wx.request({ ...requestOptions, url: apiUrl(options.path) })
              return
            }
            requestOptions.fail(error)
          },
        })
      }).catch((error: any) => {
        reject(new ApiError(error?.message || '共享云环境初始化失败，请稍后重试。', {
          code: 'CLOUD_FUNCTION_UNAVAILABLE'
        }))
      })
      return
    }
    wx.request({ ...requestOptions, url: apiUrl(options.path) })
  })
}

export function requestPayment(payment: PaymentParams): Promise<void> {
  if (payment.kind === 'VIRTUAL') {
    return new Promise((resolve, reject) => {
      if (typeof (wx as any).requestVirtualPayment !== 'function') {
        reject(new ApiError('当前微信版本不支持小程序虚拟支付，请升级微信后重试。', {
          code: 'VIRTUAL_PAYMENT_UNAVAILABLE'
        }))
        return
      }
      ;(wx as any).requestVirtualPayment({
        signData: payment.signData,
        paySig: payment.paySig,
        signature: payment.signature,
        mode: payment.mode,
        success: () => resolve(),
        fail: (error: any) => {
          const message = error.errMsg || error.message || '支付未完成。'
          const canceled = Number(error.errCode) === -2 || /cancel/i.test(message)
          const apiError = new ApiError(message, { code: canceled ? 'PAYMENT_CANCELLED' : 'PAYMENT_FAILED' })
          apiError.isPaymentCancel = canceled
          reject(apiError)
        }
      })
    })
  }
  if (LOCAL_DEV_MODE && /^prepay_id=mock-prepay-/i.test(String(payment.package || ''))) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...payment,
      success: () => resolve(),
      fail: (error: any) => {
        const message = error.errMsg || error.message || '支付未完成。'
        const apiError = new ApiError(message, { code: /cancel/i.test(message) ? 'PAYMENT_CANCELLED' : 'PAYMENT_FAILED' })
        apiError.isPaymentCancel = /cancel/i.test(message)
        reject(apiError)
      }
    })
  })
}

export function uploadToPolicy(options: {
  policy: UploadPolicyResponse
  filePath: string
  onProgress?: (progress: number) => void
}): Promise<UploadResult> {
  const { policy, filePath, onProgress } = options
  if (policy.mode === 'cloud-file') {
    return uploadToCloudFile(policy, filePath, onProgress)
  }
  if (!policy.uploadUrl) {
    return Promise.reject(new ApiError('上传凭证缺少上传地址。', { code: 'INVALID_UPLOAD_POLICY' }))
  }
  if (policy.mode === 'signed-put' || policy.uploadMethod === 'PUT') {
    return uploadToSignedPut(policy, filePath, onProgress)
  }
  return new Promise((resolve, reject) => {
    const uploadHeaders: Record<string, string> = { ...(policy.headers || {}) }
    const token = getToken()
    if (token && policy.uploadUrl.indexOf(API_BASE_URL) === 0) {
      uploadHeaders.Authorization = `Bearer ${token}`
    }
    const task = wx.uploadFile({
      url: policy.uploadUrl,
      filePath,
      name: policy.fileField || 'file',
      formData: policy.formData || {},
      header: uploadHeaders,
      timeout: UPLOAD_TIMEOUT_MS,
      success(response: any) {
        const statusCode = Number(response.statusCode || 0)
        if (statusCode < 200 || statusCode >= 300) {
          reject(new ApiError(`视频上传失败（HTTP ${statusCode}）。`, {
            statusCode,
            code: 'UPLOAD_FAILED'
          }))
          return
        }
        let payload: Record<string, any> = {}
        if (response.data) {
          try {
            payload = typeof response.data === 'string' ? JSON.parse(response.data) : bodyRecord(response.data)
          } catch (_error) {
            payload = {}
          }
        }
        resolve({
          objectKey: String(payload.objectKey || payload.object_key || payload.key || policy.objectKey || '') || undefined,
          mediaId: String(payload.mediaId || payload.media_id || policy.mediaId || '') || undefined,
          etag: String(payload.etag || payload.ETag || '') || undefined
        })
      },
      fail(error: any) {
        reject(new ApiError(error.errMsg || error.message || '视频上传失败，请重试。', {
          code: 'UPLOAD_FAILED',
          data: bodyRecord(error)
        }))
      }
    })
    if (task && typeof task.onProgressUpdate === 'function' && onProgress) {
      task.onProgressUpdate((event: any) => onProgress(Math.max(0, Math.min(100, Number(event.progress || 0)))))
    }
  })
}

function uploadToCloudFile(
  policy: UploadPolicyResponse,
  filePath: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    void getCloudClient(CLOUDBASE_ENV_ID).then((binding) => {
      const cloud = binding.client
      if (!cloud || typeof cloud.uploadFile !== 'function' || !policy.cloudPath) {
        reject(new ApiError('云存储上传能力不可用。', { code: 'CLOUD_STORAGE_UNAVAILABLE' }))
        return
      }
      const task = cloud.uploadFile({
        cloudPath: policy.cloudPath,
        filePath,
        ...cloudEnvConfig(binding),
        success(result: any) {
          const fileID = String(result.fileID || result.fileId || '')
          if (!fileID.startsWith('cloud://')) {
            reject(new ApiError('云存储未返回有效文件标识。', { code: 'UPLOAD_FAILED' }))
            return
          }
          onProgress?.(100)
          resolve({ objectKey: fileID, mediaId: policy.mediaId })
        },
        fail(error: any) {
          reject(new ApiError(error.errMsg || error.message || '视频上传失败，请重试。', {
            code: 'UPLOAD_FAILED',
            data: bodyRecord(error)
          }))
        }
      })
      if (task && typeof task.onProgressUpdate === 'function' && onProgress) {
        task.onProgressUpdate((event: any) => onProgress(Math.max(0, Math.min(100, Number(event.progress || 0)))))
      }
    }).catch((error: any) => {
      reject(new ApiError(error?.message || '共享云环境初始化失败，请稍后重试。', {
        code: 'CLOUD_STORAGE_UNAVAILABLE'
      }))
    })
  })
}

function uploadToSignedPut(
  policy: UploadPolicyResponse,
  filePath: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    onProgress?.(1)
    wx.getFileSystemManager().readFile({
      filePath,
      success(file: any) {
        const data = file && file.data
        const bytes = data && typeof data.byteLength === 'number' ? Number(data.byteLength) : 0
        if (!data || bytes <= 0) {
          reject(new ApiError('无法读取待上传视频。', { code: 'INVALID_MEDIA' }))
          return
        }
        if (policy.maxBytes && bytes > policy.maxBytes) {
          reject(new ApiError('视频文件过大，请裁短或压缩后重试。', { code: 'VIDEO_TOO_LARGE' }))
          return
        }
        onProgress?.(10)
        wx.request({
          url: policy.uploadUrl,
          method: 'PUT',
          data,
          header: { ...(policy.headers || {}) },
          timeout: UPLOAD_TIMEOUT_MS,
          success(response: any) {
            const statusCode = Number(response.statusCode || 0)
            if (statusCode < 200 || statusCode >= 300) {
              reject(new ApiError(`视频上传失败（HTTP ${statusCode}）。`, {
                statusCode,
                code: 'UPLOAD_FAILED'
              }))
              return
            }
            onProgress?.(100)
            const headers = bodyRecord(response.header)
            resolve({
              objectKey: policy.objectKey,
              mediaId: policy.mediaId,
              etag: String(headers.etag || headers.ETag || '') || undefined
            })
          },
          fail(error: any) {
            reject(new ApiError(error.errMsg || error.message || '视频上传失败，请重试。', {
              code: 'UPLOAD_FAILED',
              data: bodyRecord(error)
            }))
          }
        })
      },
      fail(error: any) {
        reject(new ApiError(error.errMsg || error.message || '无法读取待上传视频。', {
          code: 'INVALID_MEDIA',
          data: bodyRecord(error)
        }))
      }
    })
  })
}

export async function loginWechat(input: AuthWechatRequest): Promise<AuthWechatResponse> {
  const raw = await requestRaw<any>({ path: '/auth/wechat', method: 'POST', data: input, auth: false })
  return {
    token: String(raw.token || ''),
    user: normalizeUser(raw.user),
    trialEligibility: raw.trialEligibility || raw.trial_eligibility
  }
}

export async function getMe(): Promise<MeResponse> {
  const raw = await requestRaw<any>({ path: '/me' })
  return {
    user: normalizeUser(raw.user || raw),
    trialEligibility: raw.trialEligibility || raw.trial_eligibility,
    voiceCount: raw.voiceCount == null && raw.voice_count == null ? undefined : Number(raw.voiceCount ?? raw.voice_count)
  }
}

export async function updateMeProfile(profile: { nickname?: string; avatarUrl?: string }): Promise<UserProfile> {
  const raw = await requestRaw<any>({ path: '/me/profile', method: 'PATCH', data: profile })
  return normalizeUser(raw.user || raw)
}

export async function getHome(): Promise<HomeResponse> {
  return normalizeHome(await requestRaw({ path: '/home' }))
}

export async function listVoices(status = ''): Promise<VoicesResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return normalizeVoices(await requestRaw({ path: `/voices${query}` }))
}

export async function createVoice(): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({ path: '/voices', method: 'POST', data: {} })
  return normalizeVoice(raw.voice || raw)
}

export async function getUploadPolicy(voiceId: string, metadata: {
  fileName: string
  mimeType: string
  sizeBytes: number
}): Promise<UploadPolicyResponse> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/upload-policy`,
    method: 'POST',
    data: metadata
  })
  return normalizeUploadPolicy(raw)
}

export async function confirmVoiceMedia(voiceId: string, metadata: {
  objectKey?: string
  mediaId?: string
  fileName: string
  mimeType: string
  sizeBytes: number
  durationMs: number
}): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/media`,
    method: 'POST',
    data: metadata
  })
  return normalizeVoice(raw.voice || raw)
}

export async function saveVoiceClip(voiceId: string, startMs: number, endMs: number): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/clip`,
    method: 'PUT',
    data: { startMs, endMs }
  })
  return normalizeVoice(raw.voice || raw)
}

export async function saveVoiceProfile(voiceId: string, input: {
  name: string
  permissionType: PermissionType
  relationshipType?: import('../models/api').RelationshipType
  relationshipLabel?: string
  userAddress?: string
  ageYears?: number
  gender?: import('../models/api').VoiceGender
  userAgeYears?: number
  userLifeStage?: import('../models/api').UserLifeStage
  background?: string
  relationshipNote?: string
  personalityNote?: string
  speechHabitNote?: string
}): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/profile`,
    method: 'PUT',
    data: input
  })
  return normalizeVoice(raw.voice || raw)
}

export async function saveVoiceConsent(voiceId: string, input: {
  consentVersion: string
  consentText: string
  confirmed: true
}): Promise<void> {
  await requestRaw({
    path: `/voices/${encodeURIComponent(voiceId)}/consents`,
    method: 'POST',
    data: input
  })
}

export async function startVoiceProcess(voiceId: string): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/process`,
    method: 'POST',
    data: {}
  })
  return normalizeVoice(raw.voice || raw)
}

export async function getVoice(voiceId: string): Promise<VoiceDetail> {
  return normalizeVoice(await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}` }))
}

export async function getVoicePreview(voiceId: string, voice?: VoiceDetail): Promise<PreviewResponse> {
  return normalizePreview(await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}/preview` }), voice)
}

export async function markVoicePreviewPlayed(voiceId: string): Promise<void> {
  await requestRaw({
    path: `/voices/${encodeURIComponent(voiceId)}/preview-played`,
    method: 'POST',
    data: {}
  })
}

export async function markVoicePreviewStarted(voiceId: string): Promise<void> {
  await requestRaw({
    path: `/voices/${encodeURIComponent(voiceId)}/preview-started`,
    method: 'POST',
    data: {}
  })
}

export async function acceptVoicePreview(voiceId: string): Promise<AcceptPreviewResponse> {
  return normalizeAcceptPreview(await requestRaw({
    path: `/voices/${encodeURIComponent(voiceId)}/accept-preview`,
    method: 'POST',
    data: {}
  }))
}

export async function retryVoicePreview(voiceId: string): Promise<VoiceDetail> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/retry-preview`,
    method: 'POST',
    data: {}
  })
  return normalizeVoice(raw.voice || raw)
}

export async function getVoiceQuota(voiceId: string): Promise<PointsBalanceResponse> {
  return normalizeQuota(await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}/quota` }))
}

export async function getPoints(): Promise<PointsBalanceResponse> {
  try {
    return normalizeQuota(await requestRaw({ path: '/points' }))
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) throw error
    return normalizeQuota(await requestRaw({ path: '/me' }))
  }
}

export async function getConversation(voiceId: string): Promise<ConversationResponse> {
  return normalizeConversation(await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}/conversation` }))
}

export async function clearConversation(voiceId: string): Promise<void> {
  await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}/conversation`, method: 'DELETE' })
}

export async function sendChatMessage(voiceId: string, text: string, idempotencyKey: string): Promise<GenerationAcceptedResponse> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/messages`,
    method: 'POST',
    data: { text },
    headers: { 'Idempotency-Key': idempotencyKey }
  })
  return {
    messageId: String(raw.messageId || raw.message_id || raw.id || ''),
    status: 'PROCESSING'
  }
}

export async function sendExactSpeech(voiceId: string, text: string, idempotencyKey: string): Promise<GenerationAcceptedResponse> {
  const raw = await requestRaw<any>({
    path: `/voices/${encodeURIComponent(voiceId)}/exact-speech`,
    method: 'POST',
    data: { text },
    headers: { 'Idempotency-Key': idempotencyKey }
  })
  return {
    messageId: String(raw.messageId || raw.message_id || raw.id || ''),
    status: 'PROCESSING'
  }
}

export async function getMessage(messageId: string): Promise<MessageStatusResponse> {
  return normalizeMessageStatus(await requestRaw({ path: `/messages/${encodeURIComponent(messageId)}` }))
}

export async function createOrder(productCode: string, voiceId?: string): Promise<CreateOrderResponse> {
  const wxLoginCode = await new Promise<string>((resolve) => {
    if (LOCAL_DEV_MODE || typeof wx.login !== 'function') {
      resolve('')
      return
    }
    wx.login({
      success: (result: any) => resolve(String(result.code || '')),
      fail: () => resolve('')
    })
  })
  return normalizeCreateOrder(await requestRaw({
    path: '/orders',
    method: 'POST',
    data: { productCode, ...(voiceId ? { voiceId } : {}), ...(wxLoginCode ? { wxLoginCode } : {}) },
    headers: { 'Idempotency-Key': await uuidV4() }
  }))
}

export async function listProducts(): Promise<ProductListResponse> {
  try {
    return normalizeProducts(await requestRaw({ path: '/products' }))
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) throw error
    return normalizeProducts(await requestRaw({ path: '/points/products' }))
  }
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  return normalizeOrder(await requestRaw({ path: `/orders/${encodeURIComponent(orderId)}` }))
}

export async function refreshOrder(orderId: string): Promise<OrderDetail> {
  return normalizeOrder(await requestRaw({
    path: `/orders/${encodeURIComponent(orderId)}/refresh`,
    method: 'POST',
    data: {}
  }))
}

export async function confirmLocalTestPayment(orderId: string): Promise<OrderDetail> {
  return normalizeOrder(await requestRaw({
    path: `/orders/${encodeURIComponent(orderId)}/mock-paid`,
    method: 'POST',
    data: {}
  }))
}

export async function listOrders(): Promise<OrdersResponse> {
  return normalizeOrders(await requestRaw({ path: '/orders' }))
}

export async function listQuotaLedgers(): Promise<PointsLedgersResponse> {
  return normalizeQuotaLedgers(await requestRaw({ path: '/quota-ledgers' }))
}

export async function listPointLedgers(): Promise<PointsLedgersResponse> {
  try {
    return normalizeQuotaLedgers(await requestRaw({ path: '/points/ledgers' }))
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) throw error
    return listQuotaLedgers()
  }
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await requestRaw({ path: `/voices/${encodeURIComponent(voiceId)}`, method: 'DELETE' })
}

export async function deleteAccount(): Promise<void> {
  await requestRaw({ path: '/account', method: 'DELETE' })
}
