function userFacingDescription(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/cloud\.callFunction|callId|errCode|system error|Failed to fetch|request:fail|https?:\/\/docs\./i.test(text)) {
    return '网络连接暂时不稳定，请稍后重新加载。'
  }
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

Component({
  properties: {
    mode: { type: String, value: 'loading' },
    title: { type: String, value: '' },
    description: {
      type: String,
      value: '',
      observer(value: string) {
        this.setData({ displayDescription: userFacingDescription(value) })
      }
    },
    actionText: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },
  data: {
    displayDescription: ''
  },
  lifetimes: {
    attached() {
      this.setData({ displayDescription: userFacingDescription(this.data.description) })
    }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
