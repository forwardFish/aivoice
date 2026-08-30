import type { VoiceDetail } from '../../models/api'
import { getVoice, saveVoiceProfile } from '../../services/api'
import { ensureAuthenticated } from '../../utils/navigation'
import {
  findPersonalityConflict,
  MAX_PERSONALITY_DESCRIPTION_LENGTH,
  MAX_SELECTED_PERSONALITY_TAGS,
  PERSONALITY_TAGS,
  recommendPersonalityTags,
  serializePersonalityNote,
  type PersonalityTagDefinition
} from '../../utils/personality'

type PersonalityTraitOption = Pick<PersonalityTagDefinition, 'id' | 'label'> & { selected: boolean }

function workbenchUrl(voiceId: string): string {
  return `/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&choose=1`
}

function selectedIdsFromExistingNote(note: string, options: PersonalityTraitOption[]): string[] {
  const value = String(note || '')
  return options.filter(option => value.includes(`${option.label}：`)).map(option => option.id)
}

function freeDescriptionFromExistingNote(note: string): string {
  const value = String(note || '').trim()
  if (!value) return ''
  const explicitMatch = value.match(/【用户补充，优先于标签】(.+?)。?$/u)
  if (explicitMatch) return explicitMatch[1].replace(/[。！？!?]+$/u, '').trim()
  if (value.includes('【用户明确选择】')) return ''
  return Array.from(value).slice(0, MAX_PERSONALITY_DESCRIPTION_LENGTH).join('')
}

function profilePayload(voice: VoiceDetail, personalityNote: string) {
  if (!voice.permissionType) throw new Error('声音资料缺少使用权限，请返回上一步重新创建。')
  return {
    name: String(voice.name || '').trim() || '这个声音',
    permissionType: voice.permissionType,
    relationshipType: voice.relationshipType,
    relationshipLabel: voice.relationshipType === 'OTHER' ? String(voice.relationshipLabel || '').trim() : '',
    userAddress: String(voice.userAddress || '').trim(),
    ageYears: voice.ageYears,
    gender: voice.gender,
    userAgeYears: voice.userAgeYears,
    userLifeStage: voice.userLifeStage,
    background: String(voice.background || '').trim(),
    relationshipNote: String(voice.relationshipNote || '').trim(),
    personalityNote,
    speechHabitNote: String(voice.speechHabitNote || '').trim()
  }
}

Page({
  data: {
    voiceId: '',
    editMode: false,
    state: 'loading',
    saving: false,
    hasRecommendations: true,
    traitOptions: [] as PersonalityTraitOption[],
    selectedTagIds: [] as string[],
    description: '',
    descriptionCount: 0,
    maxDescriptionLength: MAX_PERSONALITY_DESCRIPTION_LENGTH,
    errorMessage: ''
  },
  voiceSnapshot: null as VoiceDetail | null,
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const voiceId = String(options.voiceId || '').trim()
    if (!voiceId) {
      this.setData({ state: 'error', errorMessage: '缺少声音信息，请重新开始。' })
      return
    }
    this.setData({ voiceId, editMode: options.mode === 'edit' })
    void this.loadGuide()
  },
  onUnload() {
    this.voiceSnapshot = null
  },
  async loadGuide() {
    this.setData({ state: 'loading', saving: false, errorMessage: '' })
    try {
      const voice = await getVoice(this.data.voiceId)
      if (!voice.relationshipType || !voice.gender || !Number.isInteger(voice.ageYears)) {
        throw new Error('人物年龄、性别或关系资料不完整，请返回重新填写。')
      }
      this.voiceSnapshot = voice
      const recommendations = recommendPersonalityTags({
        ageYears: voice.ageYears as number,
        gender: voice.gender,
        relationshipType: voice.relationshipType
      })
      const existingNote = String(voice.personalityNote || '')
      const displayedDefinitions = [...recommendations]
      if (this.data.editMode) {
        for (const tag of PERSONALITY_TAGS) {
          if (existingNote.includes(`${tag.label}：`) && !displayedDefinitions.some(item => item.id === tag.id)) {
            displayedDefinitions.push(tag)
          }
        }
      }
      const traitOptions = displayedDefinitions.map(({ id, label }) => ({ id, label, selected: false }))
      const selectedTagIds = selectedIdsFromExistingNote(existingNote, traitOptions)
      const description = freeDescriptionFromExistingNote(existingNote)
      this.setData({
        state: 'ready',
        hasRecommendations: displayedDefinitions.length > 0,
        traitOptions: traitOptions.map(option => ({ ...option, selected: selectedTagIds.includes(option.id) })),
        selectedTagIds,
        description,
        descriptionCount: Array.from(description).length,
        errorMessage: ''
      })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '性格页暂时不可用，请稍后重试。' })
    }
  },
  toggleTrait(event: any) {
    const traitId = String(event.currentTarget.dataset.id || '')
    const traitOptions = (this.data.traitOptions as PersonalityTraitOption[]).map(option => ({ ...option }))
    const target = traitOptions.find(option => option.id === traitId)
    if (!target) return
    const nextSelectedTagIds = target.selected
      ? (this.data.selectedTagIds as string[]).filter(id => id !== traitId)
      : [...(this.data.selectedTagIds as string[]), traitId]
    if (nextSelectedTagIds.length > MAX_SELECTED_PERSONALITY_TAGS) {
      wx.showToast({ title: `最多选择 ${MAX_SELECTED_PERSONALITY_TAGS} 项`, icon: 'none' })
      return
    }
    if (findPersonalityConflict(nextSelectedTagIds)) {
      wx.showToast({ title: '这两项反应相反，请保留一项', icon: 'none' })
      return
    }
    target.selected = !target.selected
    this.setData({ traitOptions, selectedTagIds: nextSelectedTagIds, errorMessage: '' })
  },
  onDescriptionInput(event: any) {
    const description = Array.from(String(event.detail.value || ''))
      .slice(0, MAX_PERSONALITY_DESCRIPTION_LENGTH)
      .join('')
    this.setData({
      description,
      descriptionCount: Array.from(description).length,
      errorMessage: ''
    })
  },
  async saveAndContinue() {
    if (this.data.saving) return
    if (!this.voiceSnapshot) {
      this.setData({ errorMessage: '声音资料尚未加载完成，请稍后重试。' })
      return
    }
    this.setData({ saving: true, errorMessage: '' })
    try {
      if (!this.data.editMode && !(this.data.selectedTagIds as string[]).length && !String(this.data.description || '').trim()) {
        this.setData({ saving: false })
        wx.redirectTo({ url: workbenchUrl(this.data.voiceId) })
        return
      }
      const personalityNote = serializePersonalityNote({
        selectedTagIds: this.data.selectedTagIds,
        freeDescription: this.data.description
      })
      await saveVoiceProfile(this.data.voiceId, profilePayload(this.voiceSnapshot, personalityNote))
      this.setData({ saving: false })
      if (this.data.editMode) {
        wx.showToast({ title: '人物性格已更新', icon: 'success' })
        wx.navigateBack({ delta: 1 })
        return
      }
      wx.redirectTo({ url: workbenchUrl(this.data.voiceId) })
    } catch (error: any) {
      this.setData({ saving: false, errorMessage: error.message || '保存失败，请稍后重试。' })
    }
  },
  skipGuide() {
    if (this.data.saving) return
    wx.redirectTo({ url: workbenchUrl(this.data.voiceId) })
  }
})
