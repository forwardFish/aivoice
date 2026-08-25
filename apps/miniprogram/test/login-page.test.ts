import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const miniprogramRoot = path.resolve(__dirname, '..')

test('login page keeps the reference hierarchy and opens native WeChat profile onboarding after consent', () => {
  const view = fs.readFileSync(path.join(miniprogramRoot, 'pages/login/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(miniprogramRoot, 'pages/login/index.wxss'), 'utf8')

  assert.match(view, /\/assets\/ui\/hero-memory\.png/)
  assert.match(view, /class="wechat-login-button/)
  assert.match(view, /\/assets\/ui\/wechat-mark\.png/)
  assert.doesNotMatch(view, /wechat-bubble|bubble-large|bubble-small/)
  assert.match(view, /欢迎来到那年的TA/)
  assert.match(view, /《用户协议》/)
  assert.match(view, /《隐私政策》/)
  assert.match(view, /open-type="chooseAvatar"/)
  assert.match(view, /type="nickname"/)
  assert.match(view, /<bottom-sheet[^>]*visible="\{\{showProfileSheet\}\}"/)
  assert.match(style, /\.wechat-login-button\s*\{[^}]*linear-gradient/s)
  assert.match(style, /\.wechat-login-button\s*\{[^}]*width:590rpx\s*!important/s)
  assert.match(style, /\.wechat-login-button\s*\{[^}]*height:120rpx/s)
  assert.match(style, /\.wechat-login-button\s*\{[^}]*font-size:40rpx/s)
  assert.match(style, /\.login-clouds\s*\{/)
})

test('login page uses wx.login code with HTTPS production config and stores API session plus chosen profile', async () => {
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
    data: { ...structuredClone(pageDefinition.data), agreed: true, nickname: '测试用户', avatarUrl: 'https://cdn.example.test/avatar.png' },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  instance.submitLogin()
  assert.equal(instance.data.showProfileSheet, true)
  await instance.confirmProfileLogin({ detail: { value: { nickname: '测试用户' } } })
  await new Promise(resolve => setTimeout(resolve, 500))

  assert.equal(loginCalled, true)
  assert.equal(requestBody.code, 'real-wx-code')
  assert.deepEqual(requestBody.profile, { nickname: '测试用户', avatarUrl: 'https://cdn.example.test/avatar.png' })
  assert.equal(storage.get('nashide_ta_token'), 'server-session-token')
  assert.deepEqual(storage.get('nashide_ta_user'), { id: 'user-1', nickname: '测试用户', avatarUrl: 'https://cdn.example.test/avatar.png', status: undefined })
  assert.equal(switchedTo, '/pages/home/index')
  assert.equal(storage.has('session_key'), false)
})
