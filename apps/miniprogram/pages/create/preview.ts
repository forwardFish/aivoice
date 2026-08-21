import {
  acceptVoicePreview,
  getVoice,
  getVoicePreview,
  markVoicePreviewPlayed,
  retryVoicePreview
} from '../../services/api'
import { TrialEligibility } from '../../models/api'
import { ensureAuthenticated } from '../../utils/navigation'
import { clearCreationSession } from '../../utils/storage'
import { voiceInitial } from '../../utils/format'

function hasTrialEligibility(value?: TrialEligibility): boolean {
  return value === 'ELIGIBLE' || value === 'AVAILABLE' || value === 'UNUSED'
}

Page({
  data: {
    voiceId: '',
    state: 'loading',
    voiceName: '这个声音',
    voiceInitial: '声',
    audioUrl: '',
    previewText: '',
    durationMs: 0,
    playCompleted: false,
    accepting: false,
    retrying: false,
    trialEligible: false,
    freeRetryRemaining: 0,
    errorMessage: ''
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少试听信息。' })
      return
    }
    this.setData({ voiceId })
    this.loadPreview()
  },
  async loadPreview() {
    this.setData({ state: 'loading', errorMessage: '', playCompleted: false })
    try {
      const voice = await getVoice(this.data.voiceId)
      if (voice.status === 'READY') {
        wx.redirectTo({ url: `/pages/voice/workbench?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      if (voice.status === 'FAILED') {
        throw new Error((voice.error && voice.error.message) || '声音创建失败，请重新选择片段。')
      }
      if (voice.status !== 'PREVIEW_READY') {
        wx.redirectTo({ url: `/pages/create/progress?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      const preview = await getVoicePreview(this.data.voiceId, voice)
      if (!preview.audioUrl) throw new Error('试听音频尚未准备好，请稍后重试。')
      this.setData({
        state: 'success',
        voiceName: voice.name || '这个声音',
        voiceInitial: voiceInitial(voice.name),
        audioUrl: preview.audioUrl,
        previewText: preview.text,
        durationMs: preview.durationMs || 0,
        trialEligible: hasTrialEligibility(preview.trialEligibility || voice.quota.trialEligibility),
        freeRetryRemaining: preview.freeRetryRemaining == null ? 0 : preview.freeRetryRemaining
      })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '试听加载失败，请重试。' })
    }
  },
  async onPreviewEnded() {
    try {
      await markVoicePreviewPlayed(this.data.voiceId)
      this.setData({ playCompleted: true, errorMessage: '' })
    } catch (error: any) {
      this.setData({ playCompleted: false, errorMessage: error.message || '试听完成状态同步失败，请重新播放。' })
    }
  },
  onPreviewUnavailable() {
    wx.showToast({ title: '试听音频尚未准备好', icon: 'none' })
  },
  async acceptPreview() {
    if (!this.data.playCompleted || this.data.accepting) return
    this.setData({ accepting: true, errorMessage: '' })
    try {
      await acceptVoicePreview(this.data.voiceId)
      clearCreationSession()
      this.setData({ accepting: false })
      wx.redirectTo({ url: `/pages/voice/workbench?voiceId=${encodeURIComponent(this.data.voiceId)}&choose=1` })
    } catch (error: any) {
      this.setData({ accepting: false, errorMessage: error.message || '暂时无法使用这个声音，请重试。' })
    }
  },
  async retryPreview() {
    if (this.data.retrying) return
    this.setData({ retrying: true, errorMessage: '' })
    try {
      await retryVoicePreview(this.data.voiceId)
      this.setData({ retrying: false })
      wx.redirectTo({ url: `/pages/create/select-video?voiceId=${encodeURIComponent(this.data.voiceId)}` })
    } catch (error: any) {
      this.setData({ retrying: false, errorMessage: error.message || '无法重新创建，请稍后重试。' })
    }
  }
})
