export function chooseFallbackAvatar(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(result: any) {
        const file = result && result.tempFiles && result.tempFiles[0]
        const path = String(file && (file.tempFilePath || file.path) || '')
        if (path) resolve(path)
        else reject(new Error('未选择头像图片。'))
      },
      fail(error: any) {
        reject(new Error(error && (error.errMsg || error.message) || '头像选择失败。'))
      }
    })
  })
}
