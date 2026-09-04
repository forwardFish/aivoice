import {
  confirmVoiceMedia,
  createVoice,
  getVoice,
  getUploadPolicy,
  startSourceSpeakerCheck,
  uploadToPolicy
} from '../../services/api'
import { POLL_INTERVAL_MS } from '../../config'
import { formatDurationMs } from '../../utils/format'
import { DEFAULT_MEDIA_TILE_INDEX, normalizeMediaTileIndex } from '../../utils/media-selection'
import { ensureAuthenticated } from '../../utils/navigation'
import { clearCreationSession, getCreationSession, patchCreationSession, setCreationSession } from '../../utils/storage'

const MIN_DURATION_MS = 8000
const MAX_DURATION_MS = 60000
const MAX_SIZE_BYTES = 100 * 1024 * 1024
const SOURCE_CHECK_MAX_POLLS = 60
const SINGLE_SPEAKER_FAILURE_CODES = new Set([
  'MULTIPLE_SPEAKERS',
  'OVERLAPPING_SPEECH',
  'SPEAKER_UNCERTAIN'
])

function fileNameFromPath(path: string): string {
  const clean = path.split('?')[0]
  return clean.slice(clean.lastIndexOf('/') + 1) || `video-${Date.now()}.mp4`
}

function normalizeSpeakerFailure(value: string): string {
  const code = String(value || '').trim().toUpperCase()
  return SINGLE_SPEAKER_FAILURE_CODES.has(code) ? code : ''
}

function speakerFailureTitle(failureCode: string): string {
  if (failureCode === 'MULTIPLE_SPEAKERS') return '检测到多个声音'
  if (failureCode === 'OVERLAPPING_SPEECH') return '检测到多人同时说话'
  return '无法确认只有一个声音'
}

function speakerFailureMessage(failureCode: string, sourceDeleted = false): string {
  const deletedPrefix = sourceDeleted ? '该视频已从服务器删除。' : ''
  if (failureCode === 'OVERLAPPING_SPEECH') {
    return `这段视频里有多人同时说话，系统无法稳定提取单一音色。${deletedPrefix}请重新选择一段只有 TA 单独说话的视频。`
  }
  if (failureCode === 'SPEAKER_UNCERTAIN') {
    return `这段视频里的说话人不够明确，系统暂时无法确认只有 TA 一个人说话。${deletedPrefix}请重新选择一段更清晰、更单一的视频。`
  }
  return `这段视频里检测到了多个声音。${deletedPrefix}请重新选择一段只有 TA 一个人清楚说话的视频，不要包含旁白、电视声或其他人插话。`
}

Page({
  data: {
    state: 'idle',
    selected: null as any,
    selectedIndex: -1,
    uploadProgress: 0,
    errorMessage: '',
    existingVoiceId: '',
    speakerFailureDialogVisible: false,
    speakerFailureDialogTitle: '',
    speakerFailureDialogMessage: ''
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const existingVoiceId = String(options.voiceId || '')
    const speakerFailure = normalizeSpeakerFailure(String(options.speakerFailure || ''))
    if (speakerFailure) {
      clearCreationSession()
      this.setData({
        existingVoiceId,
        state: 'idle',
        selected: null,
        selectedIndex: -1,
        uploadProgress: 0,
        errorMessage: '',
        speakerFailureDialogVisible: true,
        speakerFailureDialogTitle: speakerFailureTitle(speakerFailure),
        speakerFailureDialogMessage: speakerFailureMessage(speakerFailure, String(options.sourceDeleted || '') === '1')
      })
      return
    }
    const session = getCreationSession()
    const resumedVoiceId = existingVoiceId || (session?.sourceSpeakerCheckPending ? session.voiceId : '')
    if (resumedVoiceId && session && session.voiceId === resumedVoiceId && session.tempFilePath) {
      const selectedIndex = normalizeMediaTileIndex(session.selectedTileIndex)
      this.setData({
        existingVoiceId: resumedVoiceId,
        state: session.sourceSpeakerCheckPending ? 'checking' : 'selected',
        selectedIndex,
        selected: {
          tempFilePath: session.tempFilePath,
          thumbTempFilePath: session.thumbTempFilePath || '',
          tileIndex: selectedIndex,
          fileName: session.fileName,
          mimeType: session.mimeType,
          sizeBytes: session.sizeBytes,
          durationMs: session.durationMs,
          durationText: formatDurationMs(session.durationMs),
          sizeText: `${(session.sizeBytes / 1024 / 1024).toFixed(1)} MB`
        }
      })
      return
    }
    this.setData({
      existingVoiceId,
      selectedIndex: -1,
      speakerFailureDialogVisible: false,
      speakerFailureDialogTitle: '',
      speakerFailureDialogMessage: ''
    })
  },
  onShow() {
    if (this.data.state === 'checking' && this.data.existingVoiceId) {
      void this.resumeSourceSpeakerCheck()
    }
  },
  onHide() {
    this.cancelSourceSpeakerCheck()
  },
  onUnload() {
    this.cancelSourceSpeakerCheck()
  },
  cancelSourceSpeakerCheck() {
    this.sourceSpeakerCheckRun = Number(this.sourceSpeakerCheckRun || 0) + 1
    this.sourceSpeakerCheckActive = false
  },
  async resumeSourceSpeakerCheck() {
    const voiceId = String(this.data.existingVoiceId || '')
    if (!voiceId || this.sourceSpeakerCheckActive) return
    this.sourceSpeakerCheckActive = true
    const run = Number(this.sourceSpeakerCheckRun || 0) + 1
    this.sourceSpeakerCheckRun = run
    try {
      await this.waitForSourceSpeakerCheck(voiceId, run)
    } finally {
      if (this.sourceSpeakerCheckRun === run) this.sourceSpeakerCheckActive = false
    }
  },
  async waitForSourceSpeakerCheck(voiceId: string, run: number, initialVoice?: any) {
    let voice = initialVoice
    for (let attempt = 0; attempt < SOURCE_CHECK_MAX_POLLS; attempt += 1) {
      if (this.sourceSpeakerCheckRun !== run) return
      if (!voice) voice = await getVoice(voiceId)
      const failureCode = normalizeSpeakerFailure(String(voice?.error?.code || ''))
      if (voice?.status === 'FAILED' && failureCode) {
        clearCreationSession()
        this.setData({
          state: 'idle',
          selected: null,
          selectedIndex: -1,
          uploadProgress: 0,
          errorMessage: '',
          existingVoiceId: voiceId,
          speakerFailureDialogVisible: true,
          speakerFailureDialogTitle: speakerFailureTitle(failureCode),
          speakerFailureDialogMessage: speakerFailureMessage(failureCode, true)
        })
        return
      }
      if (voice?.status === 'FAILED') {
        patchCreationSession({ sourceSpeakerCheckPending: false })
        this.setData({
          state: 'error',
          errorMessage: voice?.error?.message || '视频声音检查失败，请重试。'
        })
        return
      }
      if (voice?.status === 'DRAFT') {
        patchCreationSession({ sourceSpeakerCheckPending: false })
        this.setData({ state: 'success', uploadProgress: 100 })
        wx.redirectTo({
          url: `/pages/create/select-clip?voiceId=${encodeURIComponent(voiceId)}`,
          fail: (navigationError: any) => this.setData({
            state: 'error',
            errorMessage: navigationError.errMsg || navigationError.message || '无法进入片段选择页，请重试。'
          })
        })
        return
      }
      voice = undefined
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    if (this.sourceSpeakerCheckRun === run) {
      this.setData({ state: 'error', errorMessage: '视频声音检查时间较长，请稍后重试。' })
    }
  },
  dismissSpeakerFailureDialog() {
    this.setData({ speakerFailureDialogVisible: false })
  },
  noop() {},
  onSpeakerFailureOverlayTap() {
    return
  },
  async chooseVideo(event?: any) {
    if (this.data.state === 'uploading' || this.data.state === 'checking') return
    const requestedIndex = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.index
      : undefined
    const fallbackIndex = this.data.selectedIndex >= 0 ? this.data.selectedIndex : DEFAULT_MEDIA_TILE_INDEX
    const selectedIndex = normalizeMediaTileIndex(requestedIndex, fallbackIndex)
    this.setData({ errorMessage: '' })
    try {
      const result = await new Promise<any>((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['video'],
          sourceType: ['album'],
          maxDuration: 60,
          camera: 'back',
          success: resolve,
          fail: reject
        })
      })
      const file = result.tempFiles && result.tempFiles[0]
      if (!file || !file.tempFilePath) return
      const info = await new Promise<any>((resolve, reject) => {
        wx.getVideoInfo({ src: file.tempFilePath, success: resolve, fail: reject })
      })
      const durationMs = Math.round(Number(info.duration || file.duration || 0) * 1000)
      const sizeBytes = Number(file.size || 0)
      if (durationMs < MIN_DURATION_MS) throw new Error('视频至少需要 8 秒，请重新选择。')
      if (durationMs > MAX_DURATION_MS) throw new Error('视频不能超过 60 秒，请先在相册中裁短。')
      if (sizeBytes > MAX_SIZE_BYTES) throw new Error('视频超过 100MB，请裁短或压缩后重试。')
      const fileName = fileNameFromPath(file.tempFilePath)
      const mimeType = info.type ? `video/${String(info.type).replace(/^video\//, '')}` : 'video/mp4'
      this.setData({
        state: 'selected',
        selectedIndex,
        selected: {
          tempFilePath: file.tempFilePath,
          thumbTempFilePath: String(file.thumbTempFilePath || ''),
          tileIndex: selectedIndex,
          fileName,
          mimeType,
          sizeBytes,
          durationMs,
          durationText: formatDurationMs(durationMs),
          sizeText: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
        }
      })
    } catch (error: any) {
      if (/cancel/i.test(error.errMsg || error.message || '')) return
      this.setData({ state: 'error', errorMessage: error.message || '无法读取视频，请重试。' })
    }
  },
  resetSelection() {
    if (this.data.state === 'uploading' || this.data.state === 'checking') return
    this.setData({ state: 'idle', selected: null, selectedIndex: -1, uploadProgress: 0, errorMessage: '' })
  },
  async uploadAndContinue() {
    if (this.data.state === 'uploading' || this.data.state === 'checking' || !this.data.selected) return
    const selected = this.data.selected
    this.setData({ state: 'uploading', uploadProgress: 0, errorMessage: '' })
    try {
      const voice = this.data.existingVoiceId
        ? { id: this.data.existingVoiceId }
        : await createVoice()
      if (!voice.id) throw new Error('创建声音草稿失败。')
      this.setData({ existingVoiceId: voice.id })
      const policy = await getUploadPolicy(voice.id, {
        fileName: selected.fileName,
        mimeType: selected.mimeType,
        sizeBytes: selected.sizeBytes
      })
      const uploaded = await uploadToPolicy({
        policy,
        filePath: selected.tempFilePath,
        onProgress: progress => this.setData({ uploadProgress: progress })
      })
      await confirmVoiceMedia(voice.id, {
        objectKey: uploaded.objectKey || policy.objectKey,
        mediaId: uploaded.mediaId || policy.mediaId,
        fileName: selected.fileName,
        mimeType: selected.mimeType,
        sizeBytes: selected.sizeBytes,
        durationMs: selected.durationMs
      })
      setCreationSession({
        voiceId: voice.id,
        tempFilePath: selected.tempFilePath,
        thumbTempFilePath: selected.thumbTempFilePath || '',
        selectedTileIndex: this.data.selectedIndex,
        fileName: selected.fileName,
        mimeType: selected.mimeType,
        sizeBytes: selected.sizeBytes,
        durationMs: selected.durationMs,
        objectKey: uploaded.objectKey || policy.objectKey,
        mediaId: uploaded.mediaId || policy.mediaId,
        sourceSpeakerCheckPending: true
      })
      this.setData({ state: 'checking', uploadProgress: 100 })
      const run = Number(this.sourceSpeakerCheckRun || 0) + 1
      this.sourceSpeakerCheckRun = run
      this.sourceSpeakerCheckActive = true
      try {
        const started = await startSourceSpeakerCheck(voice.id)
        await this.waitForSourceSpeakerCheck(voice.id, run, started)
      } finally {
        if (this.sourceSpeakerCheckRun === run) this.sourceSpeakerCheckActive = false
      }
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '视频上传失败，请重试。' })
    }
  }
})
