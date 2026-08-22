import { loginWechat } from '../../services/api'
import { LOCAL_DEV_LOGIN_CODE, LOCAL_DEV_MODE } from '../../config'
import {
  consumePostLoginRoute,
  getToken,
  setToken,
  setUser
} from '../../utils/storage'

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    agreed: false,
    loading: false,
    success: false,
    errorMessage: ''
  },
  onShow() {
    if (getToken()) wx.switchTab({ url: '/pages/home/index' })
  },
  onChooseAvatar(event: any) {
    const avatarUrl = event.detail && event.detail.avatarUrl
    if (avatarUrl) this.setData({ avatarUrl })
  },
  onNicknameInput(event: any) {
    this.setData({ nickname: String(event.detail.value || '').trimStart() })
  },
  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed, errorMessage: '' })
  },
  showAgreement(event: any) {
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(type === 'privacy' ? 'privacy' : 'terms')}` })
  },
  async submitLogin() {
    if (this.data.loading) return
    if (!this.data.agreed) {
      this.setData({ errorMessage: '请先阅读并同意服务协议与隐私政策。' })
      return
    }
    this.setData({ loading: true, errorMessage: '' })
    try {
      const loginResult = await new Promise<any>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      if (!loginResult.code && !LOCAL_DEV_MODE) throw new Error('未获取到微信登录凭证。')
      const persistentAvatarUrl = /^https:\/\//i.test(String(this.data.avatarUrl || ''))
        ? this.data.avatarUrl
        : undefined
      const profile = this.data.nickname || persistentAvatarUrl
        ? { nickname: this.data.nickname || undefined, avatarUrl: persistentAvatarUrl }
        : undefined
      const response = await loginWechat({
        code: LOCAL_DEV_MODE ? LOCAL_DEV_LOGIN_CODE : loginResult.code,
        profile
      })
      if (!response.token) throw new Error('登录响应缺少访问令牌。')
      setToken(response.token)
      setUser(response.user)
      this.setData({ loading: false, success: true })
      const destination = consumePostLoginRoute() || '/pages/home/index'
      setTimeout(() => {
        if (destination === '/pages/home/index' || destination.startsWith('/pages/home/index?')) {
          wx.switchTab({ url: '/pages/home/index' })
          return
        }
        if (destination.startsWith('/pages/voices/index')) {
          wx.switchTab({ url: '/pages/voices/index' })
          return
        }
        if (destination.startsWith('/pages/account/index')) {
          wx.switchTab({ url: '/pages/account/index' })
          return
        }
        wx.reLaunch({ url: destination })
      }, 420)
    } catch (error: any) {
      this.setData({
        loading: false,
        success: false,
        errorMessage: error.message || '登录失败，请稍后重试。'
      })
    }
  }
})
