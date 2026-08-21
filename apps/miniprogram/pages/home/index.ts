import { getHome, getPoints } from '../../services/api'
import { formatDateTime, voiceInitial } from '../../utils/format'
import { ensureAuthenticated, openWorkbench } from '../../utils/navigation'

Page({
  data: {
    state: 'loading',
    errorMessage: '',
    voices: [] as any[]
  },
  onShow() {
    if (!ensureAuthenticated()) return
    this.loadHome()
  },
  onPullDownRefresh() {
    this.loadHome(true)
  },
  async loadHome(fromPullDown = false) {
    this.setData({ state: 'loading', errorMessage: '' })
    try {
      const [response, points] = await Promise.all([getHome(), getPoints()])
      const voices = response.recentVoices
        .filter(voice => voice.status === 'READY')
        .slice(0, 3)
        .map(voice => ({
          ...voice,
          initial: voiceInitial(voice.name),
          pointsText: points.availablePoints > 0 ? `剩余 ${points.availablePoints} 积分` : '剩余 0 积分',
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
  onShareAppMessage() {
    return {
      title: '我创建了一个私有 AI 声音',
      path: '/pages/home/index'
    }
  }
})
