import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { resolveVoiceAvatar, resolveVoiceDurationLabel } from '../utils/avatar'

test('home page consumes provided visual assets and custom tabbar shell', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const appConfig = fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')
  const homeMarkup = fs.readFileSync(path.join(appRoot, 'pages/home/index.wxml'), 'utf8')
  const homeSource = fs.readFileSync(path.join(appRoot, 'pages/home/index.ts'), 'utf8')
  const tabbarSource = fs.readFileSync(path.join(appRoot, 'custom-tab-bar/index.wxml'), 'utf8')
  const tabbarLogic = fs.readFileSync(path.join(appRoot, 'custom-tab-bar/index.ts'), 'utf8')
  const tabbarStyles = fs.readFileSync(path.join(appRoot, 'custom-tab-bar/index.wxss'), 'utf8')
  const appJson = JSON.parse(appConfig)

  assert.equal(appJson.pages[0], 'pages/home/index')
  assert.match(appConfig, /"custom"\s*:\s*true/)
  assert.match(homeMarkup, /home-hero-card\.png/)
  assert.match(homeMarkup, /arrow-circle\.png/)
  assert.equal((homeMarkup.match(/home-arrow-hidden/g) || []).length, 3)
  assert.match(homeMarkup, /waveform\.png/)
  assert.match(homeMarkup, /play-circle\.png/)
  assert.match(homeMarkup, /more-plain\.png/)
  assert.match(homeMarkup, /shopping-bag\.png/)
  assert.match(tabbarSource, /tab-label/)
  assert.match(tabbarSource, /tab-icon-voices/)
  assert.match(tabbarLogic, /tab-voices-waveform-v2\.png/)
  assert.match(tabbarStyles, /left:\s*0;/)
  assert.match(tabbarStyles, /right:\s*0;/)
  assert.match(tabbarStyles, /bottom:\s*0;/)
  assert.match(tabbarStyles, /background:\s*#ffffff;/)
  assert.doesNotMatch(tabbarStyles, /padding:\s*0\s+34rpx;/)
  assert.doesNotMatch(tabbarStyles, /border-radius:\s*36rpx;/)
  assert.doesNotMatch(tabbarStyles, /backdrop-filter:/)
  assert.doesNotMatch(tabbarStyles, /\.tab-icon-wrap\.active\s*\{/)
  assert.match(tabbarStyles, /\.tab-item\s*\{[\s\S]*gap:\s*0;/)
  assert.match(tabbarStyles, /\.tab-icon-wrap\s*\{[\s\S]*width:\s*80rpx;[\s\S]*height:\s*62rpx;/)
  assert.match(tabbarStyles, /\.tab-icon-wrap-voices\s*\{[\s\S]*width:\s*84rpx;[\s\S]*height:\s*62rpx;/)
  assert.match(tabbarStyles, /\.tab-icon\s*\{[\s\S]*width:\s*56rpx;[\s\S]*height:\s*56rpx;/)
  assert.match(tabbarStyles, /\.tab-icon\.selected\s*\{[\s\S]*width:\s*62rpx;[\s\S]*height:\s*62rpx;/)
  assert.match(tabbarStyles, /\.tab-icon-voices\s*\{[\s\S]*width:\s*65rpx;[\s\S]*height:\s*48rpx;/)
  assert.match(tabbarStyles, /\.tab-icon\.selected\.tab-icon-voices\s*\{[\s\S]*width:\s*72rpx;[\s\S]*height:\s*54rpx;/)
  assert.match(homeSource, /resolveVoiceAvatar/)
  assert.match(homeSource, /resolveVoiceDurationLabel/)
  assert.doesNotMatch(homeMarkup, /继续对话/)
  assert.doesNotMatch(homeMarkup, /empty-action|创建第一个声音/)
  assert.equal((homeMarkup.match(/bindtap="createVoice"/g) || []).length, 1)
})

test('guest opens the public home without API access and login starts only after a protected action', async () => {
  const storage = new Map<string, any>()
  let pageDefinition: any
  let relaunchedUrl = ''
  let navigatedUrl = ''
  let requestCount = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index', options: {} }]
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: ({ url }: { url: string }) => { relaunchedUrl = url },
    navigateTo: ({ url }: { url: string }) => { navigatedUrl = url },
    stopPullDownRefresh: () => undefined,
    request: () => { requestCount += 1 }
  }

  await import('../pages/home/index?case=guest-home')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  instance.onShow()
  assert.equal(instance.data.state, 'guest')
  assert.equal(instance.data.authenticated, false)
  assert.equal(requestCount, 0)

  instance.createVoice()
  assert.equal(relaunchedUrl, '/pages/login/index')
  assert.equal(navigatedUrl, '')
  assert.equal(storage.get('nashide_ta_post_login_route'), '/pages/create/select-video')
})

test('guest protected tab click records the target and opens login before switching tabs', async () => {
  const storage = new Map<string, any>()
  let componentDefinition: any
  let relaunchedUrl = ''
  let switchedUrl = ''
  ;(globalThis as any).Component = (definition: any) => { componentDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/home/index', options: {} }]
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    reLaunch: ({ url }: { url: string }) => { relaunchedUrl = url },
    switchTab: ({ url }: { url: string }) => { switchedUrl = url }
  }

  await import('../custom-tab-bar/index?case=guest-protected-tab')
  assert.ok(componentDefinition)
  const instance: any = {
    ...componentDefinition.methods,
    data: { ...structuredClone(componentDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  instance.switchTab({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(relaunchedUrl, '/pages/login/index')
  assert.equal(switchedUrl, '')
  assert.equal(storage.get('nashide_ta_post_login_route'), '/pages/voices/index')
})

test('default voice avatars and real duration labels follow provided assets', () => {
  const cases = [
    [1, 'FEMALE', 'age-00-02-female.png'], [2, 'MALE', 'age-00-02-male.png'],
    [4, 'FEMALE', 'age-03-05-female.png'], [5, 'MALE', 'age-03-05-male.png'],
    [7, 'FEMALE', 'age-06-08-female.png'], [8, 'MALE', 'age-06-08-male.png'],
    [10, 'FEMALE', 'age-09-12-female.png'], [12, 'MALE', 'age-09-12-male.png'],
    [15, 'FEMALE', 'age-13-17-female.png'], [17, 'MALE', 'age-13-17-male.png'],
    [24, 'FEMALE', 'age-18-29-female.png'], [29, 'MALE', 'age-18-29-male.png'],
    [40, 'FEMALE', 'age-30-49-female.png'], [49, 'MALE', 'age-30-49-male.png'],
    [57, 'FEMALE', 'age-50-64-female.png'], [64, 'MALE', 'age-50-64-male.png'],
    [70, 'FEMALE', 'age-65-79-female.png'], [79, 'MALE', 'age-65-79-male.png'],
    [85, 'FEMALE', 'age-80-plus-female.png'], [95, 'MALE', 'age-80-plus-male.png']
  ] as const
  for (const [ageYears, gender, fileName] of cases) {
    assert.equal(resolveVoiceAvatar({ name: '普通昵称', ageYears, gender }), `/assets/avatars/${fileName}`)
  }
  assert.equal(resolveVoiceAvatar({ name: '小雨·5岁' }), '/assets/avatars/age-06-08-female.png')
  assert.equal(resolveVoiceAvatar({ name: '普通昵称', ageYears: 12, gender: 'FEMALE', avatarUrl: 'cloud://custom/avatar.png' }), 'cloud://custom/avatar.png')
  assert.equal(resolveVoiceAvatar({ name: '奶奶' }), '/assets/avatars/age-65-79-female.png')
  assert.equal(resolveVoiceAvatar({ name: '爷爷' }), '/assets/avatars/age-65-79-male.png')
  assert.equal(resolveVoiceAvatar({ name: '妈妈' }), '/assets/avatars/age-30-49-female.png')
  assert.equal(resolveVoiceAvatar({ name: '爸爸' }), '/assets/avatars/age-30-49-male.png')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 25000 }), '00:20')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 5000 }), '')
})

test('app avatar resets image failure when src changes and falls back to visible content on load error', async () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const avatarMarkup = fs.readFileSync(path.join(appRoot, 'components/app-avatar/app-avatar.wxml'), 'utf8')
  const avatarStyles = fs.readFileSync(path.join(appRoot, 'components/app-avatar/app-avatar.wxss'), 'utf8')
  let componentDefinition: any
  ;(globalThis as any).Component = (definition: any) => { componentDefinition = definition }

  await import('../components/app-avatar/app-avatar?case=png-fallback')
  assert.ok(componentDefinition)
  assert.match(avatarMarkup, /src && !imageFailed/)
  assert.match(avatarMarkup, /binderror="handleImageError"/)
  assert.match(avatarStyles, /\.fallback-user\s*\{[^}]*opacity:\s*0\.9/s)
  assert.match(avatarStyles, /\.fallback-wave\s*\{[^}]*padding:\s*0 2rpx/s)

  const instance: any = {
    data: {
      ...structuredClone(componentDefinition.data),
      src: '/assets/avatars/age-30-49-female.png',
      fallback: 'wave'
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  componentDefinition.methods.handleImageError.call(instance)
  assert.equal(instance.data.imageFailed, true)

  componentDefinition.properties.src.observer.call(instance, '/assets/avatars/age-50-64-female.png', '/assets/avatars/age-30-49-female.png')
  assert.equal(instance.data.imageFailed, false)

  componentDefinition.methods.handleImageError.call(instance)
  assert.equal(instance.data.imageFailed, true)
})

test('home page title hierarchy keeps the brand large but no longer oversized', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const homeStyle = fs.readFileSync(path.join(appRoot, 'pages/home/index.wxss'), 'utf8')
  assert.match(homeStyle, /\.brand-title\s*\{[^}]*font-size:\s*56rpx[^}]*line-height:\s*1\.12[^}]*font-weight:\s*680/s)
  assert.match(homeStyle, /\.section-title\s*\{[^}]*font-family:\s*"PingFang SC", "SF Pro Text", "Helvetica Neue", sans-serif[^}]*font-size:\s*38rpx[^}]*line-height:\s*1\.2[^}]*font-weight:\s*650/s)
  assert.doesNotMatch(homeStyle, /\.brand-title\s*\{[^}]*font-size:\s*72rpx/s)
  assert.doesNotMatch(homeStyle, /\.section-title\s*\{[^}]*font-size:\s*62rpx/s)
})
