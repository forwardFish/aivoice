const routes = [
  'pages/home/index',
  'pages/voices/index',
  'pages/account/index'
];

Component({
  data: {
    selected: -1,
    items: [
      {
        route: routes[0],
        text: '首页',
        icon: '/assets/ui/tab-home.png',
        selectedIcon: '/assets/ui/tab-home-active.png'
      },
      {
        route: routes[1],
        text: '我的声音',
        icon: '/assets/ui/tab-voices.png',
        selectedIcon: '/assets/ui/tab-voices-active.png'
      },
      {
        route: routes[2],
        text: '我的',
        icon: '/assets/ui/tab-account.png',
        selectedIcon: '/assets/ui/tab-account-active.png'
      }
    ]
  },

  lifetimes: {
    attached() {
      setTimeout(() => this.syncSelected(), 0);
    },
    ready() {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      const route = String((current && (current.route || current.__route__)) || '').replace(/^\//, '');
      const selected = routes.indexOf(route);
      if (selected !== this.data.selected) this.setData({ selected });
    },

    switchTab(event) {
      const { route, index } = event.currentTarget.dataset;
      if (!route || Number(index) === this.data.selected) return;
      this.setData({ selected: Number(index) });
      wx.switchTab({
        url: `/${route}`,
        fail: () => this.syncSelected()
      });
    }
  }
});
