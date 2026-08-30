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
    [1, 'FEMALE', 'age-00-02-female.webp'], [2, 'MALE', 'age-00-02-male.webp'],
    [4, 'FEMALE', 'age-03-05-female.webp'], [5, 'MALE', 'age-03-05-male.webp'],
    [7, 'FEMALE', 'age-06-08-female.webp'], [8, 'MALE', 'age-06-08-male.webp'],
    [10, 'FEMALE', 'age-09-12-female.webp'], [12, 'MALE', 'age-09-12-male.webp'],
    [15, 'FEMALE', 'age-13-17-female.webp'], [17, 'MALE', 'age-13-17-male.webp'],
    [24, 'FEMALE', 'age-18-29-female.webp'], [29, 'MALE', 'age-18-29-male.webp'],
    [40, 'FEMALE', 'age-30-49-female.webp'], [49, 'MALE', 'age-30-49-male.webp'],
    [57, 'FEMALE', 'age-50-64-female.webp'], [64, 'MALE', 'age-50-64-male.webp'],
    [70, 'FEMALE', 'age-65-79-female.webp'], [79, 'MALE', 'age-65-79-male.webp'],
    [85, 'FEMALE', 'age-80-plus-female.webp'], [95, 'MALE', 'age-80-plus-male.webp']
  ] as const
  for (const [ageYears, gender, fileName] of cases) {
    assert.equal(resolveVoiceAvatar({ name: '普通昵称', ageYears, gender }), `/assets/avatars/${fileName}`)
  }
  assert.equal(resolveVoiceAvatar({ name: '小雨·5岁' }), '/assets/avatars/age-06-08-female.webp')
  assert.equal(resolveVoiceAvatar({ name: '普通昵称', ageYears: 12, gender: 'FEMALE', avatarUrl: 'cloud://custom/avatar.png' }), 'cloud://custom/avatar.png')
  assert.equal(resolveVoiceAvatar({ name: '奶奶' }), '/assets/avatars/age-65-79-female.webp')
  assert.equal(resolveVoiceAvatar({ name: '爷爷' }), '/assets/avatars/age-65-79-male.webp')
  assert.equal(resolveVoiceAvatar({ name: '妈妈' }), '/assets/avatars/age-30-49-female.webp')
  assert.equal(resolveVoiceAvatar({ name: '爸爸' }), '/assets/avatars/age-30-49-male.webp')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 25000 }), '00:20')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 5000 }), '')
})
