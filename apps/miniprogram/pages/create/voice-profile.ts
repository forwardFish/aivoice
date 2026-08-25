import {
  saveVoiceConsent,
  saveVoiceProfile,
  startVoiceProcess
} from '../../services/api'
import { PermissionType } from '../../models/api'
import { ensureAuthenticated } from '../../utils/navigation'

const CONSENT_TEXTS: Record<PermissionType, string> = {
  SELF: '我同意使用我的声音样本创建私有 AI 声音。',
  OTHER: '我已告知声音本人，并取得其对声音克隆和 AI 合成使用的明确同意。',
  MINOR: '我是该未成年人的监护人，或已取得其监护人的明确授权。'
}

Page({
  data: {
    voiceId: '',
    name: '',
    permissionType: '' as PermissionType | '',
    consentText: '',
    confirmed: false,
    submitting: false,
    errorMessage: '',
    options: [
      { key: 'SELF', title: '我的声音', description: '使用我本人的声音样本' },
      { key: 'OTHER', title: '他人的声音', description: '已取得声音本人明确同意' },
      { key: 'MINOR', title: '未成年人的声音', description: '已取得监护人明确授权' }
    ]
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ errorMessage: '缺少声音草稿信息，请重新开始创建。' })
      return
    }
    this.setData({ voiceId })
  },
  onNameInput(event: any) {
    this.setData({ name: String(event.detail.value || '').slice(0, 20), errorMessage: '' })
  },
  selectPermission(event: any) {
    const permissionType = String(event.currentTarget.dataset.key || '') as PermissionType
    if (!CONSENT_TEXTS[permissionType]) return
    this.setData({
      permissionType,
      consentText: CONSENT_TEXTS[permissionType],
      confirmed: false,
      errorMessage: ''
    })
  },
  toggleConfirmed() {
    if (!this.data.permissionType) {
      this.setData({ errorMessage: '请先选择声音使用权限。' })
      return
    }
    this.setData({ confirmed: !this.data.confirmed, errorMessage: '' })
  },
  showRules() {
    wx.showModal({
      title: '声音使用规则',
      content: '仅可使用本人声音，或已经取得声音本人、合法权利人或监护人明确授权的声音。不得用于身份核验、转账、借款、营销外呼、冒充公众人物或其他违法用途。',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  async submit() {
    if (this.data.submitting) return
    const name = String(this.data.name || '').trim()
    if (!name) {
      this.setData({ errorMessage: '请给这个声音起一个名字。' })
      return
    }
    if (!this.data.permissionType) {
      this.setData({ errorMessage: '请选择声音使用权限。' })
      return
    }
    if (!this.data.confirmed) {
      this.setData({ errorMessage: '请确认与当前权限类型对应的授权文案。' })
      return
    }
    this.setData({ submitting: true, errorMessage: '' })
    try {
      const savedProfile = await saveVoiceProfile(this.data.voiceId, {
        name,
        permissionType: this.data.permissionType
      })
      if (!savedProfile.consentVersion || !savedProfile.consentText) {
        throw new Error('服务端未返回当前授权文本，请稍后重试。')
      }
      this.setData({ consentText: savedProfile.consentText })
      await saveVoiceConsent(this.data.voiceId, {
        consentVersion: savedProfile.consentVersion,
        consentText: savedProfile.consentText,
        confirmed: true
      })
      await startVoiceProcess(this.data.voiceId)
      this.setData({ submitting: false })
      wx.redirectTo({ url: `/pages/create/progress?voiceId=${encodeURIComponent(this.data.voiceId)}` })
    } catch (error: any) {
      const message = String(error.message || '')
      if (error.code === 'SOURCE_VIDEO_REQUIRED' || /source video is required|原视频已经失效/i.test(message)) {
        this.setData({ submitting: false, errorMessage: '原视频已经失效，请重新选择视频后继续创建。' })
        wx.showToast({ title: '请重新选择视频', icon: 'none' })
        wx.redirectTo({ url: `/pages/create/select-video?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      this.setData({ submitting: false, errorMessage: message || '提交失败，请重试。' })
    }
  }
})
