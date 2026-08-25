Component({
  externalClasses: ['custom-class'],
  properties: {
    label: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    size: { type: Number, value: 56 }
  },
  methods: {
    handleTap() {
      if (!this.data.disabled) this.triggerEvent('action')
    }
  }
})
