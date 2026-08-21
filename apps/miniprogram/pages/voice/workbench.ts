import {
  ApiError,
  createOrder,
  getConversation,
  getMessage,
  getOrder,
  getVoice,
  getVoiceQuota,
  refreshOrder,
  requestPayment,
  sendChatMessage,
  sendExactSpeech
} from '../../services/api'
import {
  ConversationMessage,
  PurchaseOption,
  QuotaResponse
} from '../../models/api'
import {
  MESSAGE_POLL_ATTEMPTS,
  ORDER_POLL_ATTEMPTS,
  POLL_INTERVAL_MS
} from '../../config'
import { ensureAuthenticated } from '../../utils/navigation'
import {
  clearPendingOrderId,
  clearWorkbenchDraft,
  getPendingOrderId,
  getWorkbenchDraft,
  markPendingOrderPaymentCompleted,
  pendingOrderPaymentCompleted,
  setPendingOrderId,
  setWorkbenchDraft
} from '../../utils/storage'
import { delay, confirm, toast } from '../../utils/ui'
import { uuidV4 } from '../../utils/uuid'
import { voiceInitial } from '../../utils/format'

function quotaLabel(quota: QuotaResponse): string {
  if (quota.trialQuotaRemaining === 1 && quota.paidQuotaRemaining === 0) return '免费体验 1 次'
  return `剩余 ${quota.availableQuota} 次`
}

function messageView(message: ConversationMessage, initial: string): any {
  return {
    ...message,
    isUser: message.role === 'USER',
    isAssistant: message.role === 'ASSISTANT',
    showAudio: message.role === 'ASSISTANT' && message.status === 'READY' && Boolean(message.audioUrl),
    tag: message.mode === 'EXACT_TTS' ? 'AI生成' : 'AI回复',
    initial
  }
}

Page({
  data: {
    voiceId: '',
    state: 'loading',
    errorMessage: '',
    voiceName: '这个声音',
    voiceInitial: '声',
    quota: {
      trialQuotaRemaining: 0,
      paidQuotaRemaining: 0,
      availableQuota: 0
    } as QuotaResponse,
    quotaText: '剩余 0 次',
    mode: 'chat' as 'chat' | 'exact',
    showModeChooser: false,
    messages: [] as any[],
    chatMessages: [] as any[],
    exactResults: [] as any[],
    chatText: '',
    exactText: '',
    chatCount: 0,
    exactCount: 0,
    sending: false,
    pendingText: '',
    pendingMode: '',
    generationStatusText: '',
    scrollTarget: '',
    purchaseVisible: false,
    purchaseOption: null as PurchaseOption | null,
    paying: false,
    paymentPending: false,
    purchaseMessage: ''
  },
  onLoad(options: Record<string, string>) {
    this.destroyed = false
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音信息。' })
      return
    }
    const stored = getWorkbenchDraft(voiceId)
    const mode = options.mode === 'exact' ? 'exact' : stored?.mode || 'chat'
    const showModeChooser = options.choose === '1'
    this.setData({
      voiceId,
      mode,
      showModeChooser,
      chatText: stored?.chatText || '',
      exactText: stored?.exactText || '',
      chatCount: (stored?.chatText || '').length,
      exactCount: (stored?.exactText || '').length
    })
    this.loadData()
  },
  onShow() {
    if (this.data.voiceId && this.data.state === 'success' && !this.data.sending && !this.data.paymentPending) {
      this.loadData(false)
    }
  },
  onUnload() {
    this.destroyed = true
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
      const [quota, conversation] = await Promise.all([
        getVoiceQuota(this.data.voiceId),
        getConversation(this.data.voiceId)
      ])
      const initial = voiceInitial(voice.name)
      const messages = conversation.messages.map(item => messageView(item, initial))
      const chatMessages = messages.filter(item => item.mode === 'CHAT')
      const exactResults = messages.filter(item => item.mode === 'EXACT_TTS' && item.isAssistant).reverse()
      const scrollTarget = chatMessages.length ? `message-${chatMessages[chatMessages.length - 1].id}` : ''
      this.setData({
        state: 'success',
        errorMessage: '',
        voiceName: voice.name,
        voiceInitial: initial,
        quota,
        quotaText: quotaLabel(quota),
        messages,
        chatMessages,
        exactResults,
        scrollTarget
      })
      const pendingOrderId = getPendingOrderId(this.data.voiceId)
      if (pendingOrderId && !this.data.paymentPending && !this.data.paying) {
        this.resumePendingOrder(pendingOrderId)
      }
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '工作台加载失败，请重试。' })
    }
  },
  selectMode(event: any) {
    const mode = event.currentTarget.dataset.mode === 'exact' ? 'exact' : 'chat'
    this.setData({ mode, showModeChooser: false })
    this.persistDraft(mode)
  },
  switchMode(event: any) {
    const mode = event.currentTarget.dataset.mode === 'exact' ? 'exact' : 'chat'
    this.setData({ mode })
    this.persistDraft(mode)
  },
  chooseAnotherMode() {
    this.setData({ showModeChooser: true })
  },
  openSettings() {
    wx.navigateTo({ url: `/pages/voice/settings?voiceId=${encodeURIComponent(this.data.voiceId)}` })
  },
  onChatInput(event: any) {
    const chatText = String(event.detail.value || '').slice(0, 200)
    this.setData({ chatText, chatCount: chatText.length, errorMessage: '' })
    this.persistDraft('chat', { chatText })
  },
  onExactInput(event: any) {
    const exactText = String(event.detail.value || '').slice(0, 50)
    this.setData({ exactText, exactCount: exactText.length, errorMessage: '' })
    this.persistDraft('exact', { exactText })
  },
  useQuickPrompt(event: any) {
    const text = String(event.currentTarget.dataset.text || '')
    this.setData({ chatText: text, chatCount: text.length })
    this.persistDraft('chat', { chatText: text })
  },
  persistDraft(mode = this.data.mode, patch: Record<string, string> = {}) {
    setWorkbenchDraft(this.data.voiceId, {
      mode,
      chatText: patch.chatText == null ? this.data.chatText : patch.chatText,
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
    const text = String(mode === 'chat' ? this.data.chatText : this.data.exactText).trim()
    if (!text) {
      toast(mode === 'chat' ? '请输入想说的话' : '请输入希望 TA 说的话')
      return
    }
    if (mode === 'exact' && text.length > 50) {
      toast('“说一句”最多 50 个字符')
      return
    }
    this.persistDraft(mode)
    this.setData({
      sending: true,
      errorMessage: '',
      pendingText: text,
      pendingMode: mode,
      generationStatusText: mode === 'chat' ? '正在生成 AI 回复…' : '正在生成 AI 语音…'
    })
    try {
      const idempotencyKey = uuidV4()
      const accepted = mode === 'chat'
        ? await sendChatMessage(this.data.voiceId, text, idempotencyKey)
        : await sendExactSpeech(this.data.voiceId, text, idempotencyKey)
      if (!accepted.messageId) throw new Error('服务端未返回生成任务 ID。')
      await this.pollMessage(accepted.messageId)
    } catch (error: any) {
      if (error instanceof ApiError && error.code === 'QUOTA_EXHAUSTED') {
        if (!error.purchaseOption) {
          this.setData({ sending: false, pendingText: '', pendingMode: '', errorMessage: '服务端未返回可购买商品，请稍后重试。' })
          return
        }
        if (
          error.purchaseOption.productCode !== 'VOICE_QUOTA_10' ||
          error.purchaseOption.amountFen !== 990 ||
          error.purchaseOption.quota !== 10 ||
          error.purchaseOption.autoRenew !== false
        ) {
          this.setData({
            sending: false,
            pendingText: '',
            pendingMode: '',
            errorMessage: '服务端商品配置与冻结合同不一致，已停止发起支付。'
          })
          return
        }
        this.setData({
          sending: false,
          pendingText: '',
          pendingMode: '',
          purchaseVisible: true,
          purchaseOption: error.purchaseOption,
          purchaseMessage: ''
        })
        return
      }
      this.setData({
        sending: false,
        pendingText: '',
        pendingMode: '',
        errorMessage: error.message || '生成失败，本次不会扣次数。'
      })
    }
  },
  async pollMessage(messageId: string) {
    for (let attempt = 0; attempt < MESSAGE_POLL_ATTEMPTS; attempt += 1) {
      if (this.destroyed) return
      const result = await getMessage(messageId)
      if (result.status === 'READY') {
        const completedMode = this.data.pendingMode
        const nextChatText = completedMode === 'chat' ? '' : this.data.chatText
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
        this.setData({
          chatText: nextChatText,
          exactText: nextExactText,
          chatCount: nextChatText.length,
          exactCount: nextExactText.length,
          sending: false,
          pendingText: '',
          pendingMode: '',
          generationStatusText: ''
        })
        await this.loadData(false)
        return
      }
      if (result.status === 'FAILED' || result.status === 'BLOCKED') {
        throw new Error(result.status === 'BLOCKED'
          ? '这段内容不符合使用规则，请修改后重试。'
          : '生成失败，本次不会扣次数。')
      }
      await delay(POLL_INTERVAL_MS)
    }
    throw new Error('生成时间较长，请稍后在当前页面刷新查看。')
  },
  closePurchase() {
    if (this.data.paying || this.data.paymentPending) return
    this.setData({ purchaseVisible: false, purchaseMessage: '' })
  },
  async buyQuota() {
    if (this.data.paying || this.data.paymentPending || !this.data.purchaseOption) return
    const pendingOrderId = getPendingOrderId(this.data.voiceId)
    if (pendingOrderId) {
      this.resumePendingOrder(pendingOrderId)
      return
    }
    this.setData({ paying: true, purchaseMessage: '' })
    let paymentCompleted = false
    try {
      const result = await createOrder(this.data.purchaseOption.productCode, this.data.voiceId)
      if (!result.order.id) throw new Error('服务端未返回订单 ID。')
      if (
        result.order.productCode !== this.data.purchaseOption.productCode ||
        result.order.amountFen !== this.data.purchaseOption.amountFen ||
        result.order.quota !== this.data.purchaseOption.quota
      ) {
        throw new Error('服务端订单商品与购买选项不一致，已停止支付。')
      }
      setPendingOrderId(this.data.voiceId, result.order.id)
      const payment = result.payment
      if (!payment.timeStamp || !payment.nonceStr || !payment.package || !payment.paySign) {
        throw new Error('微信支付参数不完整。')
      }
      await requestPayment(payment)
      paymentCompleted = true
      markPendingOrderPaymentCompleted(this.data.voiceId, result.order.id)
      this.setData({ paying: false, paymentPending: true, purchaseMessage: '支付已完成，正在确认次数入账…' })
      await this.pollOrderUntilGranted(result.order.id)
    } catch (error: any) {
      this.setData({ paying: false })
      if (error.isPaymentCancel || error.code === 'PAYMENT_CANCELLED') {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ purchaseVisible: false, paymentPending: false, purchaseMessage: '' })
        toast('已取消支付，输入内容已保留')
        return
      }
      if (!paymentCompleted) clearPendingOrderId(this.data.voiceId)
      this.setData({ paymentPending: false, purchaseMessage: error.message || '支付未完成，请重试。' })
    }
  },
  async resumePendingOrder(orderId: string) {
    if (!orderId || this.data.paymentPending) return
    try {
      let order
      try {
        order = await refreshOrder(orderId)
      } catch (_error) {
        order = await getOrder(orderId)
      }
      if (order.status === 'CLOSED' || order.status === 'REFUNDED') {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ paymentPending: false, purchaseVisible: false, purchaseMessage: '' })
        return
      }
      const clientPaymentCompleted = pendingOrderPaymentCompleted(this.data.voiceId, orderId)
      if ((order.status === 'CREATED' || order.status === 'PENDING') && !order.quotaGranted && !order.quotaGrantedAt && !clientPaymentCompleted) {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ paymentPending: false, purchaseVisible: false, purchaseMessage: '' })
        return
      }
      const option: PurchaseOption | null = order.amountFen && order.quota && order.productCode
        ? {
            productCode: order.productCode,
            amountFen: order.amountFen,
            quota: order.quota,
            autoRenew: false
          }
        : this.data.purchaseOption
      this.setData({
        purchaseVisible: true,
        purchaseOption: option,
        paymentPending: true,
        purchaseMessage: '正在恢复支付结果确认…'
      })
      await this.pollOrderUntilGranted(orderId)
    } catch (error: any) {
      clearPendingOrderId(this.data.voiceId)
      this.setData({ paymentPending: false, purchaseVisible: false, errorMessage: error.message || '无法恢复支付订单。' })
    }
  },
  async pollOrderUntilGranted(orderId: string) {
    for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
      if (this.destroyed) return
      let order
      try {
        order = await refreshOrder(orderId)
      } catch (_error) {
        order = await getOrder(orderId)
      }
      const quota = await getVoiceQuota(this.data.voiceId)
      const serverConfirmedGrant = Boolean(order.quotaGranted || order.quotaGrantedAt)
      if (quota.availableQuota > 0 && order.status === 'PAID' && serverConfirmedGrant) {
        clearPendingOrderId(this.data.voiceId)
        this.setData({
          paymentPending: false,
          purchaseVisible: false,
          purchaseMessage: '',
          quota,
          quotaText: quotaLabel(quota)
        })
        toast('购买成功，10 次已到账', 'success')
        await this.loadData(false)
        return
      }
      if (order.status === 'CLOSED' || order.status === 'REFUNDED') {
        clearPendingOrderId(this.data.voiceId)
        throw new Error('订单已关闭或退款，未增加生成次数。')
      }
      await delay(POLL_INTERVAL_MS)
    }
    this.setData({
      paymentPending: false,
      purchaseVisible: false,
      errorMessage: '支付结果仍在服务端确认。输入内容已保留，请稍后重新进入页面刷新。'
    })
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
  }
})
