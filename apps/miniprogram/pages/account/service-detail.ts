interface DetailSection {
  title: string
  items: string[]
}

interface DetailConfig {
  title: string
  subtitle: string
  icon: string
  sections: DetailSection[]
  primaryAction: string
  actionType: 'create' | 'qr' | 'contactPage' | 'account'
  qrImage?: string
}

const DETAILS: Record<string, DetailConfig> = {
  help: {
    title: '使用帮助',
    subtitle: '从视频到私有声音，按步骤完成即可',
    icon: '/assets/ui/account-help.webp',
    sections: [
      { title: '1. 选择视频', items: ['选择 8–60 秒的视频。', '优先选择环境安静、单人连续说话、背景音乐较少的片段。'] },
      { title: '2. 标记声音片段', items: ['截取 8–20 秒清晰人声。', '拖动开始与结束位置后，确认授权并进入下一步。'] },
      { title: '3. 填写资料与授权', items: ['填写声音名称并选择本人、他人或未成年人授权类型。', '授权文本与版本以服务端返回内容为准。'] },
      { title: '4. 试听与使用', items: ['创建完成后先完整播放试听。', '确认声音后，可进入对话模式或“说一句”模式。'] }
    ],
    primaryAction: '开始创建声音',
    actionType: 'create'
  },
  contact: {
    title: '联系客服',
    subtitle: '支付、生成、删除或账号问题都可以咨询',
    icon: '/assets/ui/account-service.webp',
    sections: [
      { title: '联系前请准备', items: ['问题发生的页面和大致时间。', '相关声音名称、订单时间或错误提示。', '请勿发送微信密码、支付密码或其他敏感凭证。'] },
      { title: '服务说明', items: ['支付与积分到账结果以服务端记录为准。', '声音删除和账号注销需要核对处理状态。', '客服不会索要声音供应商密钥或要求远程控制设备。'] }
    ],
    primaryAction: '',
    actionType: 'qr',
    qrImage: '/assets/ui/customer-service-qr.png'
  },
  service: {
    title: '退款与售后',
    subtitle: '先核对订单状态，再提交售后信息',
    icon: '/assets/ui/points-bag.png',
    sections: [
      { title: '可以处理的问题', items: ['支付成功但积分长时间未到账。', '重复支付、订单状态异常或退款进度查询。', '生成失败时系统不应扣除积分，可提交记录核查。'] },
      { title: '处理步骤', items: ['在“我的订单”中确认订单时间和状态。', '通过微信客服提交订单时间、问题描述和截图。', '支付和退款最终结果以服务端及支付渠道记录为准。'] },
      { title: '重要说明', items: ['积分商品不自动续费。', '不要重复支付同一待确认订单。'] }
    ],
    primaryAction: '联系客服处理售后',
    actionType: 'contactPage'
  },
  feedback: {
    title: '意见反馈',
    subtitle: '帮助我们定位页面、交互和声音体验问题',
    icon: '/assets/ui/chat-mode.png',
    sections: [
      { title: '请说明这些信息', items: ['发生问题的页面和操作步骤。', '发生时间、手机系统和微信版本。', '页面提示、截图或可复现条件。'] },
      { title: '隐私提醒', items: ['请不要发送身份证、银行卡、密码或完整支付凭证。', '声音和生成记录默认仅限当前账号查看。'] }
    ],
    primaryAction: '联系客服提交反馈',
    actionType: 'contactPage'
  }
}

Page({
  data: {
    title: '',
    subtitle: '',
    icon: '',
    sections: [] as DetailSection[],
    primaryAction: '',
    actionType: 'contactPage' as DetailConfig['actionType'],
    qrImage: ''
  },
  onLoad(options: Record<string, string>) {
    const config = DETAILS[String(options.type || '')] || DETAILS.help
    this.setData(config)
  },
  handlePrimaryAction() {
    if (this.data.actionType === 'create') {
      wx.navigateTo({ url: '/pages/create/select-video' })
      return
    }
    if (this.data.actionType === 'account') {
      wx.switchTab({ url: '/pages/account/index' })
      return
    }
    if (this.data.actionType === 'contactPage') {
      wx.redirectTo({ url: '/pages/account/service-detail?type=contact' })
    }
  }
})
