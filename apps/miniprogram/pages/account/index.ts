import {
  deleteAccount,
  getMe,
  getPoints,
  listOrders,
  listPointLedgers,
  updateMeProfile
} from '../../services/api'
import { OrderDetail, PointsLedgerItem, UserProfile } from '../../models/api'
import { formatDateTime, formatPrice, voiceInitial } from '../../utils/format'
import { ensureAuthenticated } from '../../utils/navigation'
import { clearLocalProjectData, setUser } from '../../utils/storage'
import { syncTabBarSelection } from '../../utils/tab-bar'
import { confirm, toast } from '../../utils/ui'

function orderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: '待支付',
    CREATED: '待支付',
    PAYING: '支付确认中',
    PAID: '已支付',
    CLOSED: '已关闭',
    REFUNDING: '退款中',
    REFUNDED: '已退款'
  }
  return map[String(status || '').toUpperCase()] || status || '未知状态'
}

function orderView(order: OrderDetail): any {
  return {
    ...order,
    priceText: order.amountFen == null ? '金额待确认' : formatPrice(order.amountFen),
    pointsText: order.points == null ? '积分待确认' : `${order.points} 积分`,
    statusText: orderStatusLabel(order.status),
    timeText: formatDateTime(order.paidAt || order.createdAt)
  }
}

function ledgerView(item: PointsLedgerItem): any {
  const typeMap: Record<string, string> = {
    REGISTER_GRANT: '注册赠送积分',
    TRIAL_GRANT: '新用户赠送积分',
    PURCHASE_GRANT: '购买积分到账',
    GENERATION_CONSUME: '成功生成扣除积分',
    REFUND: '退款调整',
    MANUAL_ADJUST: '人工调整',
    MANUAL_ADJUSTMENT: '人工调整',
    INVITE_GRANT: '邀请奖励积分'
  }
  return {
    ...item,
    title: typeMap[String(item.type || '')] || item.type || '积分变动',
    amountText: item.amount > 0 ? `+${item.amount}` : String(item.amount),
    positive: item.amount > 0,
    timeText: formatDateTime(item.createdAt)
  }
}

Page({
  data: {
    state: 'loading',
    errorMessage: '',
    user: null as UserProfile | null,
    userInitial: '我',
    voiceCount: 0,
    availablePoints: 0,
    orders: [] as any[],
    ledgers: [] as any[],
    orderExpanded: false,
    ledgerExpanded: false,
    updatingProfile: false,
    deletingAccount: false
  },
  onShow() {
    syncTabBarSelection(this, 'pages/account/index')
    if (!ensureAuthenticated()) return
    this.loadAccount()
  },
  onPullDownRefresh() {
    this.loadAccount(true)
  },
  async loadAccount(fromPullDown = false) {
    this.setData({ state: 'loading', errorMessage: '' })
    try {
      const [me, points, ordersResult, ledgersResult] = await Promise.all([
        getMe(),
        getPoints(),
        listOrders(),
        listPointLedgers()
      ])
      const orders = ordersResult.orders
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map(orderView)
      const ledgers = ledgersResult.ledgers
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map(ledgerView)
      this.setData({
        state: 'success',
        user: me.user,
        userInitial: voiceInitial(me.user.nickname || '我'),
        voiceCount: me.voiceCount == null ? 0 : me.voiceCount,
        availablePoints: points.availablePoints,
        orders,
        ledgers
      })
      setUser(me.user)
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '账户信息加载失败，请重试。' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },
  retryLoad() {
    this.loadAccount()
  },
  async editNickname() {
    if (this.data.updatingProfile) return
    const current = this.data.user && this.data.user.nickname || ''
    const result = await new Promise<any>(resolve => {
      wx.showModal({
        title: '修改昵称',
        content: current,
        editable: true,
        placeholderText: '请输入昵称',
        confirmText: '保存',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!result.confirm) return
    const nickname = String(result.content || '').trim().slice(0, 20)
    if (!nickname) {
      toast('昵称不能为空')
      return
    }
    this.setData({ updatingProfile: true })
    try {
      const user = await updateMeProfile({ nickname })
      setUser(user)
      this.setData({ user, userInitial: voiceInitial(user.nickname || '我'), updatingProfile: false })
      toast('昵称已更新', 'success')
    } catch (error: any) {
      this.setData({ updatingProfile: false })
      toast(error.message || '昵称更新失败')
    }
  },
  goVoices() {
    wx.switchTab({ url: '/pages/voices/index' })
  },
  openPurchase() {
    wx.navigateTo({ url: '/pages/purchase/index?source=account' })
  },
  toggleOrders() {
    this.setData({ orderExpanded: !this.data.orderExpanded })
  },
  toggleLedgers() {
    this.setData({ ledgerExpanded: !this.data.ledgerExpanded })
  },
  showInfo(event: any) {
    const type = String(event.detail?.key || event.currentTarget?.dataset?.type || '')
    if (type === 'policy' || type === 'terms' || type === 'ai') {
      const target = type === 'policy' ? 'privacy' : type
      wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(target)}` })
      return
    }
    const contentMap: Record<string, { title: string; content: string }> = {
      help: {
        title: '使用帮助',
        content: '选择 8–60 秒视频，再标记 8–20 秒清晰单人说话片段。试听完整播放后，可使用该声音进行对话或“说一句”。'
      },
      service: {
        title: '退款与售后',
        content: '支付、生成或删除异常时，请通过小程序客服提供订单时间和声音名称。支付结果与积分到账均以服务端记录为准。'
      },
      feedback: {
        title: '意见反馈',
        content: '请记录发生问题的页面、时间、手机系统和错误提示，提交给运营客服。前端不会展示或保存声音供应商音色 ID。'
      },
      privacy: {
        title: '数据与隐私',
        content: '原视频仅用于提取所选声音片段；声音和生成记录均为私有数据。你可以在声音设置中清空对话或删除整个声音。'
      },
      rules: {
        title: '声音使用规则',
        content: '仅可使用本人声音，或已取得声音本人、合法权利人或监护人明确授权的声音。不得用于身份核验、财产操作、营销外呼或冒充公众人物。'
      }
    }
    const item = contentMap[type]
    if (!item) return
    wx.showModal({ ...item, showCancel: false, confirmText: '知道了' })
  },
  async removeAccount() {
    if (this.data.deletingAccount) return
    const accepted = await confirm({
      title: '注销账号？',
      content: '注销将启动服务端数据删除流程。声音、对话和生成记录将无法恢复；必要的订单记录可能按法定期限保留。',
      confirmText: '确认注销',
      confirmColor: '#D85B63'
    })
    if (!accepted) return
    this.setData({ deletingAccount: true })
    try {
      await deleteAccount()
      clearLocalProjectData()
      wx.reLaunch({ url: '/pages/login/index' })
    } catch (error: any) {
      this.setData({ deletingAccount: false })
      toast(error.message || '账号注销失败，请稍后重试。')
    }
  }
})
