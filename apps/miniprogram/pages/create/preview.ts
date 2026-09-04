import {
  acceptVoicePreview,
  getVoice,
  getVoicePreview,
  markVoicePreviewStarted,
  markVoicePreviewPlayed,
  retryVoicePreview
} from '../../services/api'
import { TrialEligibility } from '../../models/api'
import { ensureAuthenticated } from '../../utils/navigation'
import { clearCreationSession } from '../../utils/storage'
import { voiceInitial } from '../../utils/format'

// Launch switch: keep the page available while allowing a release to bypass it.
const SHOW_PERSONALITY_GUIDE_AFTER_ACCEPT = true

function hasTrialEligibility(value?: TrialEligibility): boolean {
  return value === 'ELIGIBLE' || value === 'AVAILABLE' || value === 'UNUSED'
}

Page({
  data: {
    voiceId: '',
    state: 'loading',
    voiceName: '这个声音',
    voiceInitial: '声',
    avatarUrl: '',
    audioUrl: '',
    previewText: '',
    durationMs: 0,
    playCompleted: false,
    previewPlaying: false,
    playbackPrompted: false,
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
    this.setData({ state: 'loading', errorMessage: '', playCompleted: false, previewPlaying: false, playbackPrompted: false })
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
        avatarUrl: voice.avatarUrl || '',
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
  async onPreviewPlay() {
    this.clearPlaybackPrompt()
    this.setData({ previewPlaying: true })
    try {
      await markVoicePreviewStarted(this.data.voiceId)
    } catch (error: any) {
      this.setData({ errorMessage: error.message || '试听状态同步失败，请重新播放。' })
    }
  },
  onPreviewPause() {
    this.setData({ previewPlaying: false })
  },
  async onPreviewEnded() {
    try {
      await markVoicePreviewPlayed(this.data.voiceId)
      this.clearPlaybackPrompt()
      this.setData({ playCompleted: true, previewPlaying: false, errorMessage: '' })
    } catch (error: any) {
      this.setData({ playCompleted: false, previewPlaying: false, errorMessage: error.message || '试听完成状态同步失败，请重新播放。' })
    }
  },
  onPreviewUnavailable() {
    this.setData({ previewPlaying: false })
    wx.showToast({ title: '试听音频尚未准备好', icon: 'none' })
  },
  onPreviewError() {
    this.clearPlaybackPrompt()
    this.setData({
      previewPlaying: false,
      errorMessage: '试听播放失败，请重新点击播放或稍后重试。'
    })
  },
  clearPlaybackPrompt() {
    if (this.playbackPromptTimer) {
      clearTimeout(this.playbackPromptTimer)
      this.playbackPromptTimer = null
    }
    if (this.data.playbackPrompted) this.setData({ playbackPrompted: false })
  },
  promptCompletePlayback(message: string) {
    this.clearPlaybackPrompt()
    this.setData({ playbackPrompted: true, errorMessage: '' })
    this.playbackPromptTimer = setTimeout(() => {
      this.playbackPromptTimer = null
      if (this.data.playbackPrompted) this.setData({ playbackPrompted: false })
    }, 1800)
    wx.showToast({ title: message, icon: 'none' })
  },
  async acceptPreview() {
    if (this.data.accepting) return
    if (!this.data.playCompleted) {
      if (!this.data.previewPlaying) {
        const player = this.selectComponent('#previewPlayer') as { toggle?: () => void } | null
        player?.toggle?.()
        this.promptCompletePlayback('先完整听完这段试听，再正式使用')
      } else {
        this.promptCompletePlayback('试听播放中，完整听完后即可使用')
      }
      return
    }
    this.setData({ accepting: true, errorMessage: '' })
    try {
      await acceptVoicePreview(this.data.voiceId)
      clearCreationSession()
      this.setData({ accepting: false })
      const nextPath = SHOW_PERSONALITY_GUIDE_AFTER_ACCEPT
        ? `/pages/create/personality-guide?voiceId=${encodeURIComponent(this.data.voiceId)}`
        : `/pages/voice/workbench?voiceId=${encodeURIComponent(this.data.voiceId)}&mode=chat`
      wx.redirectTo({ url: nextPath })
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
  },
  onUnload() {
    this.clearPlaybackPrompt()
  }
})
