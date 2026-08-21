import {
  getVoice,
  startVoiceProcess
} from '../../services/api'
import { VoiceDetail, VoiceStatus } from '../../models/api'
import { ensureAuthenticated, openPreview } from '../../utils/navigation'
import { getCreationSession } from '../../utils/storage'
import { PROCESS_POLL_INTERVAL_MS } from '../../config'

const PROGRESS_BY_STATUS: Record<VoiceStatus, number> = {
  DRAFT: 5,
  UPLOADING: 16,
  QUEUED: 28,
  PROCESSING: 65,
  PREVIEW_READY: 100,
  READY: 100,
  FAILED: 0,
  DELETING: 84,
  DELETED: 100
}

Page({
  data: {
    voiceId: '',
    state: 'loading',
    voiceName: '这个声音',
    status: 'QUEUED',
    progress: 0,
    statusText: '准备创建声音',
    errorMessage: '',
    stages: [] as any[]
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音任务信息。' })
      return
    }
    this.setData({ voiceId })
  },
  onShow() {
    if (!this.data.voiceId || !ensureAuthenticated()) return
    this.begin()
  },
  onHide() {
    this.stopPolling()
  },
  onUnload() {
    this.stopPolling()
  },
  async begin() {
    this.stopPolling()
    this.setData({ state: 'loading', errorMessage: '' })
    try {
      await startVoiceProcess(this.data.voiceId)
    } catch (error: any) {
      if (error.code !== 'VOICE_NOT_READY' && error.code !== 'GENERATION_IN_PROGRESS') {
        this.setData({ errorMessage: error.message || '启动处理失败，正在尝试恢复任务。' })
      }
    }
    await this.pollOnce()
  },
  async pollOnce() {
    try {
      const voice = await getVoice(this.data.voiceId)
      this.applyVoice(voice)
      if (voice.status === 'PREVIEW_READY') {
        this.stopPolling()
        openPreview(this.data.voiceId)
        return
      }
      if (voice.status === 'READY') {
        this.stopPolling()
        wx.redirectTo({ url: `/pages/voice/workbench?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      if (voice.status === 'FAILED' || voice.status === 'DELETED') {
        this.stopPolling()
        return
      }
      this.pollTimer = setTimeout(() => this.pollOnce(), PROCESS_POLL_INTERVAL_MS)
    } catch (error: any) {
      this.stopPolling()
      this.setData({ state: 'error', errorMessage: error.message || '无法获取创建进度。' })
    }
  },
  applyVoice(voice: VoiceDetail) {
    const progress = voice.progress == null ? PROGRESS_BY_STATUS[voice.status] : voice.progress
    const stageText = this.stageText(voice.status, voice.processingStage)
    const failed = voice.status === 'FAILED'
    const deleting = voice.status === 'DELETING'
    this.setData({
      state: failed ? 'failed' : deleting ? 'deleting' : 'processing',
      voiceName: voice.name || '这个声音',
      status: voice.status,
      progress,
      statusText: stageText,
      errorMessage: failed ? (voice.error && voice.error.message) || '声音创建失败，请重新选择片段后重试。' : this.data.errorMessage,
      stages: this.buildStages(progress, voice.status)
    })
  },
  stageText(status: VoiceStatus, serverStage?: string): string {
    if (serverStage) {
      const map: Record<string, string> = {
        UPLOADING: '正在上传并处理视频',
        EXTRACTING: '正在提取所选声音片段',
        QUALITY_CHECKING: '正在检查声音质量',
        ENROLLING: '正在创建私有 AI 声音',
        PREVIEW_GENERATING: '正在生成免费试听'
      }
      if (map[String(serverStage).toUpperCase()]) return map[String(serverStage).toUpperCase()]
    }
    const map: Record<VoiceStatus, string> = {
      DRAFT: '正在准备声音资料',
      UPLOADING: '正在上传并处理视频',
      QUEUED: '任务已排队，马上开始处理',
      PROCESSING: 'AI 正在学习声音特征',
      PREVIEW_READY: '免费试听已经生成',
      READY: '声音已经可以使用',
      FAILED: '声音创建失败',
      DELETING: '正在删除声音数据',
      DELETED: '声音已删除'
    }
    return map[status]
  },
  buildStages(progress: number, status: VoiceStatus): any[] {
    const thresholds = [12, 32, 52, 76, 96]
    const labels = ['已收到视频', '提取所选片段', '检查声音质量', '创建私有声音', '生成免费试听']
    return labels.map((label, index) => ({
      label,
      done: progress >= thresholds[index] || status === 'PREVIEW_READY' || status === 'READY',
      active: progress < thresholds[index] && (index === 0 || progress >= thresholds[index - 1]) && status !== 'FAILED'
    }))
  },
  stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  },
  retry() {
    const session = getCreationSession()
    if (session && session.voiceId === this.data.voiceId && session.tempFilePath) {
      wx.redirectTo({ url: `/pages/create/select-clip?voiceId=${encodeURIComponent(this.data.voiceId)}` })
      return
    }
    wx.redirectTo({ url: `/pages/create/select-video?voiceId=${encodeURIComponent(this.data.voiceId)}` })
  },
  goVoices() {
    wx.switchTab({ url: '/pages/voices/index' })
  }
})
