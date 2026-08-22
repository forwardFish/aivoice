import { getHome } from '../../services/api'
import { formatDateTime } from '../../utils/format'
import { ensureAuthenticated, openWorkbench } from '../../utils/navigation'
import { resolveVoiceAvatar, resolveVoiceDurationLabel } from '../../utils/avatar'
import { syncTabBarSelection } from '../../utils/tab-bar'

Page({
  data: {
    state: 'loading',
    errorMessage: '',
    voices: [] as any[]
  },
  onShow() {
    syncTabBarSelection(this, 'pages/home/index')
    if (!ensureAuthenticated()) return
    this.loadHome()
  },
  onPullDownRefresh() {
    this.loadHome(true)
  },
  async loadHome(fromPullDown = false) {
    this.setData({ state: 'loading', errorMessage: '' })
    try {
      const response = await getHome()
      const voices = response.recentVoices
        .filter(voice => voice.status === 'READY')
        .slice(0, 3)
        .map(voice => ({
          ...voice,
          displayAvatar: resolveVoiceAvatar(voice),
          durationText: resolveVoiceDurationLabel(voice),
          lastUsedText: formatDateTime(voice.lastUsedAt || voice.updatedAt || voice.createdAt)
        }))
      this.setData({ state: voices.length ? 'success' : 'empty', voices })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '首页加载失败，请重试。' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },
  createVoice() {
    wx.navigateTo({ url: '/pages/create/select-video' })
  },
  openVoice(event: any) {
    const voiceId = String(event.currentTarget.dataset.id || '')
    if (voiceId) openWorkbench(voiceId)
  },
  openVoiceMenu(event: any) {
    const voiceId = String(event.currentTarget.dataset.id || '')
    if (voiceId) wx.navigateTo({ url: `/pages/voice/settings?voiceId=${encodeURIComponent(voiceId)}` })
  },
  openAllVoices() {
    wx.switchTab({ url: '/pages/voices/index' })
  },
  onShareAppMessage() {
    return {
      title: '我创建了一个私有 AI 声音',
      path: '/pages/home/index'
    }
  }
})
