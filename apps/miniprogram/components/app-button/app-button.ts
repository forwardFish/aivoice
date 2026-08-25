Component({
  externalClasses: ['custom-class'],
  properties: {
    label: { type: String, value: '' },
    variant: { type: String, value: 'primary' },
    size: { type: String, value: 'large' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false }
  },
  methods: {
    handleTap() {
      if (!this.data.disabled && !this.data.loading) this.triggerEvent('action')
    }
  }
})
