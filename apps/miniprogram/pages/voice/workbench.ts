import {
  ApiError,
  getConversation,
  getPoints,
  getMessage,
  getVoice,
  listProducts,
  recordVoiceReplyFeedback,
  sendChatMessage,
  sendExactSpeech
} from '../../services/api'
import {
  ConversationMessage,
  PointsBalanceResponse,
  PurchaseOption,
} from '../../models/api'
import {
  MESSAGE_POLL_ATTEMPTS,
  POLL_INTERVAL_MS
} from '../../config'
import { ensureAuthenticated } from '../../utils/navigation'
import {
  appendGenerationTiming,
  clearWorkbenchDraft,
  getReplyFeedback,
  getPendingOrderId,
  getUser,
  getWorkbenchDraft,
  setReplyFeedback,
  setWorkbenchDraft
} from '../../utils/storage'
import { delay, confirm, toast } from '../../utils/ui'
import { uuidV4 } from '../../utils/uuid'
import { resolveVoiceAvatar } from '../../utils/avatar'
import { formatDateTime, voiceInitial } from '../../utils/format'
import { resolveProfileAvatarSource } from '../../utils/avatar-picker'

function pointsLabel(points: PointsBalanceResponse): string {
  return `剩余 ${points.availablePoints} 积分`
}

const DISLIKE_REASONS: ReadonlyArray<{ code: string; label: string; needsDetail?: boolean }> = [
  { code: 'SHORTER', label: 'TA会说得更简短' },
  { code: 'MORE_DIRECT', label: 'TA会说得更直接' },
  { code: 'WARMER', label: 'TA的语气会更温和' },
  { code: 'LESS_PREACHY', label: 'TA不会讲这么多道理' },
  { code: 'ASK_FIRST', label: 'TA会先问清楚再说' },
  { code: 'WRONG_ADDRESS', label: 'TA不会这样称呼我' },
  { code: 'WORDING_NOT_LIKE', label: '说话不像TA', needsDetail: true },
  { code: 'TONE_NOT_LIKE', label: '语气不像TA', needsDetail: true }
] as const

function messageView(message: ConversationMessage, initial: string, feedback?: { verdict?: string; reason?: string }): any {
  return {
    ...message,
    isUser: message.role === 'USER',
    isAssistant: message.role === 'ASSISTANT',
    showAudio: message.role === 'ASSISTANT' && message.status === 'READY' && Boolean(message.audioUrl),
    tag: message.mode === 'EXACT_TTS' ? 'AI生成' : 'AI回复',
    feedbackVerdict: feedback?.verdict || '',
    feedbackReason: feedback?.reason || '',
    timeText: messageTimeLabel(message.createdAt),
    initial
  }
}

function messageTimeLabel(value?: string): string {
  const formatted = formatDateTime(value)
  const match = formatted.match(/(\d{2}:\d{2})$/)
  return match ? match[1] : ''
}

Page({
  data: {
    voiceId: '',
    state: 'loading',
    errorMessage: '',
    voiceName: '这个声音',
    voiceInitial: '声',
    voiceAvatar: '/assets/avatars/age-30-49-female.png',
    userAvatar: '/assets/ui/user-outline.png',
    points: {
      availablePoints: 0
    } as PointsBalanceResponse,
    pointsText: '剩余 0 积分',
    mode: 'chat' as 'chat' | 'exact',
    messages: [] as any[],
    chatMessages: [] as any[],
    exactResults: [] as any[],
    chatText: '',
    chatInputFocused: false,
    exactText: '',
    chatCount: 0,
    exactCount: 0,
    sending: false,
    pendingText: '',
    pendingReplyText: '',
    pendingMode: '',
    generationStatusText: '',
    scrollTarget: '',
    chatScrollTop: 0,
    bottomAnchorId: '',
    messagesScrollStyle: '',
    purchaseVisible: false,
    purchaseOption: null as PurchaseOption | null,
    paying: false,
    paymentPending: false,
    purchaseMessage: ''
  },
  onLoad(options: Record<string, string>) {
    this.destroyed = false
    this.chatBottomSequence = 0
    this.chatScrollPositionSequence = 0
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音信息。' })
      return
    }
    const stored = getWorkbenchDraft(voiceId)
    const initialChatText = stored?.chatText || ''
    this.chatDraftText = initialChatText
    this.chatDraftDirty = false
    const mode = options.mode === 'exact' ? 'exact' : 'chat'
    this.setData({
      voiceId,
      mode,
      chatText: initialChatText,
      exactText: stored?.exactText || '',
      chatCount: initialChatText.length,
      exactCount: (stored?.exactText || '').length
    })
    this.loadData()
  },
  onShow() {
    if (this.data.voiceId && this.data.state === 'success' && !this.data.sending && !this.data.paymentPending) {
      this.loadData(false)
    } else {
      this.scheduleChatViewportSync()
    }
  },
  onUnload() {
    if (this.chatDraftDirty && this.data.voiceId) this.persistDraft('chat')
    this.finishGenerationTiming('CANCELLED')
    this.destroyed = true
    if (this.chatViewportTimer) clearTimeout(this.chatViewportTimer)
    if (this.chatBottomTimer) clearTimeout(this.chatBottomTimer)
    if (this.chatBottomSettleTimer) clearTimeout(this.chatBottomSettleTimer)
    if (this.pollTimer) clearTimeout(this.pollTimer)
  },
  async loadData(showLoading = true) {
    if (showLoading) this.setData({ state: 'loading', errorMessage: '' })
    try {
      const voice = await getVoice(this.data.voiceId)
      if (voice.status === 'UPLOADING' || voice.status === 'QUEUED' || voice.status === 'PROCESSING') {
        wx.redirectTo({ url: `/pages/create/progress?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      if (voice.status === 'PREVIEW_READY') {
        wx.redirectTo({ url: `/pages/create/preview?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      if (voice.status !== 'READY') {
        throw new Error(voice.status === 'FAILED'
          ? (voice.error && voice.error.message) || '声音创建失败，请在“我的声音”中重新创建。'
          : voice.status === 'DELETING' || voice.status === 'DELETED'
            ? '该声音正在删除或已经删除。'
            : '该声音尚未准备好，请在“我的声音”中继续创建。')
      }
      const [points, conversation, products] = await Promise.all([
        getPoints(),
        getConversation(this.data.voiceId),
        listProducts().catch(() => ({ products: [] as PurchaseOption[] }))
      ])
      const initial = voiceInitial(voice.name)
      const replyFeedback = getReplyFeedback(this.data.voiceId)
      const messages = conversation.messages.map(item => messageView(item, initial, replyFeedback[item.id]))
      const chatMessages = messages.filter(item => item.mode === 'CHAT')
      const exactResults = messages.filter(item => item.mode === 'EXACT_TTS' && item.isAssistant).reverse()
      this.chatBottomSequence = Number(this.chatBottomSequence || 0) + 1
      const bottomAnchorId = `chat-bottom-${this.chatBottomSequence}`
      const userAvatar = await this.resolveUserAvatar()
      this.setData({
        state: 'success',
        errorMessage: '',
        voiceName: voice.name,
        voiceInitial: initial,
        voiceAvatar: resolveVoiceAvatar(voice),
        userAvatar,
        points,
        pointsText: pointsLabel(points),
        purchaseOption: products.products[0] || this.data.purchaseOption,
        messages,
        chatMessages,
        exactResults,
        bottomAnchorId,
        scrollTarget: ''
      })
      this.scheduleChatViewportSync()
      this.scheduleChatBottomScroll(bottomAnchorId)
      const pendingOrderId = getPendingOrderId(this.data.voiceId)
      if (pendingOrderId && !this.data.paymentPending && !this.data.paying) {
        wx.navigateTo({
          url: `/pages/purchase/index?voiceId=${encodeURIComponent(this.data.voiceId)}&resume=1`
        })
      }
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '工作台加载失败，请重试。', messagesScrollStyle: '' })
    }
  },
  async resolveUserAvatar() {
    const source = String(getUser()?.avatarUrl || '')
    if (!source) return '/assets/ui/user-outline.png'
    try {
      return await resolveProfileAvatarSource(source)
    } catch (_error) {
      return /^cloud:\/\//i.test(source) ? '/assets/ui/user-outline.png' : source
    }
  },
  switchMode(event: any) {
    const mode = event.currentTarget.dataset.mode === 'exact' ? 'exact' : 'chat'
    this.setData({ mode })
    this.persistDraft(mode)
    this.scheduleChatViewportSync()
  },
  onVoiceAvatarError() {
    if (!this.data.voiceAvatar) return
    this.setData({ voiceAvatar: '' })
  },
  openSettings() {
    if (!this.data.voiceId) return
    wx.navigateTo({ url: `/pages/voice/settings?voiceId=${encodeURIComponent(this.data.voiceId)}` })
  },
  onChatInput(event: any) {
    const chatText = String(event.detail.value || '').slice(0, 200)
    this.chatDraftText = chatText
    this.chatDraftDirty = true
    if (this.data.errorMessage) this.setData({ errorMessage: '' })
  },
  onChatFocus() {
    if (this.data.chatInputFocused) return
    this.setData({ chatInputFocused: true })
  },
  onChatBlur() {
    const chatText = String(this.chatDraftText == null ? this.data.chatText : this.chatDraftText).slice(0, 200)
    this.chatDraftText = chatText
    this.chatDraftDirty = false
    this.setData({ chatText, chatCount: chatText.length, chatInputFocused: false })
    this.persistDraft('chat', { chatText })
  },
  onExactInput(event: any) {
    const exactText = String(event.detail.value || '').slice(0, 50)
    this.setData({ exactText, exactCount: exactText.length, errorMessage: '' })
    this.persistDraft('exact', { exactText })
  },
  useQuickPrompt(event: any) {
    const text = String(event.currentTarget.dataset.text || '')
    this.chatDraftText = text
    this.chatDraftDirty = false
    this.setData({ chatText: text, chatCount: text.length })
    this.persistDraft('chat', { chatText: text })
  },
  markReplyLike(event: any) {
    const messageId = String(event.currentTarget.dataset.messageId || '')
    if (!messageId) return
    this.saveReplyFeedback(messageId, 'LIKE')
    toast('已标记为像 TA')
  },
  markReplyDislike(event: any) {
    const messageId = String(event.currentTarget.dataset.messageId || '')
    if (!messageId) return
    this.saveReplyFeedback(messageId, 'DISLIKE')
    toast('已标记为不像 TA')
  },
  saveReplyFeedback(messageId: string, verdict: 'LIKE' | 'DISLIKE', reason = '', detail = '') {
    setReplyFeedback(this.data.voiceId, messageId, { verdict, ...(reason ? { reason } : {}) })
    this.setData({
      chatMessages: this.data.chatMessages.map((message: any) => message.id === messageId
        ? { ...message, feedbackVerdict: verdict, feedbackReason: reason }
        : message)
    })
    void recordVoiceReplyFeedback(this.data.voiceId, {
      messageId,
      verdict,
      ...(reason ? { reason } : {}),
      ...(detail ? { detail: Array.from(detail).slice(0, 80).join('') } : {})
    }).catch(() => toast('反馈已保存在本机，暂未同步'))
  },
  persistDraft(mode = this.data.mode, patch: Record<string, string> = {}) {
    const currentChatText = String(this.chatDraftText == null ? this.data.chatText : this.chatDraftText)
    setWorkbenchDraft(this.data.voiceId, {
      mode,
      chatText: patch.chatText == null ? currentChatText : patch.chatText,
      exactText: patch.exactText == null ? this.data.exactText : patch.exactText
    })
  },
  async sendChat() {
    await this.submitGeneration('chat')
  },
  async generateExact() {
    await this.submitGeneration('exact')
  },
  async submitGeneration(mode: 'chat' | 'exact') {
    if (this.data.sending || this.data.paymentPending || this.data.paying) return
    const chatText = String(this.chatDraftText == null ? this.data.chatText : this.chatDraftText)
    const text = String(mode === 'chat' ? chatText : this.data.exactText).trim()
    if (!text) {
      toast(mode === 'chat' ? '请输入想说的话' : '请输入希望 TA 说的话')
      return
    }
    if (mode === 'exact' && text.length > 50) {
      toast('“说一句”最多 50 个字符')
      return
    }
    if (mode === 'chat') {
      this.chatDraftText = ''
      this.chatDraftDirty = false
      this.chatBottomSequence = Number(this.chatBottomSequence || 0) + 1
    }
    const submittedBottomAnchorId = mode === 'chat' ? `chat-bottom-${this.chatBottomSequence}` : this.data.bottomAnchorId
    this.persistDraft(mode, mode === 'chat' ? { chatText: '' } : {})
    this.setData({
      ...(mode === 'chat' ? {
        chatText: '',
        chatCount: 0,
        chatInputFocused: false,
        bottomAnchorId: submittedBottomAnchorId,
        scrollTarget: ''
      } : {}),
      sending: true,
      errorMessage: '',
      pendingText: text,
      pendingReplyText: '',
      pendingMode: mode,
      generationStatusText: mode === 'chat' ? '正在生成 AI 回复…' : '正在生成 AI 语音…'
    }, () => {
      if (mode !== 'chat') return
      this.setData({ scrollTarget: 'pending-assistant' })
      this.scheduleChatViewportSync()
      this.scheduleChatBottomScroll(submittedBottomAnchorId)
    })
    this.generationClientTiming = {
      startedAt: Date.now(),
      mode,
      messageId: '',
      idempotencyMs: 0,
      submitRequestMs: 0,
      pollCount: 0,
      pollRequestMs: 0,
      firstTextMs: 0
    }
    try {
      const idempotencyStartedAt = Date.now()
      const idempotencyKey = await uuidV4()
      this.generationClientTiming.idempotencyMs = Date.now() - idempotencyStartedAt
      const submitStartedAt = Date.now()
      const accepted = mode === 'chat'
        ? await sendChatMessage(this.data.voiceId, text, idempotencyKey)
        : await sendExactSpeech(this.data.voiceId, text, idempotencyKey)
      this.generationClientTiming.submitRequestMs = Date.now() - submitStartedAt
      if (!accepted.messageId) throw new Error('服务端未返回生成任务 ID。')
      this.generationClientTiming.messageId = accepted.messageId
      await this.pollMessage(accepted.messageId)
    } catch (error: any) {
      this.finishGenerationTiming('FAILED', error)
      const restoredChatDraft = mode === 'chat' ? { chatText: text, chatCount: text.length } : {}
      if (mode === 'chat') {
        this.chatDraftText = text
        this.chatDraftDirty = false
        this.persistDraft('chat', { chatText: text })
      }
      if (error instanceof ApiError && ['POINTS_EXHAUSTED', 'QUOTA_EXHAUSTED'].includes(error.code)) {
        if (!error.purchaseOption && !this.data.purchaseOption) {
          this.setData({ ...restoredChatDraft, sending: false, pendingText: '', pendingReplyText: '', pendingMode: '', errorMessage: '服务端未返回可购买商品，请稍后重试。' })
          return
        }
        this.setData({
          ...restoredChatDraft,
          sending: false,
          pendingText: '',
          pendingReplyText: '',
          pendingMode: '',
          purchaseVisible: true,
          purchaseOption: this.data.purchaseOption || error.purchaseOption || null,
          purchaseMessage: ''
        })
        return
      }
      this.setData({
        ...restoredChatDraft,
        sending: false,
        pendingText: '',
        pendingReplyText: '',
        pendingMode: '',
        errorMessage: error.message || '生成失败，本次不会扣积分。'
      })
    }
  },
  async pollMessage(messageId: string) {
    for (let attempt = 0; attempt < MESSAGE_POLL_ATTEMPTS; attempt += 1) {
      if (this.destroyed) return
      const pollStartedAt = Date.now()
      const result = await getMessage(messageId)
      if (this.generationClientTiming) {
        this.generationClientTiming.pollCount += 1
        this.generationClientTiming.pollRequestMs += Date.now() - pollStartedAt
      }
      if (result.status === 'PROCESSING' && this.data.pendingMode === 'chat') {
        const publishedText = String(result.text || '').trim()
        if (publishedText && publishedText !== this.data.pendingReplyText) {
          if (this.generationClientTiming && !this.generationClientTiming.firstTextMs) {
            this.generationClientTiming.firstTextMs = Date.now() - this.generationClientTiming.startedAt
          }
          this.setData({
            pendingReplyText: publishedText,
            generationStatusText: '声音生成中…',
            scrollTarget: 'pending-assistant'
          })
          this.scheduleChatBottomScroll(this.data.bottomAnchorId)
        }
      }
      if (result.status === 'READY') {
        const completedMode = this.data.pendingMode
        const currentChatText = String(this.chatDraftText == null ? this.data.chatText : this.chatDraftText)
        const nextChatText = completedMode === 'chat' ? '' : currentChatText
        const nextExactText = completedMode === 'exact' ? '' : this.data.exactText
        if (nextChatText || nextExactText) {
          setWorkbenchDraft(this.data.voiceId, {
            mode: completedMode === 'chat' && nextExactText ? 'exact' : completedMode === 'exact' && nextChatText ? 'chat' : this.data.mode,
            chatText: nextChatText,
            exactText: nextExactText
          })
        } else {
          clearWorkbenchDraft(this.data.voiceId)
        }
        this.chatDraftText = nextChatText
        this.chatDraftDirty = false
        await this.loadData(false)
        this.setData({
          chatText: nextChatText,
          exactText: nextExactText,
          chatCount: nextChatText.length,
          exactCount: nextExactText.length,
          sending: false,
          pendingText: '',
          pendingReplyText: '',
          pendingMode: '',
          generationStatusText: ''
        })
        this.scheduleChatViewportSync()
        this.finishGenerationTiming('READY')
        return
      }
      if (result.status === 'FAILED' && this.data.pendingMode === 'chat' && String(result.text || '').trim()) {
        const nextExactText = this.data.exactText
        if (nextExactText) {
          setWorkbenchDraft(this.data.voiceId, { mode: 'exact', chatText: '', exactText: nextExactText })
        } else {
          clearWorkbenchDraft(this.data.voiceId)
        }
        this.chatDraftText = ''
        this.chatDraftDirty = false
        await this.loadData(false)
        this.setData({
          chatText: '',
          chatCount: 0,
          sending: false,
          pendingText: '',
          pendingReplyText: '',
          pendingMode: '',
          generationStatusText: '',
          errorMessage: ''
        })
        this.scheduleChatViewportSync()
        this.finishGenerationTiming('FAILED', new Error('声音生成失败，文字回复已保留，本次未扣积分。'))
        toast('文字回复已保留，声音生成失败，本次未扣积分')
        return
      }
      if (result.status === 'FAILED' || result.status === 'BLOCKED') {
        throw new Error(result.status === 'BLOCKED'
          ? '这段内容不符合使用规则，请修改后重试。'
          : '生成失败，本次不会扣积分。')
      }
      await delay(POLL_INTERVAL_MS)
    }
    throw new Error('生成时间较长，请稍后在当前页面刷新查看。')
  },
  finishGenerationTiming(status: 'READY' | 'FAILED' | 'CANCELLED', error?: unknown) {
    const timing = this.generationClientTiming
    if (!timing) return
    const record = {
      event: 'message_delivery_timing' as const,
      status,
      messageId: timing.messageId || '',
      mode: timing.mode,
      idempotencyMs: timing.idempotencyMs,
      submitRequestMs: timing.submitRequestMs,
      pollCount: timing.pollCount,
      pollRequestMs: timing.pollRequestMs,
      firstTextMs: timing.firstTextMs,
      waitingForBackendAndPollMs: Math.max(0, Date.now() - timing.startedAt
        - timing.idempotencyMs - timing.submitRequestMs - timing.pollRequestMs),
      totalMs: Date.now() - timing.startedAt,
      overThreeSecondTarget: Date.now() - timing.startedAt > 3_000,
      error: error instanceof Error ? error.message.slice(0, 200) : error ? String(error).slice(0, 200) : '',
      completedAt: Date.now()
    }
    appendGenerationTiming(record)
    const logger = (globalThis as any).console
    if (status === 'READY') logger?.info?.('message_delivery_timing', JSON.stringify(record))
    else logger?.warn?.('message_delivery_timing', JSON.stringify(record))
    this.generationClientTiming = null
  },
  closePurchase() {
    if (this.data.paying || this.data.paymentPending) return
    this.setData({ purchaseVisible: false, purchaseMessage: '' })
  },
  buyQuota() {
    if (this.data.paying || this.data.paymentPending || !this.data.purchaseOption) return
    const query = [
      `voiceId=${encodeURIComponent(this.data.voiceId)}`,
      `mode=${encodeURIComponent(this.data.mode)}`,
      `productCode=${encodeURIComponent(this.data.purchaseOption.productCode)}`
    ].join('&')
    this.setData({ purchaseVisible: false, purchaseMessage: '' })
    wx.navigateTo({ url: `/pages/purchase/index?${query}` })
  },
  async clearConversationFromMenu() {
    const accepted = await confirm({
      title: '清空当前对话？',
      content: '清空后，这些消息不会再用于后续上下文，操作无法恢复。',
      confirmText: '清空',
      confirmColor: '#D85B63'
    })
    if (!accepted) return
    wx.navigateTo({ url: `/pages/voice/settings?voiceId=${encodeURIComponent(this.data.voiceId)}&focus=conversation` })
  },
  scheduleChatViewportSync() {
    if (this.chatViewportTimer) clearTimeout(this.chatViewportTimer)
    if (this.data.state !== 'success' || this.data.mode !== 'chat') {
      if (this.data.messagesScrollStyle) this.setData({ messagesScrollStyle: '' })
      return
    }
    this.chatViewportTimer = setTimeout(() => {
      this.chatViewportTimer = null
      this.syncChatViewport()
    }, 30)
  },
  scheduleChatBottomScroll(anchorId = this.data.bottomAnchorId) {
    if (this.chatBottomTimer) clearTimeout(this.chatBottomTimer)
    if (this.chatBottomSettleTimer) clearTimeout(this.chatBottomSettleTimer)
    if (!anchorId || this.data.mode !== 'chat') return
    const apply = () => {
      if (this.destroyed || this.data.mode !== 'chat' || this.data.bottomAnchorId !== anchorId) return
      this.chatScrollPositionSequence = Number(this.chatScrollPositionSequence || 0) + 1
      const chatScrollTop = 1000000 + this.chatScrollPositionSequence
      this.setData({ scrollTarget: '', chatScrollTop: 0 }, () => this.setData({ scrollTarget: anchorId, chatScrollTop }))
    }
    this.chatBottomTimer = setTimeout(() => {
      this.chatBottomTimer = null
      apply()
    }, 80)
    this.chatBottomSettleTimer = setTimeout(() => {
      this.chatBottomSettleTimer = null
      apply()
    }, 650)
  },
  syncChatViewport() {
    const getWindowInfo = (wx as any).getWindowInfo
    const system = typeof getWindowInfo === 'function'
      ? getWindowInfo.call(wx)
      : typeof (wx as any).getSystemInfoSync === 'function'
        ? (wx as any).getSystemInfoSync()
        : null
    const windowHeight = Number(system?.windowHeight || 0)
    if (!windowHeight || typeof (wx as any).createSelectorQuery !== 'function') return
    const query = (wx as any).createSelectorQuery().in(this)
    query.select('.ai-notice').boundingClientRect()
    query.select('.chat-composer-shell').boundingClientRect()
    query.exec((rects: Array<{ bottom?: number; top?: number } | null>) => {
      if (this.destroyed || this.data.mode !== 'chat') return
      const noticeRect = rects?.[0]
      const composerRect = rects?.[1]
      const availableHeight = Math.floor(Number(composerRect?.top || 0) - Number(noticeRect?.bottom || 0) - 12)
      if (availableHeight < 240) return
      const nextStyle = `height:${availableHeight}px;`
      if (nextStyle !== this.data.messagesScrollStyle) {
        this.setData({ messagesScrollStyle: nextStyle })
      }
    })
  }
})
