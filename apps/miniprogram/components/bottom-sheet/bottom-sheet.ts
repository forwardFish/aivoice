Component({
  externalClasses: ['sheet-class'],
  properties: {
    visible: { type: Boolean, value: false },
    closeOnMask: { type: Boolean, value: true }
  },
  methods: {
    requestClose() {
      if (this.data.closeOnMask) this.triggerEvent('close')
    },
    stopPropagation() {}
  }
})
