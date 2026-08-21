import { getPoints, listVoices } from '../../services/api'
import { VoiceStatus, VoiceSummary } from '../../models/api'
import { formatDateTime, voiceInitial } from '../../utils/format'
import {
  ensureAuthenticated,
  openPreview,
  openVoiceProgress,
  openWorkbench
} from '../../utils/navigation'

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'READY', label: '已完成' },
  { key: 'PROCESSING', label: '处理中' },
  { key: 'DRAFT', label: '草稿' },
  { key: 'FAILED', label: '失败' }
]

function groupForStatus(status: VoiceStatus): string {
  if (status === 'READY') return 'READY'
  if (status === 'UPLOADING' || status === 'QUEUED' || status === 'PROCESSING' || status === 'DELETING') return 'PROCESSING'
  if (status === 'DRAFT' || status === 'PREVIEW_READY') return 'DRAFT'
  if (status === 'FAILED') return 'FAILED'
  return 'ALL'
}

function statusMeta(voice: VoiceSummary): { label: string; tone: string; action: string } {
  const map: Record<VoiceStatus, { label: string; tone: string; action: string }> = {
    READY: { label: '可使用', tone: 'ready', action: '继续对话' },
    PREVIEW_READY: { label: '试听待确认', tone: 'draft', action: '去试听' },
    DRAFT: { label: '创建未完成', tone: 'draft', action: '继续创建' },
    UPLOADING: { label: '正在上传', tone: 'processing', action: '查看进度' },
    QUEUED: { label: '等待处理', tone: 'processing', action: '查看进度' },
    PROCESSING: { label: '正在创建', tone: 'processing', action: '查看进度' },
    FAILED: { label: '创建失败', tone: 'failed', action: '重新处理' },
    DELETING: { label: '正在删除', tone: 'muted', action: '查看状态' },
    DELETED: { label: '已删除', tone: 'muted', action: '不可用' }
  }
  return map[voice.status]
}

function viewModel(voice: VoiceSummary, availablePoints: number): any {
  const meta = statusMeta(voice)
  const progress = Math.max(0, Math.min(100, Number(voice.progress || 0)))
  return {
    ...voice,
    initial: voiceInitial(voice.name),
    group: groupForStatus(voice.status),
    statusLabel: meta.label,
    statusTone: meta.tone,
    primaryAction: meta.action,
    isReady: voice.status === 'READY',
    isDisabled: voice.status === 'DELETED',
    showProgress: ['UPLOADING', 'QUEUED', 'PROCESSING', 'DELETING'].indexOf(voice.status) >= 0,
    progress,
    pointsText: `剩余 ${availablePoints} 积分`,
    metaText: voice.status === 'READY'
      ? `${voice.conversationStyle ? styleLabel(voice.conversationStyle) + ' · ' : ''}${formatDateTime(voice.lastUsedAt || voice.updatedAt || voice.createdAt)}`
      : voice.error && voice.error.message
        ? voice.error.message
        : formatDateTime(voice.updatedAt || voice.createdAt)
  }
}

function styleLabel(value?: string): string {
  const map: Record<string, string> = {
    NATURAL: '自然',
    GENTLE: '温柔',
    LIVELY: '活泼',
    CALM: '沉稳'
  }
  return map[String(value || '').toUpperCase()] || ''
}

Page({
  data: {
    state: 'loading',
    filters: FILTERS,
    activeFilter: 'ALL',
    voices: [] as any[],
    errorMessage: ''
  },
  onShow() {
    if (!ensureAuthenticated()) return
    this.loadVoices()
  },
  onPullDownRefresh() {
    this.loadVoices(true)
  },
  async loadVoices(fromPullDown = false) {
    this.setData({ state: 'loading', errorMessage: '' })
    try {
      const [response, points] = await Promise.all([listVoices(), getPoints()])
      this.allVoiceItems = response.voices
        .filter(item => item.status !== 'DELETED')
        .map(item => viewModel(item, points.availablePoints))
      this.applyFilter()
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '声音列表加载失败，请重试。' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },
  retryLoad() {
    this.loadVoices()
  },
  selectFilter(event: any) {
    const key = String(event.currentTarget.dataset.key || 'ALL')
    this.setData({ activeFilter: key })
    this.applyFilter()
  },
  applyFilter() {
    const all = Array.isArray(this.allVoiceItems) ? this.allVoiceItems : []
    const active = this.data.activeFilter
    const voices = active === 'ALL' ? all : all.filter(item => item.group === active)
    this.setData({
      voices,
      state: voices.length ? 'success' : 'empty'
    })
  },
  handleEmptyAction() {
    if (this.data.activeFilter === 'ALL') {
      this.createVoice()
      return
    }
    this.setData({ activeFilter: 'ALL' })
    this.applyFilter()
  },
  createVoice() {
    wx.navigateTo({ url: '/pages/create/select-video' })
  },
  openPrimary(event: any) {
    const id = String(event.currentTarget.dataset.id || '')
    const status = String(event.currentTarget.dataset.status || '') as VoiceStatus
    if (!id) return
    if (status === 'READY') {
      openWorkbench(id, 'chat')
      return
    }
    if (status === 'PREVIEW_READY') {
      openPreview(id)
      return
    }
    if (status === 'UPLOADING' || status === 'QUEUED' || status === 'PROCESSING' || status === 'FAILED' || status === 'DELETING') {
      openVoiceProgress(id)
      return
    }
    if (status === 'DRAFT') {
      wx.navigateTo({ url: `/pages/create/select-video?voiceId=${encodeURIComponent(id)}` })
    }
  },
  openExact(event: any) {
    const id = String(event.currentTarget.dataset.id || '')
    if (id) openWorkbench(id, 'exact')
  },
  openSettings(event: any) {
    const id = String(event.currentTarget.dataset.id || '')
    if (id) wx.navigateTo({ url: `/pages/voice/settings?voiceId=${encodeURIComponent(id)}` })
  }
})
