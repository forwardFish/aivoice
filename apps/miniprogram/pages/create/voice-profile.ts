import {
  saveVoiceConsent,
  saveVoiceProfile,
  startVoiceProcess
} from '../../services/api'
import { PermissionType, RelationshipType, UserLifeStage, VoiceGender } from '../../models/api'
import { ensureAuthenticated } from '../../utils/navigation'

type RelationshipOption = {
  key: RelationshipType
  title: string
}

const CONSENT_TEXTS: Record<PermissionType, string> = {
  SELF: '我同意使用我的声音样本创建私有 AI 声音。',
  OTHER: '我已告知声音本人，并取得其对声音克隆和 AI 合成使用的明确同意。',
  MINOR: '我是该未成年人的监护人，或已取得其监护人的明确授权。'
}

const RELATIONSHIP_OPTIONS: Record<PermissionType, RelationshipOption[]> = {
  SELF: [
    { key: 'SELF', title: '自己' }
  ],
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

function lifeStageForAge(ageYears: number): UserLifeStage {
  if (ageYears < 13) return 'CHILD'
  if (ageYears < 18) return 'TEEN'
  if (ageYears < 65) return 'ADULT'
  return 'OLDER_ADULT'
}

Page({
  data: {
    voiceId: '',
    name: '',
    permissionType: '' as PermissionType | '',
    relationshipType: '' as RelationshipType | '',
    relationshipOther: '',
    userAddress: '',
    ageYears: '',
    gender: '' as VoiceGender | '',
    userLifeStage: '' as UserLifeStage | '',
    background: '',
    relationshipNote: '',
    relationshipOptions: [] as RelationshipOption[],
    genderOptions: [{ key: 'FEMALE', title: '女性' }, { key: 'MALE', title: '男性' }],
    lifeStageOptions: [
      { key: 'CHILD', title: '儿童' }, { key: 'TEEN', title: '青少年' },
      { key: 'ADULT', title: '成年人' }, { key: 'OLDER_ADULT', title: '老年人' }
    ],
    consentText: '',
    confirmed: false,
    submitting: false,
    errorMessage: '',
    options: [
      { key: 'SELF', title: '我的声音', description: '使用我本人的声音样本' },
      { key: 'OTHER', title: '他人的声音', description: '已取得声音本人明确同意' },
      { key: 'MINOR', title: '未成年人的声音', description: '已取得监护人明确授权' }
    ]
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '')
    if (!voiceId) {
      this.setData({ errorMessage: '缺少声音草稿信息，请重新开始创建。' })
      return
    }
    this.setData({ voiceId })
  },
  onNameInput(event: any) {
    this.setData({ name: String(event.detail.value || '').slice(0, 20), errorMessage: '' })
  },
  selectPermission(event: any) {
    const permissionType = String(event.currentTarget.dataset.key || '') as PermissionType
    if (!CONSENT_TEXTS[permissionType]) return
    this.setData({
      permissionType,
      relationshipType: permissionType === 'SELF' ? 'SELF' : '',
      relationshipOther: '',
      relationshipOptions: RELATIONSHIP_OPTIONS[permissionType],
      consentText: CONSENT_TEXTS[permissionType],
      confirmed: false,
      errorMessage: ''
    })
  },
  onAgeInput(event: any) {
    this.setData({ ageYears: String(event.detail.value || '').replace(/\D/g, '').slice(0, 3), errorMessage: '' })
  },
  selectGender(event: any) {
    const gender = String(event.currentTarget.dataset.key || '') as VoiceGender
    if (gender !== 'FEMALE' && gender !== 'MALE') return
    this.setData({ gender, errorMessage: '' })
  },
  selectUserLifeStage(event: any) {
    const userLifeStage = String(event.currentTarget.dataset.key || '') as UserLifeStage
    if (!['CHILD', 'TEEN', 'ADULT', 'OLDER_ADULT'].includes(userLifeStage)) return
    this.setData({ userLifeStage, errorMessage: '' })
  },
  onBackgroundInput(event: any) {
    this.setData({ background: Array.from(String(event.detail.value || '')).slice(0, 300).join(''), errorMessage: '' })
  },
  onRelationshipNoteInput(event: any) {
    this.setData({ relationshipNote: Array.from(String(event.detail.value || '')).slice(0, 300).join(''), errorMessage: '' })
  },
  selectRelationship(event: any) {
    const relationshipType = String(event.currentTarget.dataset.key || '') as RelationshipType
    this.setRelationshipType(relationshipType)
  },
  onRelationshipRadioChange(event: any) {
    const relationshipType = String(event.detail.value || '') as RelationshipType
    this.setRelationshipType(relationshipType)
  },
  setRelationshipType(relationshipType: RelationshipType) {
    if (!this.data.relationshipOptions.some((item) => item.key === relationshipType)) return
    this.setData({
      relationshipType,
      relationshipOther: relationshipType === 'OTHER' ? this.data.relationshipOther : '',
      errorMessage: ''
    })
  },
  onRelationshipOtherInput(event: any) {
    this.setData({
      relationshipOther: String(event.detail.value || '').slice(0, 10),
      errorMessage: ''
    })
  },
  onUserAddressInput(event: any) {
    this.setData({
      userAddress: Array.from(String(event.detail.value || '')).slice(0, 10).join(''),
      errorMessage: ''
    })
  },
  toggleConfirmed() {
    if (!this.data.permissionType) {
      this.setData({ errorMessage: '请先选择声音使用权限。' })
      return
    }
    this.setData({ confirmed: !this.data.confirmed, errorMessage: '' })
  },
  showRules() {
    wx.showModal({
      title: '声音使用规则',
      content: '仅可使用本人声音，或已经取得声音本人、合法权利人或监护人明确授权的声音。不得用于身份核验、转账、借款、营销外呼、冒充公众人物或其他违法用途。',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  async submit() {
    if (this.data.submitting) return
    const name = String(this.data.name || '').trim()
    if (!name) {
      this.setData({ errorMessage: '请给这个声音起一个名字。' })
      return
    }
    if (!this.data.permissionType) {
      this.setData({ errorMessage: '请选择声音使用权限。' })
      return
    }
    const ageYears = Number(this.data.ageYears)
    if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120) {
      this.setData({ errorMessage: '请填写0—120岁的准确年龄。' })
      return
    }
    if (!this.data.gender) {
      this.setData({ errorMessage: '请选择 TA 的性别。' })
      return
    }
    if (!this.data.relationshipType) {
      this.setData({ errorMessage: '请选择 TA 是你的谁。' })
      return
    }
    const relationshipLabel = String(this.data.relationshipOther || '').trim()
    if (this.data.relationshipType === 'OTHER' && !relationshipLabel) {
      this.setData({ errorMessage: '请填写你与 TA 的关系。' })
      return
    }
    const userLifeStage = this.data.relationshipType === 'SELF'
      ? lifeStageForAge(ageYears)
      : this.data.userLifeStage
    if (!userLifeStage) {
      this.setData({ errorMessage: '请选择你现在所处的人生阶段。' })
      return
    }
    if (!this.data.confirmed) {
      this.setData({ errorMessage: '请先勾选“声音使用确认”。' })
      return
    }
    this.setData({ submitting: true, errorMessage: '' })
    try {
      const savedProfile = await saveVoiceProfile(this.data.voiceId, {
        name,
        permissionType: this.data.permissionType,
        relationshipType: this.data.relationshipType,
        relationshipLabel: this.data.relationshipType === 'OTHER' ? relationshipLabel : '',
        userAddress: String(this.data.userAddress || '').trim(),
        ageYears,
        gender: this.data.gender,
        userLifeStage,
        background: String(this.data.background || '').trim(),
        relationshipNote: String(this.data.relationshipNote || '').trim()
      })
      if (!savedProfile.consentVersion || !savedProfile.consentText) {
        throw new Error('服务端未返回当前授权文本，请稍后重试。')
      }
      this.setData({ consentText: savedProfile.consentText })
      await saveVoiceConsent(this.data.voiceId, {
        consentVersion: savedProfile.consentVersion,
        consentText: savedProfile.consentText,
        confirmed: true
      })
      await startVoiceProcess(this.data.voiceId)
      this.setData({ submitting: false })
      wx.redirectTo({ url: `/pages/create/progress?voiceId=${encodeURIComponent(this.data.voiceId)}` })
    } catch (error: any) {
      const message = String(error.message || '')
      if (error.code === 'SOURCE_VIDEO_REQUIRED' || /source video is required|原视频已经失效/i.test(message)) {
        this.setData({ submitting: false, errorMessage: '原视频已经失效，请重新选择视频后继续创建。' })
        wx.showToast({ title: '请重新选择视频', icon: 'none' })
        wx.redirectTo({ url: `/pages/create/select-video?voiceId=${encodeURIComponent(this.data.voiceId)}` })
        return
      }
      this.setData({ submitting: false, errorMessage: message || '提交失败，请重试。' })
    }
  }
})
