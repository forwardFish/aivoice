Component({
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    rightText: { type: String, value: '' },
    transparent: { type: Boolean, value: false },
    fixed: { type: Boolean, value: false }
  },
  data: {
    statusBarHeight: 24,
    navHeight: 44,
    menuRight: 8,
    menuWidth: 88
  },
  lifetimes: {
    attached() {
      try {
        const windowInfo = typeof wx.getWindowInfo === 'function'
          ? wx.getWindowInfo()
          : { statusBarHeight: 24, windowWidth: 375 }
        const menu = wx.getMenuButtonBoundingClientRect()
        const statusBarHeight = Number(windowInfo.statusBarHeight || 24)
        const navHeight = Math.max(44, (menu.top - statusBarHeight) * 2 + menu.height)
        this.setData({
          statusBarHeight,
          navHeight,
          menuRight: Math.max(8, Number(windowInfo.windowWidth || 375) - menu.right),
          menuWidth: menu.width || 88
        })
      } catch (_error) {
        this.setData({ statusBarHeight: 24, navHeight: 44 })
      }
    }
  },
  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/home/index' })
      }
    },
    onRightTap() {
      this.triggerEvent('righttap')
    }
  }
})
