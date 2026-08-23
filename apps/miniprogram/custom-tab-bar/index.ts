const TAB_LIST = [
  {
    pagePath: '/pages/home/index',
    text: '首页',
    iconPath: '/assets/ui/tab-home-filled.png',
    selectedIconPath: '/assets/ui/tab-home-filled.png'
  },
  {
    pagePath: '/pages/voices/index',
    text: '我的声音',
    iconPath: '/assets/ui/tab-voices-outline.png',
    selectedIconPath: '/assets/ui/tab-voices-outline.png'
  },
  {
    pagePath: '/pages/account/index',
    text: '我的',
    iconPath: '/assets/ui/tab-account-outline.png',
    selectedIconPath: '/assets/ui/tab-account-outline.png'
  }
]

Component({
  data: {
    selected: 0,
    list: TAB_LIST
  },
  lifetimes: {
    attached() {
      this.syncSelected()
    }
  },
  pageLifetimes: {
    show() {
      this.syncSelected()
    }
  },
  methods: {
    syncSelected() {
      const pages = getCurrentPages()
      const current = pages.length ? `/${pages[pages.length - 1].route}` : ''
      const selected = TAB_LIST.findIndex(item => item.pagePath === current)
      this.setData({ selected: selected >= 0 ? selected : 0 })
    },
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index || 0)
      const item = TAB_LIST[index]
      if (!item) return
      this.setData({ selected: index })
      wx.switchTab({ url: item.pagePath })
    }
  }
})
