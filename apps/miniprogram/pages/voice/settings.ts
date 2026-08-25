import {
  clearConversation,
  deleteVoice,
  getVoice,
  saveVoiceProfile
} from '../../services/api'
import { PermissionType, VoiceStatus } from '../../models/api'
import { ensureAuthenticated } from '../../utils/navigation'
import { confirm, toast } from '../../utils/ui'
import {
  clearCreationSession,
  clearPendingOrderId,
  clearWorkbenchDraft,
  getCreationSession
} from '../../utils/storage'

function permissionLabel(value?: PermissionType): string {
  const labels: Record<PermissionType, string> = {
    SELF: '我的声音',
    OTHER: '他人的声音',
    MINOR: '未成年人的声音'
  }
  return value ? labels[value] || '未设置' : '未设置'
}

function statusLabel(value: VoiceStatus): string {
  const labels: Record<VoiceStatus, string> = {
    DRAFT: '草稿',
    UPLOADING: '正在上传',
    QUEUED: '等待处理',
    PROCESSING: '创建中',
    PREVIEW_READY: '等待试听',
    READY: '已可使用',
    FAILED: '创建失败',
    DELETING: '正在删除',
    DELETED: '已删除'
  }
  return labels[value]
}

Page({
  data: {
    voiceId: '',
    focus: '',
    state: 'loading',
    errorMessage: '',
    successMessage: '',
    voiceName: '',
    nameDraft: '',
    permissionType: '' as PermissionType | '',
    permissionText: '',
    statusText: '',
    saving: false,
    clearing: false,
    deleting: false,
    deleted: false
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音信息。' })
      return
    }
    this.setData({ voiceId, focus: String(options.focus || '') })
  },
  onShow() {
    if (!this.data.voiceId || this.data.deleted || !ensureAuthenticated()) return
    this.loadSettings()
  },
  async loadSettings() {
    this.setData({ state: 'loading', errorMessage: '', successMessage: '' })
    try {
      const voice = await getVoice(this.data.voiceId)
      if (voice.status === 'DELETED') {
        this.setData({ state: 'success', deleted: true, voiceName: voice.name || '这个声音' })
        return
      }
      this.setData({
        state: 'success',
        deleted: false,
        voiceName: voice.name || '这个声音',
        nameDraft: voice.name || '',
        permissionType: voice.permissionType || '',
        permissionText: permissionLabel(voice.permissionType),
        statusText: statusLabel(voice.status)
      })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '声音设置加载失败，请重试。' })
    }
  },
  onNameInput(event: any) {
    this.setData({ nameDraft: String(event.detail.value || '').slice(0, 20), errorMessage: '', successMessage: '' })
  },
  async saveName() {
    if (this.data.saving) return
    const name = String(this.data.nameDraft || '').trim()
    if (!name) {
      toast('声音名称不能为空')
      return
    }
    if (!this.data.permissionType) {
      this.setData({ errorMessage: '服务端声音资料缺少权限类型，无法安全修改名称。' })
      return
    }
    if (name === this.data.voiceName) {
      toast('名称没有变化')
      return
    }
    this.setData({ saving: true, errorMessage: '', successMessage: '' })
    try {
      const voice = await saveVoiceProfile(this.data.voiceId, {
        name,
        permissionType: this.data.permissionType
      })
      this.setData({
        saving: false,
        voiceName: voice.name || name,
        nameDraft: voice.name || name,
        successMessage: '名称已由服务端保存。'
      })
      toast('名称已更新', 'success')
    } catch (error: any) {
      this.setData({ saving: false, errorMessage: error.message || '名称保存失败，请重试。' })
    }
  },
  showPermissionRules() {
    wx.showModal({
      title: '声音使用权限',
      content: `当前记录为“${this.data.permissionText}”。权限确认由创建时的动态授权记录决定，前端不提供绕过或本地修改。`,
      showCancel: false,
      confirmText: '知道了'
    })
  },
  goVoices() {
    wx.switchTab({ url: '/pages/voices/index' })
  },
  async clearChat() {
    if (this.data.clearing) return
    const accepted = await confirm({
      title: '清空当前对话？',
      content: '清空后，这些消息不会再参与后续上下文，操作无法恢复。已消耗积分不会返还。',
      confirmText: '清空',
      confirmColor: '#D85B63'
    })
    if (!accepted) return
    this.setData({ clearing: true, errorMessage: '', successMessage: '' })
    try {
      await clearConversation(this.data.voiceId)
      this.setData({ clearing: false, successMessage: '对话记录已由服务端清空。' })
      toast('对话已清空', 'success')
    } catch (error: any) {
      this.setData({ clearing: false, errorMessage: error.message || '清空对话失败，请重试。' })
    }
  },
  async removeVoice() {
    if (this.data.deleting) return
    const accepted = await confirm({
      title: `删除“${this.data.voiceName}”？`,
      content: '删除后将无法恢复声音样本、私有声音模型、对话和生成记录。已购买积分不会因删除声音而返还。',
      confirmText: '删除声音',
      confirmColor: '#D85B63'
    })
    if (!accepted) return
    const second = await confirm({
      title: '再次确认删除',
      content: '服务端会启动供应商音色和私有存储删除流程。订单记录可能按必要期限保留。',
      confirmText: '确认删除',
      confirmColor: '#D85B63'
    })
    if (!second) return
    this.setData({ deleting: true, errorMessage: '', successMessage: '' })
    try {
      await deleteVoice(this.data.voiceId)
      clearWorkbenchDraft(this.data.voiceId)
      clearPendingOrderId(this.data.voiceId)
      const session = getCreationSession()
      if (session && session.voiceId === this.data.voiceId) clearCreationSession()
      this.setData({ deleting: false, deleted: true, successMessage: '声音删除流程已提交。' })
      wx.showToast({ title: '删除流程已提交', icon: 'success', duration: 1200 })
      setTimeout(() => wx.switchTab({ url: '/pages/voices/index' }), 1000)
    } catch (error: any) {
      this.setData({ deleting: false, errorMessage: error.message || '删除声音失败，请重试。' })
    }
  }
})
