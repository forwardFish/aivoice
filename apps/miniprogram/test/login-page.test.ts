import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('login page exposes one WeChat action without profile or phone forms', () => {
  const wxml = readFileSync(new URL('../pages/login/index.wxml', import.meta.url), 'utf8')
  const pageJson = readFileSync(new URL('../pages/login/index.json', import.meta.url), 'utf8')

  assert.match(wxml, /class="wechat-login-button[^>]*bindtap="submitLogin"/)
  assert.match(wxml, /微信一键登录/)
  assert.match(wxml, /登录即代表你已阅读并同意/)
  assert.match(wxml, /data-type="terms"[\s\S]*《用户协议》/)
  assert.match(wxml, /data-type="privacy"[\s\S]*《隐私政策》/)
  assert.doesNotMatch(wxml, /bottom-sheet|chooseAvatar|type="nickname"|手机号登录|profile-sheet|avatar-picker/)
  assert.doesNotMatch(pageJson, /"bottom-sheet"\s*:|"app-chevron"\s*:/)
})

test('one-click login sends only the WeChat code and persists the returned user', async () => {
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
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  await instance.submitLogin()
  await new Promise(resolve => setTimeout(resolve, 500))

  assert.equal(loginCalled, true)
  assert.deepEqual(requestBody, { code: 'real-wx-code' })
  assert.equal(storage.get('nashide_ta_token'), 'server-session-token')
  assert.deepEqual(storage.get('nashide_ta_user'), {
    id: 'user-1',
    nickname: '测试用户',
    avatarUrl: undefined,
    status: undefined
  })
  assert.equal(instance.data.success, true)
  assert.equal(switchedTo, '/pages/home/index')
  assert.equal(storage.has('session_key'), false)
})
