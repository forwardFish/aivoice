Component({
  properties: {
    visible: { type: Boolean, value: false },
    voiceName: { type: String, value: '' },
    option: {
      type: Object,
      value: null,
      observer(value) {
        const option = value || {}
        const amountFen = Number(option.amountFen)
        const points = Number(option.points ?? option.quota)
        this.setData({
          priceText: Number.isFinite(amountFen) ? `¥${(amountFen / 100).toFixed(1)}` : '—',
          pointsText: Number.isFinite(points) ? points : 0
        })
      }
    },
    paying: { type: Boolean, value: false },
    pending: { type: Boolean, value: false },
    message: { type: String, value: '' }
  },
  data: {
    priceText: '—',
    pointsText: 0
  },
  methods: {
    noop() {},
    cancel() {
      if (this.data.paying || this.data.pending) return
      this.triggerEvent('cancel')
    },
    buy() {
      if (this.data.paying || this.data.pending) return
      this.triggerEvent('buy')
    }
  }
})
