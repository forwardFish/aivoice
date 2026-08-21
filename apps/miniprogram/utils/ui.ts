export function toast(title: string, icon: 'none' | 'success' | 'loading' = 'none'): void {
  wx.showToast({ title, icon, duration: 1800 })
}

export function confirm(options: {
  title: string
  content: string
  confirmText?: string
  confirmColor?: string
  cancelText?: string
}): Promise<boolean> {
  return new Promise(resolve => {
    wx.showModal({
      title: options.title,
      content: options.content,
      confirmText: options.confirmText || '确定',
      confirmColor: options.confirmColor || '#6552F5',
      cancelText: options.cancelText || '取消',
      success: (result: any) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    })
  })
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
