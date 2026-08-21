Component({
  properties: {
    mode: { type: String, value: 'loading' },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
