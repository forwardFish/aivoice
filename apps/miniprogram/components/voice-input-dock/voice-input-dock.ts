Component({
  properties: {
    mode: { type: String, value: 'voice' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '输入想对 TA 说的话…' },
    holdText: { type: String, value: '按住说话' },
    disabled: { type: Boolean, value: false },
    sendDisabled: { type: Boolean, value: false },
    fixed: { type: Boolean, value: true }
  },
  methods: {
    toggleMode() {
      this.triggerEvent('modetoggle')
    },
    holdVoice() {
      if (!this.data.disabled) this.triggerEvent('hold')
    },
    tapMic() {
      if (!this.data.disabled) this.triggerEvent('mic')
    },
    inputText(event: any) {
      this.triggerEvent('input', { value: String(event.detail.value || '') })
    },
    sendText() {
      if (!this.data.disabled && !this.data.sendDisabled) this.triggerEvent('send')
    }
  }
})
