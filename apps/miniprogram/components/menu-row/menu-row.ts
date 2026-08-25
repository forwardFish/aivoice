Component({
  externalClasses: ['custom-class'],
  properties: {
    itemKey: { type: String, value: '' },
    icon: { type: String, value: '' },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    chevron: { type: String, value: '›' },
    divider: { type: Boolean, value: false },
    padded: { type: Boolean, value: true },
    large: { type: Boolean, value: false },
    tone: { type: String, value: 'default' }
  },
  methods: {
    handleTap() {
      this.triggerEvent('action', { key: this.data.itemKey })
    }
  }
})
