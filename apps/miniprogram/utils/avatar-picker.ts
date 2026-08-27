import { CLOUDBASE_ENV_ID } from '../config'
import { cloudEnvConfig, getCloudClient } from '../services/cloud-client'
import { isCloudFileId, resolvePlayableSource } from '../services/cloud-media'
import { uuidV4 } from './uuid'

export function chooseFallbackAvatar(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(result: any) {
        const file = result && result.tempFiles && result.tempFiles[0]
        const filePath = String(file && (file.tempFilePath || file.path) || '')
        if (filePath) resolve(filePath)
        else reject(new Error('未选择头像图片。'))
      },
      fail(error: any) {
        reject(new Error(error && (error.errMsg || error.message) || '头像选择失败。'))
      }
    })
  })
}

export function isPersistentAvatarSource(value: string): boolean {
  const source = String(value || '')
  return /^https:\/\//i.test(source) || isCloudFileId(source)
}

function avatarExtension(filePath: string): string {
  const match = String(filePath || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i)
  const extension = String(match?.[1] || '').toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg'
}

export async function persistProfileAvatar(filePath: string): Promise<string> {
  const source = String(filePath || '').trim()
  if (!source) throw new Error('缺少待上传的头像文件。')
  if (isPersistentAvatarSource(source)) return source

  const binding = await getCloudClient(CLOUDBASE_ENV_ID)
  const cloud = binding.client
  if (!cloud || typeof cloud.uploadFile !== 'function') {
    throw new Error('云存储头像上传能力不可用。')
  }
  const cloudPath = `profile-avatars/${await uuidV4()}.${avatarExtension(source)}`
  return new Promise((resolve, reject) => {
    cloud.uploadFile({
      cloudPath,
      filePath: source,
      ...cloudEnvConfig(binding),
      success(result: any) {
        const fileID = String(result.fileID || result.fileId || '')
        if (!isCloudFileId(fileID)) {
          reject(new Error('云存储未返回有效头像标识。'))
          return
        }
        resolve(fileID)
      },
      fail(error: any) {
        reject(new Error(error?.errMsg || error?.message || '头像上传失败。'))
      }
    })
  })
}

export function resolveProfileAvatarSource(value: string): Promise<string> {
  return resolvePlayableSource(String(value || ''))
}
