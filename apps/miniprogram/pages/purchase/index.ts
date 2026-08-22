import {
  confirmLocalTestPayment,
  createOrder,
  getPoints,
  getOrder,
  getVoice,
  listProducts,
  refreshOrder,
  requestPayment
} from '../../services/api'
import { OrderDetail, PointsBalanceResponse, PurchaseOption } from '../../models/api'
import { ORDER_POLL_ATTEMPTS, POLL_INTERVAL_MS } from '../../config'
import { ensureAuthenticated } from '../../utils/navigation'
import {
  clearPendingOrderId,
  getPendingOrderId,
  markPendingOrderPaymentCompleted,
  pendingOrderPaymentCompleted,
  setPendingOrderId
} from '../../utils/storage'
import { delay, toast } from '../../utils/ui'
import { formatPrice, voiceInitial } from '../../utils/format'

function pointsLabel(points: PointsBalanceResponse): string {
  return `当前剩余 ${Math.max(0, Number(points.availablePoints || 0))} 积分`
}

function validPaymentParams(payment: Record<string, any>): boolean {
  return Boolean(payment.timeStamp && payment.nonceStr && payment.package && payment.paySign)
}

function isLocalTestPaymentPackage(pkg = ''): boolean {
  return /^prepay_id=mock-prepay-/i.test(String(pkg || ''))
}

function backToWorkbench(voiceId: string, mode: 'chat' | 'exact'): void {
  const pages = getCurrentPages()
  const hasWorkbenchUnderneath = pages.slice(0, -1).some((page: any) => page && page.route === 'pages/voice/workbench')
  if (pages.length > 1 && hasWorkbenchUnderneath) {
    wx.navigateBack()
    return
  }
  wx.redirectTo({ url: `/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=${mode}` })
}

Page({
  data: {
    voiceId: '',
    mode: 'exact' as 'chat' | 'exact',
    state: 'loading',
    errorMessage: '',
    voiceName: '这个声音',
    voiceInitial: '声',
    points: {
      availablePoints: 0
    } as PointsBalanceResponse,
    pointsText: '当前剩余 0 积分',
    priceText: '',
    purchaseOption: null as PurchaseOption | null,
    requestedProductCode: '',
    paying: false,
    pending: false,
    purchaseMessage: '',
    orderId: ''
  },
  onLoad(options: Record<string, string>) {
    this.destroyed = false
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音信息。' })
      return
    }
    const mode = options.mode === 'chat' ? 'chat' : 'exact'
    const productCode = String(options.productCode || '')
    this.setData({ voiceId, mode, requestedProductCode: productCode })
    this.loadData()
  },
  onShow() {
    if (this.data.voiceId && this.data.state === 'success' && !this.data.paying && !this.data.pending) {
      this.loadData(false)
    }
  },
  onUnload() {
    this.destroyed = true
  },
  async loadData(showLoading = true) {
    if (showLoading) this.setData({ state: 'loading', errorMessage: '' })
    try {
      const [voice, points, productsResult] = await Promise.all([
        getVoice(this.data.voiceId),
        getPoints(),
        listProducts()
      ])
      const products = productsResult.products
      const requestedProductCode = String(this.data.requestedProductCode || '')
      const purchaseOption = (requestedProductCode
        ? products.find(item => item.productCode === requestedProductCode)
        : products[0]) || null
      if (!purchaseOption) throw new Error('服务端暂未返回可购买积分商品。')
      this.setData({
        state: 'success',
        errorMessage: '',
        voiceName: voice.name,
        voiceInitial: voiceInitial(voice.name),
        points,
        pointsText: pointsLabel(points),
        priceText: formatPrice(purchaseOption.amountFen),
        purchaseOption
      })
      const pendingOrderId = getPendingOrderId(this.data.voiceId)
      if (pendingOrderId && !this.data.paying && !this.data.pending) {
        await this.resumePendingOrder(pendingOrderId)
      }
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '购买页加载失败，请重试。' })
    }
  },
  goBack() {
    if (this.data.paying || this.data.pending) return
    backToWorkbench(this.data.voiceId, this.data.mode)
  },
  async submitPurchase() {
    if (this.data.paying || this.data.pending) return
    const pendingOrderId = getPendingOrderId(this.data.voiceId)
    if (pendingOrderId) {
      await this.resumePendingOrder(pendingOrderId)
      return
    }
    this.setData({ paying: true, purchaseMessage: '', errorMessage: '' })
    let paymentCompleted = false
    try {
      if (!this.data.purchaseOption) throw new Error('服务端暂未返回可购买积分商品。')
      const result = await createOrder(this.data.purchaseOption.productCode, this.data.voiceId)
      if (!result.order.id) throw new Error('服务端未返回订单 ID。')
      this.assertProductOrder(result.order)
      if (!validPaymentParams(result.payment as any)) throw new Error('微信支付参数不完整。')
      setPendingOrderId(this.data.voiceId, result.order.id)
      this.setData({ orderId: result.order.id })
      await requestPayment(result.payment)
      paymentCompleted = true
      if (isLocalTestPaymentPackage(result.payment.package)) {
        await confirmLocalTestPayment(result.order.id)
      }
      markPendingOrderPaymentCompleted(this.data.voiceId, result.order.id)
      this.setData({
        paying: false,
        pending: true,
        purchaseMessage: '支付已完成，正在确认积分入账…'
      })
      await this.pollOrderUntilGranted(result.order.id)
    } catch (error: any) {
      this.setData({ paying: false })
      if (error.isPaymentCancel || error.code === 'PAYMENT_CANCELLED') {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ pending: false, purchaseMessage: '', orderId: '' })
        toast('已取消支付，原输入内容已保留')
        backToWorkbench(this.data.voiceId, this.data.mode)
        return
      }
      if (!paymentCompleted) clearPendingOrderId(this.data.voiceId)
      this.setData({
        pending: false,
        purchaseMessage: '',
        errorMessage: error.message || '支付未完成，请稍后重试。'
      })
    }
  },
  async resumePendingOrder(orderId: string) {
    if (!orderId || this.data.pending) return
    this.setData({ pending: true, purchaseMessage: '正在恢复支付结果确认…', errorMessage: '', orderId })
    try {
      let order
      try {
        order = await refreshOrder(orderId)
      } catch (_error) {
        order = await getOrder(orderId)
      }
      if (order.status === 'CLOSED' || order.status === 'REFUNDED') {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ pending: false, purchaseMessage: '', orderId: '' })
        return
      }
      const clientPaymentCompleted = pendingOrderPaymentCompleted(this.data.voiceId, orderId)
      if ((order.status === 'CREATED' || order.status === 'PENDING') && !order.quotaGranted && !order.quotaGrantedAt && !clientPaymentCompleted) {
        clearPendingOrderId(this.data.voiceId)
        this.setData({ pending: false, purchaseMessage: '', orderId: '' })
        return
      }
      this.assertProductOrder(order)
      await this.pollOrderUntilGranted(orderId)
    } catch (error: any) {
      clearPendingOrderId(this.data.voiceId)
      this.setData({
        pending: false,
        purchaseMessage: '',
        orderId: '',
        errorMessage: error.message || '无法恢复支付订单。'
      })
    }
  },
  assertProductOrder(order: OrderDetail) {
    const option = this.data.purchaseOption
    if (!option) throw new Error('服务端暂未返回可购买积分商品。')
    if (
      order.productCode !== option.productCode ||
      order.amountFen !== option.amountFen ||
      order.points !== option.points
    ) {
      throw new Error('服务端订单商品与积分商品不一致，已停止支付。')
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
      const points = await getPoints()
      const serverConfirmedGrant = Boolean(order.pointsGranted || order.pointsGrantedAt || order.quotaGranted || order.quotaGrantedAt)
      if (points.availablePoints > 0 && order.status === 'PAID' && serverConfirmedGrant) {
        clearPendingOrderId(this.data.voiceId)
        this.setData({
          pending: false,
          purchaseMessage: '',
          orderId: '',
          points,
          pointsText: pointsLabel(points)
        })
        toast('购买成功，积分已到账', 'success')
        backToWorkbench(this.data.voiceId, this.data.mode)
        return
      }
      if (order.status === 'CLOSED' || order.status === 'REFUNDED') {
        clearPendingOrderId(this.data.voiceId)
        throw new Error('订单已关闭或退款，未增加积分。')
      }
      await delay(POLL_INTERVAL_MS)
    }
    this.setData({
      pending: false,
      purchaseMessage: '',
      errorMessage: '支付结果仍在服务端确认。输入内容已保留，请稍后重新进入页面刷新。',
      orderId
    })
  },
  showAgreement(event: any) {
    const type = String(event.currentTarget.dataset.type || '')
    wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(type === 'privacy' ? 'privacy' : 'terms')}` })
  }
})
