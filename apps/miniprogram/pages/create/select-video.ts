import {
  confirmVoiceMedia,
  createVoice,
  getUploadPolicy,
  uploadToPolicy
} from '../../services/api'
import { formatDurationMs } from '../../utils/format'
import { DEFAULT_MEDIA_TILE_INDEX, normalizeMediaTileIndex } from '../../utils/media-selection'
import { ensureAuthenticated } from '../../utils/navigation'
import { getCreationSession, setCreationSession } from '../../utils/storage'

const MIN_DURATION_MS = 12000
const MAX_DURATION_MS = 60000
const MAX_SIZE_BYTES = 100 * 1024 * 1024

function fileNameFromPath(path: string): string {
  const clean = path.split('?')[0]
  return clean.slice(clean.lastIndexOf('/') + 1) || `video-${Date.now()}.mp4`
}

Page({
  data: {
    state: 'idle',
    selected: null as any,
    selectedIndex: -1,
    uploadProgress: 0,
    errorMessage: '',
    existingVoiceId: '',
    mediaTiles: [
      { id: 'memory-1', scene: 'sunset' },
      { id: 'memory-2', scene: 'window' },
      { id: 'memory-3', scene: 'sea' },
      { id: 'memory-4', scene: 'garden' },
      { id: 'memory-5', scene: 'lamp' },
      { id: 'memory-6', scene: 'mountain' },
      { id: 'memory-7', scene: 'cloud' },
      { id: 'memory-8', scene: 'table' },
      { id: 'memory-9', scene: 'night' }
    ]
  },
  onLoad(options: Record<string, string>) {
    if (!ensureAuthenticated()) return
    const existingVoiceId = String(options.voiceId || '')
    const session = getCreationSession()
    if (existingVoiceId && session && session.voiceId === existingVoiceId && session.tempFilePath) {
      const selectedIndex = normalizeMediaTileIndex(session.selectedTileIndex)
      this.setData({
        existingVoiceId,
        state: 'selected',
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
          sizeText: `${(Number(session.sizeBytes || 0) / 1024 / 1024).toFixed(1)} MB`
        }
      })
      return
    }
    this.setData({ existingVoiceId, selectedIndex: -1 })
  },
  openAlbumTab() {
    this.chooseVideo()
  },
  async chooseVideo(event?: any) {
    if (this.data.state === 'uploading') return
    const requestedIndex = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.index
      : undefined
    const fallbackIndex = this.data.selectedIndex >= 0
      ? this.data.selectedIndex
      : DEFAULT_MEDIA_TILE_INDEX
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
      if (durationMs < MIN_DURATION_MS) throw new Error('视频至少需要 12 秒，请重新选择。')
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
    if (this.data.state === 'uploading') return
    this.setData({ state: 'idle', selected: null, selectedIndex: -1, uploadProgress: 0, errorMessage: '' })
  },
  async uploadAndContinue() {
    if (this.data.state === 'uploading' || !this.data.selected) return
    const selected = this.data.selected
    this.setData({ state: 'uploading', uploadProgress: 0, errorMessage: '' })
    try {
      const voice = this.data.existingVoiceId
        ? { id: this.data.existingVoiceId }
        : await createVoice()
      if (!voice.id) throw new Error('创建声音草稿失败。')
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
        mediaId: uploaded.mediaId || policy.mediaId
      })
      this.setData({ state: 'success', uploadProgress: 100 })
      wx.redirectTo({
        url: `/pages/create/select-clip?voiceId=${encodeURIComponent(voice.id)}`,
        fail: (navigationError: any) => this.setData({
          state: 'error',
          errorMessage: navigationError.errMsg || navigationError.message || '无法进入片段选择页，请重试。'
        })
      })
    } catch (error: any) {
      this.setData({ state: 'error', errorMessage: error.message || '视频上传失败，请重试。' })
    }
  }
})
