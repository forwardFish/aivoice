import { getLegalDoc, LegalDoc } from '../../utils/legal'

Page({
  data: {
    doc: null as LegalDoc | null,
    showFeedbackAction: false
  },
  onLoad(options: Record<string, string>) {
    const type = String(options.type || 'privacy')
    const doc = getLegalDoc(type)
    wx.setNavigationBarTitle({ title: doc.title })
    this.setData({ doc, showFeedbackAction: doc.feedbackAction === true })
  }
})
