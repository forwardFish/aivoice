import { saveVoiceClip } from '../../services/api'
import { formatDurationSeconds } from '../../utils/format'
import { ensureAuthenticated } from '../../utils/navigation'
import { getCreationSession, patchCreationSession } from '../../utils/storage'

const MIN_CLIP_SECONDS = 10
const MAX_CLIP_SECONDS = 30

function toPercent(valueSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  const value = Math.max(0, Math.min(100, valueSec / durationSec * 100))
  return Math.round(value * 10000) / 10000
}

Page({
  data: {
    state: 'loading',
    voiceId: '',
    tempFilePath: '',
    durationSec: 0,
    currentSec: 0,
    currentText: '00:00',
    startSec: 0,
    endSec: 0,
    startText: '00:00',
    endText: '00:00',
    selectedText: '00:00',
    startPercent: 0,
    endPercent: 0,
    selectionPercent: 0,
    valid: false,
    confirmed: false,
    saving: false,
    previewing: false,
    errorMessage: ''
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    const session = getCreationSession()
    if (!voiceId || !session || session.voiceId !== voiceId || !session.tempFilePath || !session.durationMs) {
      this.setData({
        state: 'error',
        voiceId,
        errorMessage: '本地视频临时文件已失效，请重新从相册选择视频。'
      })
      return
    }
    const durationSec = Math.max(12, Math.round(session.durationMs / 1000))
    const startSec = Math.max(0, Math.round((session.clipStartMs || 0) / 1000))
    const savedEnd = Math.round((session.clipEndMs || 0) / 1000)
    const endSec = savedEnd > startSec ? Math.min(durationSec, savedEnd) : Math.min(durationSec, startSec + Math.min(20, durationSec))
    this.setData({
      state: 'success',
      voiceId,
      tempFilePath: session.tempFilePath,
      durationSec,
      startSec,
      endSec
    })
    this.updateRange(startSec, endSec, durationSec)
  },
  retryFromAlbum() {
    const query = this.data.voiceId ? `?voiceId=${encodeURIComponent(this.data.voiceId)}` : ''
    wx.redirectTo({ url: `/pages/create/select-video${query}` })
  },
  onTimeUpdate(event: any) {
    const currentSec = Number(event.detail.currentTime || 0)
    this.setData({ currentSec, currentText: formatDurationSeconds(currentSec) })
    if (this.data.previewing && currentSec >= this.data.endSec) {
      const video = wx.createVideoContext('clipVideo', this)
      video.pause()
      this.setData({ previewing: false })
    }
  },
  setStartFromCurrent() {
    const startSec = Math.min(Math.floor(this.data.currentSec), Math.max(0, this.data.endSec - MIN_CLIP_SECONDS))
    this.updateRange(startSec, this.data.endSec)
  },
  setEndFromCurrent() {
    const endSec = Math.max(Math.ceil(this.data.currentSec), this.data.startSec + MIN_CLIP_SECONDS)
    this.updateRange(this.data.startSec, Math.min(this.data.durationSec, endSec))
  },
  onStartSlider(event: any) {
    const value = Number(event.detail.value || 0)
    const maxStart = Math.max(0, this.data.endSec - MIN_CLIP_SECONDS)
    this.updateRange(Math.min(value, maxStart), this.data.endSec)
  },
  onEndSlider(event: any) {
    const value = Number(event.detail.value || this.data.durationSec)
    const minEnd = this.data.startSec + MIN_CLIP_SECONDS
    this.updateRange(this.data.startSec, Math.max(value, minEnd))
  },
  updateRange(startSec: number, endSec: number, durationSec = this.data.durationSec) {
    const normalizedDuration = Math.max(0, Number(durationSec || 0))
    const normalizedStart = Math.max(0, Math.min(startSec, normalizedDuration))
    const normalizedEnd = Math.max(normalizedStart, Math.min(endSec, normalizedDuration))
    const selected = normalizedEnd - normalizedStart
    const startPercent = toPercent(normalizedStart, normalizedDuration)
    const endPercent = toPercent(normalizedEnd, normalizedDuration)
    const valid = selected >= MIN_CLIP_SECONDS && selected <= MAX_CLIP_SECONDS
    this.setData({
      startSec: normalizedStart,
      endSec: normalizedEnd,
      startText: formatDurationSeconds(normalizedStart),
      endText: formatDurationSeconds(normalizedEnd),
      selectedText: formatDurationSeconds(selected),
      startPercent,
      endPercent,
      selectionPercent: Math.max(0, Math.round((endPercent - startPercent) * 10000) / 10000),
      valid,
      errorMessage: valid ? '' : selected < MIN_CLIP_SECONDS ? '片段至少需要 10 秒。' : '片段最长为 30 秒。'
    })
  },
  previewSelection() {
    if (!this.data.valid) return
    const video = wx.createVideoContext('clipVideo', this)
    video.seek(this.data.startSec)
    setTimeout(() => video.play(), 120)
    this.setData({ previewing: true })
  },
  toggleConfirmed() {
    this.setData({ confirmed: !this.data.confirmed })
  },
  async saveAndContinue() {
    if (this.data.saving || !this.data.valid || !this.data.confirmed) return
    this.setData({ saving: true, errorMessage: '' })
    const startMs = Math.round(this.data.startSec * 1000)
    const endMs = Math.round(this.data.endSec * 1000)
    try {
      await saveVoiceClip(this.data.voiceId, startMs, endMs)
      patchCreationSession({ clipStartMs: startMs, clipEndMs: endMs })
      this.setData({ saving: false })
      wx.navigateTo({ url: `/pages/create/voice-profile?voiceId=${encodeURIComponent(this.data.voiceId)}` })
    } catch (error: any) {
      this.setData({ saving: false, errorMessage: error.message || '片段保存失败，请重试。' })
    }
  }
})
