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
    durationMs: {
      type: Number,
      value: 0,
      observer(value) {
        this.setData({ durationLabel: this.formatDurationLabel(value) })
      }
    },
    durationOnly: { type: Boolean, value: false },
    label: { type: String, value: '' },
    tag: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    compact: { type: Boolean, value: false },
    bubble: { type: Boolean, value: false }
  },
  data: {
    playing: false,
    progress: 0,
    currentText: '00:00',
    durationLabel: '0″',
    bars: [18, 30, 42, 26, 52, 36, 46, 24, 40, 32, 50, 28, 20, 12]
  },
  lifetimes: {
    attached() {
      const audio = wx.createInnerAudioContext()
      audio.obeyMuteSwitch = false
      audio.autoplay = false
      audio.volume = 1
      if (this.data.src) void this.assignSource(this.data.src)
      audio.onPlay(() => {
        if (this.pauseRequested) {
          audio.stop()
          return
        }
        this.clearPauseFallback()
        this.pauseNotified = false
        this.setData({ playing: true })
        this.triggerEvent('play')
      })
      audio.onPause(() => {
        this.clearPauseFallback()
        this.pauseRequested = false
        this.setData({ playing: false })
        this.notifyPause()
      })
      audio.onStop(() => {
        this.clearPauseFallback()
        this.pauseRequested = false
        this.setData({ playing: false, progress: 0, currentText: '00:00' })
        this.notifyPause()
      })
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
        this.clearPauseFallback()
        this.pauseRequested = false
        this.pauseNotified = true
        this.setData({ playing: false, progress: 100 })
        this.triggerEvent('ended')
      })
      audio.onError((error) => {
        this.clearPauseFallback()
        this.pauseRequested = false
        this.pauseNotified = true
        this.setData({ playing: false, progress: 0, currentText: '00:00' })
        this.triggerEvent('error', error)
      })
      this.audio = audio
    },
    detached() {
      this.clearPauseFallback()
      if (this.audio) {
        this.audio.stop()
        this.audio.destroy()
        this.audio = null
      }
    }
  },
  methods: {
    clearPauseFallback() {
      if (this.pauseFallbackTimer) {
        clearTimeout(this.pauseFallbackTimer)
        this.pauseFallbackTimer = null
      }
    },
    notifyPause() {
      if (this.pauseNotified) return
      this.pauseNotified = true
      this.triggerEvent('pause')
    },
    requestPause() {
      if (!this.audio || this.pauseRequested) return
      this.pauseRequested = true
      this.setData({ playing: false })
      this.notifyPause()
      this.audio.pause()
      this.clearPauseFallback()
      this.pauseFallbackTimer = setTimeout(() => {
        this.pauseFallbackTimer = null
        if (!this.audio || !this.pauseRequested) return
        if (this.audio.paused === false) this.audio.stop()
        this.pauseRequested = false
      }, 250)
    },
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
    formatDurationLabel(value) {
      const seconds = Math.max(0, Math.round(Number(value || 0) / 1000))
      return `${seconds}″`
    },
    async toggle() {
      if (this.data.disabled || !this.data.src || !this.audio) {
        this.triggerEvent('unavailable')
        return
      }
      if (this.data.playing || this.audio.paused === false) this.requestPause()
      else {
        if (this.requestedSource !== this.data.src || !this.audio.src) {
          try {
            await this.assignSource(this.data.src)
          } catch (_error) {
            return
          }
        }
        this.pauseRequested = false
        this.pauseNotified = false
        this.audio.play()
      }
    }
  }
})
