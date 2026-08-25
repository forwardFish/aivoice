import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('login profile actions use the standard button component and a stable flex row', () => {
  const wxml = readFileSync(new URL('../pages/login/index.wxml', import.meta.url), 'utf8')
  const wxss = readFileSync(new URL('../pages/login/index.wxss', import.meta.url), 'utf8')
  const pageJson = readFileSync(new URL('../pages/login/index.json', import.meta.url), 'utf8')

  assert.equal((wxml.match(/<app-button\b/g) || []).length, 2)
  assert.match(pageJson, /"app-button"\s*:\s*"\/components\/app-button\/app-button"/)
  assert.match(wxss, /\.ui-form-actions\s*\{[^}]*display:\s*flex/s)
  assert.doesNotMatch(wxss, /\.ui-form-actions\s*\{[^}]*display:\s*grid/s)
  assert.match(wxss, /\.ui-form-action\s*\+\s*\.ui-form-action\s*\{[^}]*margin-left:\s*28rpx/s)
})

test('login waits for avatar and nickname before using real wx.login code', async () => {
  const storage = new Map<string, any>()
  let pageDefinition: any
  let loginCalled = false
  let requestBody: any
  let switchedTo = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({ apiBaseUrl: 'https://api.example.test' }),
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    login: (options: any) => {
      loginCalled = true
      options.success({ code: 'real-wx-code' })
    },
    request: (options: any) => {
      requestBody = options.data
      queueMicrotask(() => options.success({
        statusCode: 201,
        data: { token: 'server-session-token', user: { id: 'user-1', nickname: '测试用户' }, trialEligibility: 'ELIGIBLE' }
      }))
      return {}
    },
    switchTab: ({ url }: { url: string }) => { switchedTo = url },
    reLaunch: ({ url }: { url: string }) => { switchedTo = url },
    showModal: () => undefined
  }

  await import('../pages/login/index')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data), agreed: true },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  instance.submitLogin()
  assert.equal(instance.data.showProfileSheet, true)
  assert.equal(loginCalled, false)

  await instance.confirmProfileLogin({ detail: { value: { nickname: '测试用户' } } })
  assert.equal(loginCalled, false)
  assert.equal(instance.data.errorMessage, '请先选择微信头像。')

  instance.setData({ avatarUrl: 'wxfile://selected-avatar.jpg' })
  await instance.confirmProfileLogin({ detail: { value: { nickname: '测试用户' } } })
  await new Promise(resolve => setTimeout(resolve, 500))

  assert.equal(loginCalled, true)
  assert.equal(requestBody.code, 'real-wx-code')
  assert.deepEqual(requestBody.profile, { nickname: '测试用户', avatarUrl: undefined })
  assert.equal(storage.get('nashide_ta_token'), 'server-session-token')
  assert.deepEqual(storage.get('nashide_ta_user'), {
    id: 'user-1',
    nickname: '测试用户',
    avatarUrl: 'wxfile://selected-avatar.jpg',
    status: undefined
  })
  assert.equal(switchedTo, '/pages/home/index')
  assert.equal(storage.has('session_key'), false)
})
