import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('account page keeps content mounted and uses an inline retry notice', () => {
  const markup = readFileSync(new URL('../pages/account/index.wxml', import.meta.url), 'utf8')
  const style = readFileSync(new URL('../pages/account/index.wxss', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/account/index.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(markup, /wx:if="\{\{state === 'loading'\}\}"/)
  assert.doesNotMatch(markup, /wx:elif="\{\{state === 'error'\}\}"/)
  assert.doesNotMatch(markup, /<page-state/)
  assert.match(markup, /class="account-notice/)
  assert.match(markup, /bindtap="retryLoad"/)
  assert.match(style, /\.account-notice\s*\{/)
  assert.match(source, /Promise\.allSettled\(/)
  assert.match(source, /hydrateCachedUser\(\)/)
  assert.doesNotMatch(source, /state:\s*'loading'/)
})

test('account page uses png assets for account icons to avoid real-device webp rendering failures', () => {
  const markup = readFileSync(new URL('../pages/account/index.wxml', import.meta.url), 'utf8')

  assert.doesNotMatch(markup, /\/assets\/ui\/account-(?:edit|help|orders|points|service|stat-points|stat-voices)\.webp/)
  assert.match(markup, /\/assets\/ui\/account-stat-voices\.png/)
  assert.match(markup, /\/assets\/ui\/account-stat-points\.png/)
  assert.match(markup, /\/assets\/ui\/account-orders\.png/)
  assert.match(markup, /\/assets\/ui\/account-points\.png/)
  assert.match(markup, /\/assets\/ui\/account-help\.png/)
  assert.match(markup, /\/assets\/ui\/account-service\.png/)
  assert.doesNotMatch(markup, /\/assets\/ui\/account-edit\.(?:png|webp)/)
})

test('account page hides edit-profile entry points and keeps the hero as a read-only identity card', () => {
  const markup = readFileSync(new URL('../pages/account/index.wxml', import.meta.url), 'utf8')
  const style = readFileSync(new URL('../pages/account/index.wxss', import.meta.url), 'utf8')

  assert.match(markup, /class="account-hero"/)
  assert.match(markup, /class="profile-identity"/)
  assert.doesNotMatch(markup, /edit-profile-button/)
  assert.doesNotMatch(markup, /bindtap="editProfile"/)
  assert.doesNotMatch(markup, /bindtap="editAvatar"/)
  assert.doesNotMatch(markup, /aria-label="更换头像"/)
  assert.doesNotMatch(markup, /role="button" aria-label="更换头像"/)
  assert.match(style, /\.profile-identity\s*\{[^}]*display:\s*flex;/)
  assert.match(style, /\.account-hero\s*\{[^}]*display:\s*flex;/)
  assert.doesNotMatch(style, /\.edit-profile-button\s*\{/)
})

test('account page exits the session without deleting the account or local project data', async () => {
  const markup = readFileSync(new URL('../pages/account/index.wxml', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/account/index.ts', import.meta.url), 'utf8')
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_user', { id: 'user-1', nickname: '测试用户' }],
    ['nashide_ta_workbench_draft:voice-1', { chatText: '保留的草稿' }]
  ])
  let pageDefinition: any
  let requestCalled = false
  let relaunchedTo = ''
  let modalOptions: any

  assert.match(markup, />\{\{signingOut \? '正在退出…' : '退出登录'\}\}<\/button>/)
  assert.match(markup, /bindtap="signOut"/)
  assert.doesNotMatch(markup, /注销账号|正在注销|danger-button/)
  assert.doesNotMatch(source, /deleteAccount|clearLocalProjectData|removeAccount/)

  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: () => {
      requestCalled = true
      throw new Error('logout must not call the account deletion API')
    },
    showModal: (options: any) => {
      modalOptions = options
      options.success({ confirm: true, cancel: false })
    },
    showToast: () => undefined,
    reLaunch: ({ url }: { url: string }) => { relaunchedTo = url }
  }

  await import('../pages/account/index?case=logout-without-delete')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      signingOut: false
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.signOut()

  assert.equal(modalOptions.title, '退出登录？')
  assert.match(modalOptions.content, /不会删除/)
  assert.equal(requestCalled, false)
  assert.equal(storage.has('nashide_ta_token'), false)
  assert.equal(storage.has('nashide_ta_user'), false)
  assert.equal(storage.get('nashide_ta_workbench_draft:voice-1').chatText, '保留的草稿')
  assert.equal(relaunchedTo, '/pages/login/index')
})

test('account page hydrates local profile first and preserves prior sections when refresh only partially succeeds', async () => {
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_user', { id: 'user-1', nickname: '本地昵称', avatarUrl: 'https://img.local/avatar.png' }]
  ])
  let pageDefinition: any
  let stopPullDownRefreshCalls = 0
  const requestUrls: string[] = []

  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/account/index', options: {} }]
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      requestUrls.push(url)
      if (url.endsWith('/me')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            user: { id: 'user-1', nickname: '服务端昵称', avatarUrl: '' },
            voiceCount: 7
          }
        }))
        return {}
      }
      if (url.endsWith('/points')) {
        queueMicrotask(() => options.fail({ errMsg: 'request:fail timeout' }))
        return {}
      }
      if (url.endsWith('/orders')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            orders: [
              { id: 'order-new', status: 'PAID', amountFen: 980, points: 98, createdAt: '2026-08-27T10:00:00.000Z' }
            ]
          }
        }))
        return {}
      }
      if (url.endsWith('/points/ledgers')) {
        queueMicrotask(() => options.fail({ errMsg: 'request:fail timeout' }))
        return {}
      }
      if (url.endsWith('/me/profile') && options.method === 'PATCH') {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            user: { id: 'user-1', nickname: '服务端昵称', avatarUrl: 'https://img.local/avatar.png' }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    stopPullDownRefresh: () => { stopPullDownRefreshCalls += 1 }
  }

  await import('../pages/account/index?case=silent-refresh-partial-failure')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      availablePoints: 88,
      orders: [{ id: 'order-old' }],
      ledgers: [{ id: 'ledger-old' }]
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.hydrateCachedUser()
  assert.equal(instance.data.user.nickname, '本地昵称')
  assert.equal(instance.data.avatarDisplayUrl, 'https://img.local/avatar.png')

  await instance.loadAccount(true)

  assert.equal(stopPullDownRefreshCalls, 1)
  assert.equal(instance.data.refreshing, false)
  assert.equal(instance.data.user.nickname, '服务端昵称')
  assert.equal(instance.data.user.avatarUrl, 'https://img.local/avatar.png')
  assert.equal(instance.data.voiceCount, 7)
  assert.equal(instance.data.availablePoints, 88)
  assert.equal(instance.data.orders[0].id, 'order-new')
  assert.equal(instance.data.ledgers[0].id, 'ledger-old')
  assert.equal(instance.data.errorMessage, '积分和积分记录暂未更新，点击重试')
  assert.equal(storage.get('nashide_ta_user').nickname, '服务端昵称')
  assert.equal(storage.get('nashide_ta_user').avatarUrl, 'https://img.local/avatar.png')
  assert.ok(requestUrls.some(url => url.endsWith('/me')))
  assert.ok(requestUrls.some(url => url.endsWith('/points')))
  assert.ok(requestUrls.some(url => url.endsWith('/orders')))
  assert.ok(requestUrls.some(url => url.endsWith('/points/ledgers')))
})
