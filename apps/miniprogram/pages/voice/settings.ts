import {
  clearConversation,
  deleteVoice,
  getVoice,
  saveVoiceProfile
} from '../../services/api'
import { ConversationStyle, PermissionType, RelationshipType, UserLifeStage, VoiceGender, VoiceStatus } from '../../models/api'
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

const RELATIONSHIP_OPTIONS: Record<PermissionType, Array<{ key: RelationshipType; title: string }>> = {
  SELF: [{ key: 'SELF', title: '自己' }],
  OTHER: [
    { key: 'MOTHER', title: '妈妈' },
    { key: 'FATHER', title: '爸爸' },
    { key: 'GRANDMOTHER', title: '奶奶' },
    { key: 'GRANDFATHER', title: '爷爷' },
    { key: 'PARTNER', title: '伴侣' },
    { key: 'FRIEND', title: '朋友' },
    { key: 'OTHER', title: '其他' }
  ],
  MINOR: [
    { key: 'CHILD', title: '孩子' },
    { key: 'OTHER', title: '其他' }
  ]
}

function styleLabel(value?: ConversationStyle): string {
  const labels: Record<ConversationStyle, string> = {
    NATURAL: '自然',
    GENTLE: '温柔',
    LIVELY: '活泼',
    CALM: '沉稳'
  }
  return value ? labels[value] || '自然' : '自然'
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

function statusTone(value: VoiceStatus): 'success' | 'progress' | 'warning' | 'danger' | 'neutral' {
  switch (value) {
    case 'READY':
      return 'success'
    case 'UPLOADING':
    case 'QUEUED':
    case 'PROCESSING':
    case 'PREVIEW_READY':
      return 'progress'
    case 'FAILED':
      return 'danger'
    case 'DELETING':
    case 'DELETED':
      return 'warning'
    default:
      return 'neutral'
  }
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
    relationshipType: '' as RelationshipType | '',
    relationshipOther: '',
    relationshipOptions: [] as Array<{ key: RelationshipType; title: string }>,
    showRelationship: false,
    userAddress: '',
    ageYears: '',
    gender: '' as VoiceGender | '',
    userAgeYears: '',
    userLifeStage: '' as UserLifeStage | '',
    background: '',
    relationshipNote: '',
    personalityNote: '',
    personalityConfigured: false,
    speechHabitNote: '',
    genderOptions: [{ key: 'FEMALE', title: '女性' }, { key: 'MALE', title: '男性' }],
    savedRelationshipType: '' as RelationshipType | '',
    savedRelationshipOther: '',
    savedUserAddress: '',
    permissionText: '',
    styleText: '',
    stageText: '未设置',
    callerText: '未设置',
    statusText: '',
    statusTone: 'neutral' as 'success' | 'progress' | 'warning' | 'danger' | 'neutral',
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
        relationshipType: voice.relationshipType || (voice.permissionType === 'SELF' ? 'SELF' : ''),
        relationshipOther: voice.relationshipType === 'OTHER' ? voice.relationshipLabel || '' : '',
        relationshipOptions: voice.permissionType ? RELATIONSHIP_OPTIONS[voice.permissionType] : [],
        userAddress: voice.userAddress || '',
        ageYears: voice.ageYears == null ? '' : String(voice.ageYears),
        gender: voice.gender || '',
        userAgeYears: voice.userAgeYears == null ? '' : String(voice.userAgeYears),
        userLifeStage: voice.userLifeStage || '',
        background: voice.background || '',
        relationshipNote: voice.relationshipNote || '',
        personalityNote: voice.personalityNote || '',
        personalityConfigured: Boolean(String(voice.personalityNote || '').trim()),
        speechHabitNote: voice.speechHabitNote || '',
        savedRelationshipType: voice.relationshipType || (voice.permissionType === 'SELF' ? 'SELF' : ''),
        savedRelationshipOther: voice.relationshipType === 'OTHER' ? voice.relationshipLabel || '' : '',
        savedUserAddress: voice.userAddress || '',
        permissionText: permissionLabel(voice.permissionType),
        styleText: styleLabel(voice.conversationStyle),
        stageText: voice.stageLabel || '未设置',
        callerText: '由声音资料保存',
        statusText: statusLabel(voice.status),
        statusTone: statusTone(voice.status)
      })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '声音设置加载失败，请重试。' })
    }
  },
  onNameInput(event: any) {
    this.setData({ nameDraft: String(event.detail.value || '').slice(0, 20), errorMessage: '', successMessage: '' })
  },
  onAgeInput(event: any) {
    this.setData({ ageYears: String(event.detail.value || '').replace(/\D/g, '').slice(0, 3), errorMessage: '', successMessage: '' })
  },
  selectGender(event: any) {
    const gender = String(event.currentTarget.dataset.key || '') as VoiceGender
    if (gender !== 'FEMALE' && gender !== 'MALE') return
    this.setData({ gender, errorMessage: '', successMessage: '' })
  },
  onUserAgeInput(event: any) {
    const userAgeYears = String(event.detail.value || '').replace(/\D/g, '').slice(0, 3)
    const parsed = Number(userAgeYears)
    const userLifeStage = Number.isInteger(parsed) && parsed >= 0 && parsed <= 120
      ? parsed < 13 ? 'CHILD' : parsed < 18 ? 'TEEN' : parsed < 65 ? 'ADULT' : 'OLDER_ADULT'
      : ''
    this.setData({ userAgeYears, userLifeStage, errorMessage: '', successMessage: '' })
  },
  onBackgroundInput(event: any) {
    this.setData({ background: Array.from(String(event.detail.value || '')).slice(0, 300).join(''), errorMessage: '', successMessage: '' })
  },
  onRelationshipNoteInput(event: any) {
    this.setData({ relationshipNote: Array.from(String(event.detail.value || '')).slice(0, 300).join(''), errorMessage: '', successMessage: '' })
  },
  onSpeechHabitNoteInput(event: any) {
    this.setData({ speechHabitNote: Array.from(String(event.detail.value || '')).slice(0, 300).join(''), errorMessage: '', successMessage: '' })
  },
  toggleRelationship() {
    this.setData({ showRelationship: !this.data.showRelationship })
  },
  openPersonality() {
    if (!this.data.voiceId) return
    wx.navigateTo({ url: `/pages/create/personality-guide?voiceId=${encodeURIComponent(this.data.voiceId)}&mode=edit` })
  },
  selectRelationship(event: any) {
    const relationshipType = String(event.currentTarget.dataset.key || '') as RelationshipType
    if (!this.data.relationshipOptions.some((item) => item.key === relationshipType)) return
    this.setData({
      relationshipType,
      relationshipOther: relationshipType === 'OTHER' ? this.data.relationshipOther : '',
      errorMessage: '',
      successMessage: ''
    })
  },
  onRelationshipOtherInput(event: any) {
    this.setData({
      relationshipOther: Array.from(String(event.detail.value || '')).slice(0, 10).join(''),
      errorMessage: '',
      successMessage: ''
    })
  },
  onUserAddressInput(event: any) {
    this.setData({
      userAddress: Array.from(String(event.detail.value || '')).slice(0, 10).join(''),
      errorMessage: '',
      successMessage: ''
    })
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
    const ageYears = Number(this.data.ageYears)
    if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120) {
      toast('请填写0—120岁的准确年龄')
      return
    }
    if (!this.data.gender) {
      toast('请选择 TA 的性别')
      return
    }
    const relationshipLabel = String(this.data.relationshipOther || '').trim()
    if (!this.data.relationshipType) {
      toast('请选择 TA 是你的谁')
      return
    }
    if (this.data.relationshipType === 'OTHER' && !relationshipLabel) {
      toast('请填写你与 TA 的关系')
      return
    }
    const userAgeYears = this.data.relationshipType === 'SELF' ? ageYears : Number(this.data.userAgeYears)
    if (!Number.isInteger(userAgeYears) || userAgeYears < 0 || userAgeYears > 120) {
      toast('请填写你自己的准确年龄')
      return
    }
    const parentRole = ['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER'].includes(this.data.relationshipType)
    if ((parentRole && (ageYears < 18 || ageYears <= userAgeYears))
      || (this.data.relationshipType === 'CHILD' && (userAgeYears < 18 || ageYears >= userAgeYears))) {
      toast('双方年龄与所选亲属关系不一致')
      return
    }
    if (this.data.relationshipType === 'PARTNER' && (ageYears < 18 || userAgeYears < 18)) {
      toast('伴侣关系要求双方均为成年人')
      return
    }
    this.setData({ saving: true, errorMessage: '', successMessage: '' })
    try {
      const voice = await saveVoiceProfile(this.data.voiceId, {
        name,
        permissionType: this.data.permissionType,
        relationshipType: this.data.relationshipType,
        relationshipLabel: this.data.relationshipType === 'OTHER' ? relationshipLabel : '',
        userAddress: String(this.data.userAddress || '').trim(),
        ageYears,
        gender: this.data.gender,
        userAgeYears,
        userLifeStage: this.data.relationshipType === 'SELF' ? undefined : this.data.userLifeStage || undefined,
        background: String(this.data.background || '').trim(),
        relationshipNote: String(this.data.relationshipNote || '').trim(),
        personalityNote: String(this.data.personalityNote || '').trim(),
        speechHabitNote: String(this.data.speechHabitNote || '').trim()
      })
      this.setData({
        saving: false,
        voiceName: voice.name || name,
        nameDraft: voice.name || name,
        relationshipType: voice.relationshipType || this.data.relationshipType,
        relationshipOther: voice.relationshipType === 'OTHER' ? voice.relationshipLabel || relationshipLabel : '',
        userAddress: voice.userAddress || '',
        ageYears: voice.ageYears == null ? String(ageYears) : String(voice.ageYears),
        gender: voice.gender || this.data.gender,
        userAgeYears: voice.userAgeYears == null ? String(userAgeYears) : String(voice.userAgeYears),
        userLifeStage: voice.userLifeStage || this.data.userLifeStage,
        background: voice.background || '',
        relationshipNote: voice.relationshipNote || '',
        personalityNote: voice.personalityNote || '',
        personalityConfigured: Boolean(String(voice.personalityNote || '').trim()),
        speechHabitNote: voice.speechHabitNote || '',
        savedRelationshipType: voice.relationshipType || this.data.relationshipType,
        savedRelationshipOther: voice.relationshipType === 'OTHER' ? voice.relationshipLabel || relationshipLabel : '',
        savedUserAddress: voice.userAddress || '',
        successMessage: '声音资料已由服务端保存。'
      })
      toast('声音资料已更新', 'success')
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
