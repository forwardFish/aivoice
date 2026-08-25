const TAB_ROUTES = [
  'pages/home/index',
  'pages/voices/index',
  'pages/account/index'
]

export function syncTabBarSelection(page: any, route: string) {
  const currentRoute = String(route || '').replace(/^\//, '')
  const selected = TAB_ROUTES.indexOf(currentRoute)
  if (selected < 0 || !page || typeof page.getTabBar !== 'function') return

  const applySelection = () => {
    const tabBar = page.getTabBar()
    if (!tabBar || typeof tabBar.setData !== 'function') return false
    tabBar.setData({ selected })
    return true
  }

  if (!applySelection()) setTimeout(applySelection, 80)
}
