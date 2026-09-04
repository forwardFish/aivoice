Component({
  externalClasses: ['custom-class'],
  data: {
    imageFailed: false
  },
  properties: {
    src: {
      type: String,
      value: '',
      observer(_next: string, _prev: string) {
        if (this.data.imageFailed) this.setData({ imageFailed: false })
      }
    },
    size: { type: Number, value: 96 },
    fallback: { type: String, value: 'wave' },
    elevated: { type: Boolean, value: true }
  },
  methods: {
    handleImageError() {
      if (!this.data.imageFailed) this.setData({ imageFailed: true })
    }
  }
})
