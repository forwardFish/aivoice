import { getToken, setPostLoginRoute } from './storage'

export function currentRouteWithQuery(): string {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (!page) return '/pages/home/index'
  const route = `/${page.route}`
  const options = page.options || {}
  const query = Object.keys(options)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
    .join('&')
  return query ? `${route}?${query}` : route
}

export function ensureAuthenticated(): boolean {
  if (getToken()) return true
  const route = currentRouteWithQuery()
  if (route !== '/pages/login/index') setPostLoginRoute(route)
  wx.reLaunch({ url: '/pages/login/index' })
  return false
}

export function goToLogin(returnRoute?: string): void {
  if (returnRoute) setPostLoginRoute(returnRoute)
  wx.reLaunch({ url: '/pages/login/index' })
}

export function openWorkbench(voiceId: string, mode?: 'chat' | 'exact'): void {
  const query = [`voiceId=${encodeURIComponent(voiceId)}`]
  if (mode) query.push(`mode=${mode}`)
  wx.navigateTo({ url: `/pages/voice/workbench?${query.join('&')}` })
}

export function openVoiceProgress(voiceId: string): void {
  wx.navigateTo({ url: `/pages/create/progress?voiceId=${encodeURIComponent(voiceId)}` })
}

export function openPreview(voiceId: string): void {
  wx.redirectTo({ url: `/pages/create/preview?voiceId=${encodeURIComponent(voiceId)}` })
}

export function openPurchasePage(input: {
  voiceId: string
  mode?: 'chat' | 'exact'
  source?: 'quota-modal' | 'settings'
}): void {
  const query = [`voiceId=${encodeURIComponent(input.voiceId)}`]
  if (input.mode) query.push(`mode=${encodeURIComponent(input.mode)}`)
  if (input.source) query.push(`source=${encodeURIComponent(input.source)}`)
  wx.navigateTo({ url: `/pages/purchase/index?${query.join('&')}` })
}
