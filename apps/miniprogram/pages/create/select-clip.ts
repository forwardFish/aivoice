import { saveVoiceClip } from '../../services/api'
import { formatDurationSeconds } from '../../utils/format'
import { ensureAuthenticated } from '../../utils/navigation'
import { getCreationSession, patchCreationSession } from '../../utils/storage'

const MIN_CLIP_SECONDS = 8
const MAX_CLIP_SECONDS = 20

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
    durationText: '00:00',
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
    showAdvanced: false,
    draggingMarker: '',
    waveLeft: 0,
    waveWidth: 0,
    dragAnchorX: 0,
    dragRangeStart: 0,
    dragRangeEnd: 0,
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
    const durationSec = Math.max(8, Math.round(session.durationMs / 1000))
    const startSec = Math.max(0, Math.round((session.clipStartMs || 0) / 1000))
    const savedEnd = Math.round((session.clipEndMs || 0) / 1000)
    const endSec = savedEnd > startSec ? Math.min(durationSec, savedEnd) : Math.min(durationSec, startSec + Math.min(20, durationSec))
    this.setData({
      state: 'success',
      voiceId,
      tempFilePath: session.tempFilePath,
      durationSec,
      durationText: formatDurationSeconds(durationSec),
      startSec,
      endSec
    })
    this.updateRange(startSec, endSec)
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
  onMarkerTouchStart(event: any) {
    const marker = String(event.currentTarget.dataset.marker || '')
    if (marker !== 'start' && marker !== 'end' && marker !== 'range') return
    const touch = event.touches && event.touches[0]
    const clientX = Number(touch && (touch.clientX ?? touch.pageX))
    this.setData({
      draggingMarker: marker,
      dragAnchorX: clientX,
      dragRangeStart: this.data.startSec,
      dragRangeEnd: this.data.endSec
    })
    this.createSelectorQuery()
      .select('.wave-shell')
      .boundingClientRect((rect: any) => {
        if (!rect || !Number(rect.width)) return
        this.setData({ waveLeft: Number(rect.left || 0), waveWidth: Number(rect.width) })
        if (marker !== 'range' && Number.isFinite(clientX)) this.updateMarkerFromClientX(marker, clientX)
      })
      .exec()
  },
  onWaveShellTouchStart(event: any) {
    const touch = event.touches && event.touches[0]
    const clientX = Number(touch && (touch.clientX ?? touch.pageX))
    this.createSelectorQuery()
      .select('.wave-shell')
      .boundingClientRect((rect: any) => {
        if (!rect || !Number(rect.width)) return
        const waveLeft = Number(rect.left || 0)
        const waveWidth = Number(rect.width)
        const startX = waveLeft + waveWidth * (Number(this.data.startPercent || 0) / 100)
        const endX = waveLeft + waveWidth * (Number(this.data.endPercent || 0) / 100)
        const marker = this.resolveWaveTouchMarker(clientX, startX, endX)
        if (!marker) return
        this.setData({
          waveLeft,
          waveWidth,
          draggingMarker: marker,
          dragAnchorX: clientX,
          dragRangeStart: this.data.startSec,
          dragRangeEnd: this.data.endSec
        })
        if (marker !== 'range') this.updateMarkerFromClientX(marker, clientX)
      })
      .exec()
  },
  onMarkerTouchMove(event: any) {
    const marker = String(this.data.draggingMarker || '')
    const touch = event.touches && event.touches[0]
    const clientX = Number(touch && (touch.clientX ?? touch.pageX))
    if (marker === 'range' && Number.isFinite(clientX)) {
      const durationSec = Number(this.data.durationSec || 0)
      const waveWidth = Number(this.data.waveWidth || 0)
      if (!durationSec || !waveWidth) return
      const rawDelta = Math.round((clientX - Number(this.data.dragAnchorX || 0)) / waveWidth * durationSec)
      const minDelta = -Number(this.data.dragRangeStart || 0)
      const maxDelta = durationSec - Number(this.data.dragRangeEnd || 0)
      const delta = Math.max(minDelta, Math.min(maxDelta, rawDelta))
      this.updateRange(this.data.dragRangeStart + delta, this.data.dragRangeEnd + delta)
      return
    }
    if ((marker === 'start' || marker === 'end') && Number.isFinite(clientX)) {
      this.updateMarkerFromClientX(marker, clientX)
    }
  },
  onMarkerTouchEnd() {
    this.setData({ draggingMarker: '' })
  },
  resolveWaveTouchMarker(clientX: number, startX: number, endX: number): 'start' | 'end' | 'range' | '' {
    if (!Number.isFinite(clientX)) return ''
    const handleSlop = 32
    if (Math.abs(clientX - startX) <= handleSlop) return 'start'
    if (Math.abs(clientX - endX) <= handleSlop) return 'end'
    if (clientX > startX && clientX < endX) return 'range'
    return clientX <= startX ? 'start' : 'end'
  },
  updateMarkerFromClientX(marker: string, clientX: number) {
    const durationSec = Number(this.data.durationSec || 0)
    const waveWidth = Number(this.data.waveWidth || 0)
    if (!durationSec || !waveWidth) return
    const waveLeft = Number(this.data.waveLeft || 0)
    const percent = Math.max(0, Math.min(1, (clientX - waveLeft) / waveWidth))
    const nextSec = Math.round(percent * durationSec)
    if (marker === 'start') {
      const minStart = Math.max(0, this.data.endSec - MAX_CLIP_SECONDS)
      const maxStart = Math.max(minStart, this.data.endSec - MIN_CLIP_SECONDS)
      this.updateRange(Math.max(minStart, Math.min(maxStart, nextSec)), this.data.endSec)
      return
    }
    const minEnd = Math.min(durationSec, this.data.startSec + MIN_CLIP_SECONDS)
    const maxEnd = Math.min(durationSec, this.data.startSec + MAX_CLIP_SECONDS)
    this.updateRange(this.data.startSec, Math.max(minEnd, Math.min(maxEnd, nextSec)))
  },
  updateRange(startSec: number, endSec: number) {
    const normalizedDuration = Math.max(0, Number(this.data.durationSec || 0))
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
      errorMessage: valid ? '' : selected < MIN_CLIP_SECONDS ? '片段至少需要 8 秒。' : '片段最长为 20 秒。'
    })
  },
  previewSelection() {
    if (!this.data.valid) return
    const video = wx.createVideoContext('clipVideo', this)
    video.seek(this.data.startSec)
    setTimeout(() => video.play(), 120)
    this.setData({ previewing: true })
  },
  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced })
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
