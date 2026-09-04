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
    loading: false,
    success: false,
    errorMessage: ''
  },
  onShow() {
    if (getToken()) wx.switchTab({ url: '/pages/home/index' })
  },
  showAgreement(event: any) {
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/legal/index?type=${encodeURIComponent(type === 'privacy' ? 'privacy' : 'terms')}` })
  },
  async submitLogin() {
    if (this.data.loading) return
    this.setData({ loading: true, success: false, errorMessage: '' })
    try {
      const loginResult = await new Promise<any>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      if (!loginResult.code && !LOCAL_DEV_MODE) throw new Error('未获取到微信登录凭证。')
      const response = await loginWechat({
        code: LOCAL_DEV_MODE ? LOCAL_DEV_LOGIN_CODE : loginResult.code
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
