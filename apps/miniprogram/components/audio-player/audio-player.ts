import { isCloudFileId, resolvePlayableSource } from '../../services/cloud-media'

Component({
  properties: {
    src: {
      type: String,
      value: '',
      observer(newValue) {
        if (this.audio) {
          this.audio.stop()
          void this.assignSource(newValue || '')
          this.setData({ playing: false, progress: 0, currentText: '00:00' })
        }
      }
    },
    durationMs: { type: Number, value: 0 },
    label: { type: String, value: '' },
    tag: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    compact: { type: Boolean, value: false }
  },
  data: {
    playing: false,
    progress: 0,
    currentText: '00:00',
    bars: [18, 30, 42, 26, 52, 36, 46, 24, 40, 32, 50, 28, 20, 12]
  },
  lifetimes: {
    attached() {
      const audio = wx.createInnerAudioContext()
      audio.obeyMuteSwitch = false
      audio.autoplay = false
      if (this.data.src) void this.assignSource(this.data.src)
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
      audio.onError((error) => {
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
    assignSource(source) {
      const requested = String(source || '')
      this.requestedSource = requested
      const generation = Number(this.sourceGeneration || 0) + 1
      this.sourceGeneration = generation
      if (!this.audio) return Promise.resolve('')
      if (!isCloudFileId(requested)) {
        this.audio.src = requested
        return Promise.resolve(requested)
      }
      return resolvePlayableSource(requested).then((resolved) => {
        if (this.audio && this.sourceGeneration === generation && this.requestedSource === requested) {
          this.audio.src = resolved
        }
        return resolved
      }).catch((error) => {
        if (this.sourceGeneration === generation) this.triggerEvent('error', error)
        throw error
      })
    },
    formatSeconds(value) {
      const total = Math.max(0, Math.floor(value || 0))
      const minute = Math.floor(total / 60)
      const second = total % 60
      return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
    },
    async toggle() {
      if (this.data.disabled || !this.data.src || !this.audio) {
        this.triggerEvent('unavailable')
        return
      }
      if (this.data.playing) this.audio.pause()
      else {
        if (this.requestedSource !== this.data.src || !this.audio.src) {
          try {
            await this.assignSource(this.data.src)
          } catch (_error) {
            return
          }
        }
        this.audio.play()
        this.triggerEvent('play')
      }
    }
  }
})
