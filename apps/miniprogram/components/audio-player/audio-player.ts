Component({
  properties: {
    src: {
      type: String,
      value: '',
      observer(newValue: string) {
        if (this.audio) {
          this.audio.stop()
          this.audio.src = newValue || ''
          this.setData({ playing: false, progress: 0, currentText: '00:00' })
        }
      }
    },
    durationMs: { type: Number, value: 0 },
    label: { type: String, value: '' },
    tag: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    compact: { type: Boolean, value: false },
    downloadable: { type: Boolean, value: false }
  },
  data: {
    playing: false,
    downloading: false,
    progress: 0,
    currentText: '00:00',
    bars: [18, 30, 42, 26, 52, 36, 46, 24, 40, 32, 50, 28, 20, 12]
  },
  lifetimes: {
    attached() {
      const audio = wx.createInnerAudioContext()
      audio.obeyMuteSwitch = false
      audio.autoplay = false
      if (this.data.src) audio.src = this.data.src
      audio.onPlay(() => this.setData({ playing: true }))
      audio.onPause(() => this.setData({ playing: false }))
      audio.onStop(() => this.setData({ playing: false, progress: 0, currentText: '00:00' }))
      audio.onTimeUpdate(() => {
        const duration = Number(audio.duration || 0)
        const current = Number(audio.currentTime || 0)
        const progress = duration > 0 ? Math.min(100, current / duration * 100) : 0
        this.setData({
          progress,
          currentText: this.formatSeconds(current)
        })
      })
      audio.onEnded(() => {
        this.setData({ playing: false, progress: 100 })
        this.triggerEvent('ended')
      })
      audio.onError((error: any) => {
        this.setData({ playing: false })
        this.triggerEvent('error', error)
      })
      this.audio = audio
    },
    detached() {
      if (this.audio) {
        this.audio.stop()
        this.audio.destroy()
        this.audio = null
      }
    }
  },
  methods: {
    formatSeconds(value: number): string {
      const total = Math.max(0, Math.floor(value || 0))
      const minute = Math.floor(total / 60)
      const second = total % 60
      return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
    },
    toggle() {
      if (this.data.disabled || !this.data.src || !this.audio) {
        this.triggerEvent('unavailable')
        return
      }
      if (this.data.playing) this.audio.pause()
      else {
        if (this.audio.src !== this.data.src) this.audio.src = this.data.src
        this.audio.play()
        this.triggerEvent('play')
      }
    },
    download() {
      if (!this.data.downloadable || !this.data.src || this.data.downloading) return
      this.setData({ downloading: true })
      wx.downloadFile({
        url: this.data.src,
        success: (downloadResult: any) => {
          if (Number(downloadResult.statusCode || 0) !== 200 || !downloadResult.tempFilePath) {
            this.setData({ downloading: false })
            wx.showToast({ title: '下载失败，请重试', icon: 'none' })
            return
          }
          wx.saveFile({
            tempFilePath: downloadResult.tempFilePath,
            success: (saveResult: any) => {
              this.triggerEvent('download', { savedFilePath: saveResult.savedFilePath })
              wx.showToast({ title: '声音已保存', icon: 'success' })
            },
            fail: () => wx.showToast({ title: '保存失败，请重试', icon: 'none' }),
            complete: () => this.setData({ downloading: false })
          })
        },
        fail: () => {
          this.setData({ downloading: false })
          wx.showToast({ title: '下载失败，请重试', icon: 'none' })
        }
      })
    }
  }
})
