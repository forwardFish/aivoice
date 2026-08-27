import { loginWechat } from '../../services/api'
import { LOCAL_DEV_LOGIN_CODE, LOCAL_DEV_MODE } from '../../config'
import {
  consumePostLoginRoute,
  getToken,
  setToken,
  setUser
} from '../../utils/storage'
import {
  chooseFallbackAvatar,
  isPersistentAvatarSource,
  persistProfileAvatar
} from '../../utils/avatar-picker'

const NICKNAME_MAX_LENGTH = 10

function limitNickname(value: unknown): string {
  return Array.from(String(value || '').trimStart()).slice(0, NICKNAME_MAX_LENGTH).join('')
}

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    agreed: false,
    showProfileSheet: false,
    avatarFallbackVisible: false,
    loading: false,
    success: false,
    errorMessage: ''
  },
  onShow() {
    if (getToken()) wx.switchTab({ url: '/pages/home/index' })
  },
  onChooseAvatar(event: any) {
    const avatarUrl = event.detail && event.detail.avatarUrl
    if (avatarUrl) this.setData({ avatarUrl, errorMessage: '' })
  },
  onAvatarChooseError() {
    this.setData({
      avatarFallbackVisible: true,
      errorMessage: '微信头像在开发者工具中不可用，请改用相册选择。'
    })
  },
  async chooseAvatarFromAlbum() {
    try {
      const avatarUrl = await chooseFallbackAvatar()
      this.setData({ avatarUrl, avatarFallbackVisible: false, errorMessage: '' })
    } catch (error: any) {
      this.setData({ errorMessage: error.message || '头像选择失败，请重试。' })
    }
  },
  onNicknameInput(event: any) {
    this.setData({ nickname: limitNickname(event.detail.value), errorMessage: '' })
  },
  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed, errorMessage: '' })
  },
  showAgreement(event: any) {
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(type === 'privacy' ? 'privacy' : 'terms')}` })
  },
  submitLogin() {
    if (this.data.loading) return
    if (!this.data.agreed) {
      this.setData({ errorMessage: '请先阅读并同意服务协议与隐私政策。' })
      return
    }
    this.setData({ showProfileSheet: true, avatarFallbackVisible: false, errorMessage: '' })
  },
  closeProfileSheet() {
    if (this.data.loading) return
    this.setData({ showProfileSheet: false, errorMessage: '' })
  },
  async confirmProfileLogin(event: any) {
    if (this.data.loading) return
    const formNickname = event && event.detail && event.detail.value && event.detail.value.nickname
    const nickname = limitNickname(formNickname || this.data.nickname).trim()
    if (!this.data.avatarUrl) {
      this.setData({ errorMessage: '请先选择微信头像。' })
      return
    }
    if (!nickname) {
      this.setData({ errorMessage: '请先选择或填写微信昵称。' })
      return
    }
    this.setData({ nickname, loading: true, errorMessage: '' })
    try {
      const loginResult = await new Promise<any>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      if (!loginResult.code && !LOCAL_DEV_MODE) throw new Error('未获取到微信登录凭证。')
      let persistentAvatarUrl = isPersistentAvatarSource(this.data.avatarUrl)
        ? this.data.avatarUrl
        : undefined
      if (!persistentAvatarUrl) {
        try {
          persistentAvatarUrl = await persistProfileAvatar(this.data.avatarUrl)
        } catch (_error) {
          // Keep the selected local avatar for this device. The account page retries cloud sync after login.
        }
      }
      const response = await loginWechat({
        code: LOCAL_DEV_MODE ? LOCAL_DEV_LOGIN_CODE : loginResult.code,
        profile: { nickname, avatarUrl: persistentAvatarUrl }
      })
      if (!response.token) throw new Error('登录响应缺少访问令牌。')
      setToken(response.token)
      setUser({
        ...response.user,
        nickname: response.user.nickname || nickname,
        avatarUrl: response.user.avatarUrl || persistentAvatarUrl || this.data.avatarUrl
      })
      this.setData({ loading: false, showProfileSheet: false, success: true })
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
        showProfileSheet: true,
        success: false,
        errorMessage: error.message || '登录失败，请稍后重试。'
      })
    }
  }
})
