import { getHome } from '../../services/api'
import { formatDateTime, formatDurationMs, voiceInitial } from '../../utils/format'
import { ensureAuthenticated, openWorkbench } from '../../utils/navigation'

function realClipDurationMs(voice: any): number {
  const startMs = Number(voice && voice.clipStartMs)
  const endMs = Number(voice && voice.clipEndMs)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  return endMs - startMs
}

function voiceMetadata(voice: any): { metaText: string; durationText: string } {
  const timestamp = voice.lastUsedAt || voice.updatedAt || voice.createdAt || ''
  const metaText = timestamp
    ? `${voice.lastUsedAt ? '最近使用' : '创建于'} ${formatDateTime(timestamp)}`
    : '暂无使用记录'
  const durationMs = realClipDurationMs(voice)
  return {
    metaText,
    durationText: durationMs > 0 ? formatDurationMs(durationMs) : ''
  }
}

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
      const response = await getHome()
      const voices = response.recentVoices
        .filter(voice => voice.status === 'READY')
        .slice(0, 3)
        .map(voice => ({
          ...voice,
          initial: voiceInitial(voice.name),
          ...voiceMetadata(voice)
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
