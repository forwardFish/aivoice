import { getLegalDoc, LegalDoc } from '../../utils/legal'

Page({
  data: {
    doc: null as LegalDoc | null
  },
  onLoad(options: Record<string, string>) {
    const type = String(options.type || 'privacy')
    wx.setNavigationBarTitle({ title: getLegalDoc(type).title })
    this.setData({ doc: getLegalDoc(type) })
  }
})
