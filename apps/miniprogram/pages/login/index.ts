import { loginWechat } from '../../services/api'
import { LOCAL_DEV_LOGIN_CODE, LOCAL_DEV_MODE } from '../../config'
import {
  consumePostLoginRoute,
  getToken,
  setToken,
  setUser
} from '../../utils/storage'
import { chooseFallbackAvatar } from '../../utils/avatar-picker'

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
    this.setData({ nickname: String(event.detail.value || '').trimStart(), errorMessage: '' })
  },
  noop() {},
  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed, errorMessage: '' })
  },
  showAgreement(event: any) {
    const type = event.currentTarget.dataset.type
    wx.showModal({
      title: type === 'privacy' ? '隐私政策' : '服务协议',
      content: type === 'privacy'
        ? '正式上线前请由运营方发布完整隐私政策。本前端不会保存声音模型 ID、API 密钥或支付密钥。'
        : '正式上线前请由运营方发布完整服务协议。AI 生成内容不代表声音本人真实表达。',
      showCancel: false,
      confirmText: '知道了'
    })
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
    const nickname = String(formNickname || this.data.nickname || '').trim()
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
      const response = await loginWechat({
        code: LOCAL_DEV_MODE ? LOCAL_DEV_LOGIN_CODE : loginResult.code,
        profile: { nickname, avatarUrl: this.data.avatarUrl }
      })
      if (!response.token) throw new Error('登录响应缺少访问令牌。')
      setToken(response.token)
      setUser({
        ...response.user,
        nickname: response.user.nickname || nickname,
        avatarUrl: response.user.avatarUrl || this.data.avatarUrl
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
      const message = error && (error.message || error.errMsg)
      this.setData({
        loading: false,
        showProfileSheet: true,
        success: false,
        errorMessage: message || '登录失败，请稍后重试。'
      })
    }
  }
})
