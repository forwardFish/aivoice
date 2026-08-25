import { CLOUDBASE_ENV_ID } from '../config'
import { cloudEnvConfig, getCloudClient } from './cloud-client'

export function isCloudFileId(value: string): boolean {
  return /^cloud:\/\//i.test(String(value || ''))
}

export function resolvePlayableSource(value: string): Promise<string> {
  const source = String(value || '')
  if (!isCloudFileId(source)) return Promise.resolve(source)
  return new Promise((resolve, reject) => {
    void getCloudClient(CLOUDBASE_ENV_ID).then((binding) => {
      const cloud = binding.client
      if (!cloud || typeof cloud.downloadFile !== 'function') {
        reject(new Error('云存储音频下载能力不可用。'))
        return
      }
      cloud.downloadFile({
        fileID: source,
        ...cloudEnvConfig(binding),
        success(result: any) {
          const tempFilePath = String(result.tempFilePath || '')
          if (!tempFilePath) {
            reject(new Error('云存储未返回可播放的临时文件。'))
            return
          }
          resolve(tempFilePath)
        },
        fail(error: any) {
          reject(new Error(error.errMsg || error.message || '音频下载失败，请重试。'))
        }
      })
    }).catch((error: any) => {
      reject(new Error(error?.message || '云存储音频下载能力不可用。'))
    })
  })
}
