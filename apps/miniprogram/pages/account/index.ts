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
import { clearLocalProjectData, getUser, setUser } from '../../utils/storage'
import { syncTabBarSelection } from '../../utils/tab-bar'
import { confirm, toast } from '../../utils/ui'
import {
  chooseFallbackAvatar,
  persistProfileAvatar,
  resolveProfileAvatarSource
} from '../../utils/avatar-picker'

const NICKNAME_MAX_LENGTH = 10

function limitNickname(value: unknown): string {
  return Array.from(String(value || '').trimStart()).slice(0, NICKNAME_MAX_LENGTH).join('')
}

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

const LEGAL_ROUTE_MAP: Record<string, string> = {
  help: 'help',
  service: 'service',
  feedback: 'feedback',
  privacy: 'data-privacy',
  rules: 'rules',
  policy: 'privacy',
  terms: 'terms',
  ai: 'ai'
}

function refreshNotice(sections: string[]): string {
  if (sections.length === 0) return ''
  if (sections.length === 1) return `${sections[0]}暂未更新，点击重试`
  if (sections.length === 2) return `${sections[0]}和${sections[1]}暂未更新，点击重试`
  return '部分账户信息暂未更新，点击重试'
}

Page({
  data: {
    errorMessage: '',
    user: null as UserProfile | null,
    avatarDisplayUrl: '',
    userInitial: '我',
    voiceCount: 0,
    availablePoints: 0,
    orders: [] as any[],
    ledgers: [] as any[],
    orderExpanded: false,
    ledgerExpanded: false,
    updatingAvatar: false,
    updatingProfile: false,
    showNicknameEditor: false,
    nicknameDraft: '',
    nicknameCount: 0,
    deletingAccount: false,
    refreshing: false
  },
  onShow() {
    syncTabBarSelection(this, 'pages/account/index')
    if (!ensureAuthenticated()) return
    void this.prepareAccount()
  },
  onPullDownRefresh() {
    void this.loadAccount(true)
  },
  async prepareAccount() {
    await this.hydrateCachedUser()
    await this.loadAccount()
  },
  async hydrateCachedUser() {
    const localUser = getUser()
    if (!localUser) return
    const avatarDisplayUrl = await this.resolveAvatarDisplayUrl(String(localUser.avatarUrl || ''))
    this.setData({
      user: localUser,
      avatarDisplayUrl,
      userInitial: voiceInitial(localUser.nickname || '我')
    })
  },
  async loadAccount(fromPullDown = false) {
    const refreshToken = (this.refreshToken || 0) + 1
    this.refreshToken = refreshToken
    this.setData({ refreshing: true, errorMessage: '' })
    try {
      const cachedUser = this.data.user || getUser()
      const cachedAvatarUrl = String(cachedUser?.avatarUrl || '')
      const [meResult, pointsResult, ordersResult, ledgersResult] = await Promise.allSettled([
        getMe(),
        getPoints(),
        listOrders(),
        listPointLedgers()
      ])
      if (this.refreshToken !== refreshToken) return

      const failedSections: string[] = []
      const patch: Record<string, any> = {}

      if (meResult.status === 'fulfilled') {
        const me = meResult.value
        const serverAvatarUrl = String(me.user.avatarUrl || '')
        const avatarSource = serverAvatarUrl || cachedAvatarUrl
        const user = serverAvatarUrl || !cachedAvatarUrl
          ? me.user
          : { ...me.user, avatarUrl: cachedAvatarUrl }
        patch.user = user
        patch.avatarDisplayUrl = await this.resolveAvatarDisplayUrl(avatarSource)
        if (this.refreshToken !== refreshToken) return
        patch.userInitial = voiceInitial(user.nickname || '我')
        patch.voiceCount = me.voiceCount == null ? 0 : me.voiceCount
        setUser(user)
        if (!serverAvatarUrl && cachedAvatarUrl) void this.syncProfileAvatar(cachedAvatarUrl)
      } else {
        failedSections.push('账户资料')
      }

      if (pointsResult.status === 'fulfilled') {
        patch.availablePoints = pointsResult.value.availablePoints
      } else {
        failedSections.push('积分')
      }

      if (ordersResult.status === 'fulfilled') {
        patch.orders = ordersResult.value.orders
          .slice()
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .map(orderView)
      } else {
        failedSections.push('订单')
      }

      if (ledgersResult.status === 'fulfilled') {
        patch.ledgers = ledgersResult.value.ledgers
          .slice()
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .map(ledgerView)
      } else {
        failedSections.push('积分记录')
      }

      patch.errorMessage = refreshNotice(failedSections)
      patch.refreshing = false
      this.setData(patch)
    } catch (_error) {
      if (this.refreshToken !== refreshToken) return
      this.setData({
        refreshing: false,
        errorMessage: '账户信息暂未更新，点击重试'
      })
    } finally {
      if (this.refreshToken === refreshToken) this.setData({ refreshing: false })
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },
  retryLoad() {
    if (this.data.refreshing) return
    void this.loadAccount()
  },
  async resolveAvatarDisplayUrl(source: string) {
    if (!source) return ''
    try {
      return await resolveProfileAvatarSource(source)
    } catch (_error) {
      return /^cloud:\/\//i.test(source) ? '' : source
    }
  },
  async syncProfileAvatar(source: string) {
    if (!source || this.avatarSyncing) return
    this.avatarSyncing = true
    try {
      const avatarUrl = await persistProfileAvatar(source)
      const user = await updateMeProfile({ avatarUrl })
      const avatarDisplayUrl = await this.resolveAvatarDisplayUrl(avatarUrl)
      setUser(user)
      this.setData({ user, avatarDisplayUrl })
    } catch (_error) {
      // Keep showing the local avatar and retry on the next account-page load.
    } finally {
      this.avatarSyncing = false
    }
  },
  onAvatarLoadError() {
    this.setData({ avatarDisplayUrl: '' })
  },
  editProfile() {
    if (this.data.updatingAvatar || this.data.updatingProfile) return
    wx.showActionSheet({
      itemList: ['更换头像', '修改昵称'],
      success: (result: { tapIndex: number }) => {
        if (Number(result.tapIndex) === 0) void this.editAvatar()
        if (Number(result.tapIndex) === 1) void this.editNickname()
      }
    })
  },
  async editAvatar() {
    if (this.data.updatingAvatar) return
    try {
      const localAvatarUrl = await chooseFallbackAvatar()
      const optimisticUser = this.data.user
        ? { ...this.data.user, avatarUrl: localAvatarUrl }
        : null
      if (optimisticUser) setUser(optimisticUser)
      this.setData({
        user: optimisticUser || this.data.user,
        avatarDisplayUrl: localAvatarUrl,
        updatingAvatar: true
      })
      const avatarUrl = await persistProfileAvatar(localAvatarUrl)
      const user = await updateMeProfile({ avatarUrl })
      const avatarDisplayUrl = await this.resolveAvatarDisplayUrl(avatarUrl)
      setUser(user)
      this.setData({ user, avatarDisplayUrl, updatingAvatar: false })
      toast('头像已更新', 'success')
    } catch (error: any) {
      this.setData({ updatingAvatar: false })
      const message = String(error?.message || '')
      if (/cancel/i.test(message)) return
      toast(message || '头像更新失败，请重试。')
    }
  },
  editNickname() {
    if (this.data.updatingProfile || this.data.updatingAvatar) return
    const nicknameDraft = limitNickname(this.data.user && this.data.user.nickname)
    this.setData({
      showNicknameEditor: true,
      nicknameDraft,
      nicknameCount: Array.from(nicknameDraft).length
    })
  },
  onNicknameInput(event: any) {
    const nicknameDraft = limitNickname(event?.detail?.value)
    this.setData({ nicknameDraft, nicknameCount: Array.from(nicknameDraft).length })
  },
  closeNicknameEditor() {
    if (this.data.updatingProfile) return
    this.setData({ showNicknameEditor: false, nicknameDraft: '', nicknameCount: 0 })
  },
  noop() {},
  async saveNickname() {
    if (this.data.updatingProfile || this.data.updatingAvatar) return
    const nickname = limitNickname(this.data.nicknameDraft).trim()
    if (!nickname) {
      toast('昵称不能为空')
      return
    }
    this.setData({ updatingProfile: true })
    try {
      const user = await updateMeProfile({ nickname })
      setUser(user)
      this.setData({
        user,
        userInitial: voiceInitial(user.nickname || '我'),
        updatingProfile: false,
        showNicknameEditor: false,
        nicknameDraft: '',
        nicknameCount: 0
      })
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
    const target = LEGAL_ROUTE_MAP[type]
    if (!target) return
    wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(target)}` })
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
