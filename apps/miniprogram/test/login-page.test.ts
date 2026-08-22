import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const miniprogramRoot = path.resolve(__dirname, '..')

test('login page matches the latest visual hierarchy without restoring profile onboarding', () => {
  const view = fs.readFileSync(path.join(miniprogramRoot, 'pages/login/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(miniprogramRoot, 'pages/login/index.wxss'), 'utf8')

  assert.match(view, /\/assets\/ui\/hero-memory\.png/)
  assert.match(view, /class="wechat-login-button/)
  assert.match(view, /\/assets\/ui\/wechat-mark\.png/)
  assert.doesNotMatch(view, /wechat-bubble|bubble-large|bubble-small/)
  assert.match(view, /欢迎来到那时的TA/)
  assert.match(view, /《用户协议》/)
  assert.match(view, /《隐私政策》/)
  assert.doesNotMatch(view, /chooseAvatar|nickname-input|avatar-picker/)
  assert.match(style, /\.wechat-login-button\s*\{[^}]*linear-gradient/s)
  assert.match(style, /\.login-clouds\s*\{/)
})

test('login page uses wx.login code with HTTPS production config and stores only API session data', async () => {
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
    data: { ...structuredClone(pageDefinition.data), agreed: true, nickname: '测试用户' },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  await instance.submitLogin()
  await new Promise(resolve => setTimeout(resolve, 500))

  assert.equal(loginCalled, true)
  assert.equal(requestBody.code, 'real-wx-code')
  assert.equal(storage.get('nashide_ta_token'), 'server-session-token')
  assert.deepEqual(storage.get('nashide_ta_user'), { id: 'user-1', nickname: '测试用户', avatarUrl: undefined, status: undefined })
  assert.equal(switchedTo, '/pages/home/index')
  assert.equal(storage.has('session_key'), false)
})
