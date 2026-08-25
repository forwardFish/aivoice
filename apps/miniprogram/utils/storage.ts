import { UserProfile } from '../models/api'

const TOKEN_KEY = 'nashide_ta_token'
const USER_KEY = 'nashide_ta_user'
const CREATION_SESSION_KEY = 'nashide_ta_creation_session'
const POST_LOGIN_ROUTE_KEY = 'nashide_ta_post_login_route'
const WORKBENCH_DRAFT_PREFIX = 'nashide_ta_workbench_draft:'
const REPLY_FEEDBACK_PREFIX = 'nashide_ta_reply_feedback:'

export interface CreationSession {
  voiceId: string
  tempFilePath?: string
  thumbTempFilePath?: string
  selectedTileIndex?: number
  fileName?: string
  mimeType?: string
  sizeBytes?: number
  durationMs?: number
  objectKey?: string
  mediaId?: string
  clipStartMs?: number
  clipEndMs?: number
}

export interface WorkbenchDraft {
  chatText?: string
  exactText?: string
  mode?: 'chat' | 'exact'
  updatedAt: number
}

export interface ReplyFeedback {
  verdict: 'LIKE' | 'DISLIKE'
  reason?: string
  updatedAt: number
}

export function getToken(): string {
  return String(wx.getStorageSync(TOKEN_KEY) || '')
}

export function setToken(token: string): void {
  wx.setStorageSync(TOKEN_KEY, token)
}

export function clearToken(): void {
  wx.removeStorageSync(TOKEN_KEY)
}

export function getUser(): UserProfile | null {
  return wx.getStorageSync(USER_KEY) || null
}

export function setUser(user: UserProfile): void {
  wx.setStorageSync(USER_KEY, user)
}

export function clearUser(): void {
  wx.removeStorageSync(USER_KEY)
}

export function clearAuth(): void {
  clearToken()
  clearUser()
}

export function getCreationSession(): CreationSession | null {
  return wx.getStorageSync(CREATION_SESSION_KEY) || null
}

export function setCreationSession(session: CreationSession): void {
  wx.setStorageSync(CREATION_SESSION_KEY, session)
}

export function patchCreationSession(patch: Partial<CreationSession>): CreationSession | null {
  const current = getCreationSession()
  if (!current && !patch.voiceId) return null
  const next = { ...(current || {}), ...patch } as CreationSession
  setCreationSession(next)
  return next
}

export function clearCreationSession(): void {
  wx.removeStorageSync(CREATION_SESSION_KEY)
}

export function setPostLoginRoute(route: string): void {
  if (route && route.startsWith('/pages/')) wx.setStorageSync(POST_LOGIN_ROUTE_KEY, route)
}

export function consumePostLoginRoute(): string {
  const route = String(wx.getStorageSync(POST_LOGIN_ROUTE_KEY) || '')
  wx.removeStorageSync(POST_LOGIN_ROUTE_KEY)
  return route
}

function draftKey(voiceId: string): string {
  return `${WORKBENCH_DRAFT_PREFIX}${voiceId}`
}

export function getWorkbenchDraft(voiceId: string): WorkbenchDraft | null {
  if (!voiceId) return null
  return wx.getStorageSync(draftKey(voiceId)) || null
}

export function setWorkbenchDraft(voiceId: string, draft: Omit<WorkbenchDraft, 'updatedAt'>): void {
  if (!voiceId) return
  wx.setStorageSync(draftKey(voiceId), { ...draft, updatedAt: Date.now() })
}

export function clearWorkbenchDraft(voiceId: string): void {
  if (!voiceId) return
  wx.removeStorageSync(draftKey(voiceId))
}

function replyFeedbackKey(voiceId: string): string {
  return `${REPLY_FEEDBACK_PREFIX}${voiceId}`
}

export function getReplyFeedback(voiceId: string): Record<string, ReplyFeedback> {
  if (!voiceId) return {}
  const value = wx.getStorageSync(replyFeedbackKey(voiceId))
  return value && typeof value === 'object' ? value : {}
}

export function setReplyFeedback(voiceId: string, messageId: string, feedback: Omit<ReplyFeedback, 'updatedAt'>): void {
  if (!voiceId || !messageId) return
  const current = getReplyFeedback(voiceId)
  wx.setStorageSync(replyFeedbackKey(voiceId), {
    ...current,
    [messageId]: { ...feedback, updatedAt: Date.now() }
  })
}

const PENDING_ORDER_PREFIX = 'nashide_ta_pending_order:'

interface PendingOrderState {
  orderId: string
  paymentCompleted: boolean
  paymentKind: 'JSAPI' | 'VIRTUAL'
  updatedAt: number
}

function pendingOrderKey(voiceId: string): string {
  return `${PENDING_ORDER_PREFIX}${voiceId}`
}

function getPendingOrderState(voiceId: string): PendingOrderState | null {
  if (!voiceId) return null
  const value = wx.getStorageSync(pendingOrderKey(voiceId))
  if (!value) return null
  if (typeof value === 'string') {
    return { orderId: value, paymentCompleted: false, paymentKind: 'JSAPI', updatedAt: 0 }
  }
  if (typeof value === 'object' && value.orderId) {
    return {
      orderId: String(value.orderId),
      paymentCompleted: Boolean(value.paymentCompleted),
      paymentKind: value.paymentKind === 'VIRTUAL' ? 'VIRTUAL' : 'JSAPI',
      updatedAt: Number(value.updatedAt || 0)
    }
  }
  return null
}

export function getPendingOrderId(voiceId: string): string {
  const state = getPendingOrderState(voiceId)
  return state ? state.orderId : ''
}

export function setPendingOrderId(voiceId: string, orderId: string, paymentKind: 'JSAPI' | 'VIRTUAL' = 'JSAPI'): void {
  if (!voiceId || !orderId) return
  const current = getPendingOrderState(voiceId)
  wx.setStorageSync(pendingOrderKey(voiceId), {
    orderId,
    paymentCompleted: current && current.orderId === orderId ? current.paymentCompleted : false,
    paymentKind,
    updatedAt: Date.now()
  } as PendingOrderState)
}

export function markPendingOrderPaymentCompleted(voiceId: string, orderId: string): void {
  if (!voiceId || !orderId) return
  const current = getPendingOrderState(voiceId)
  wx.setStorageSync(pendingOrderKey(voiceId), {
    orderId,
    paymentCompleted: true,
    paymentKind: current && current.orderId === orderId ? current.paymentKind : 'JSAPI',
    updatedAt: Date.now()
  } as PendingOrderState)
}

export function pendingOrderPaymentCompleted(voiceId: string, orderId: string): boolean {
  const state = getPendingOrderState(voiceId)
  return Boolean(state && state.orderId === orderId && state.paymentCompleted)
}

export function pendingOrderPaymentKind(voiceId: string, orderId: string): 'JSAPI' | 'VIRTUAL' {
  const state = getPendingOrderState(voiceId)
  return state && state.orderId === orderId ? state.paymentKind : 'JSAPI'
}

export function clearPendingOrderId(voiceId: string): void {
  if (!voiceId) return
  wx.removeStorageSync(pendingOrderKey(voiceId))
}

export function clearLocalProjectData(): void {
  try {
    const info = wx.getStorageInfoSync()
    const keys = Array.isArray(info && info.keys) ? info.keys : []
    keys.forEach((key: string) => {
      if (key === TOKEN_KEY || key === USER_KEY || key === CREATION_SESSION_KEY || key === POST_LOGIN_ROUTE_KEY || key.startsWith(WORKBENCH_DRAFT_PREFIX) || key.startsWith(REPLY_FEEDBACK_PREFIX) || key.startsWith(PENDING_ORDER_PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (_error) {
    clearAuth()
    clearCreationSession()
    wx.removeStorageSync(POST_LOGIN_ROUTE_KEY)
  }
}
