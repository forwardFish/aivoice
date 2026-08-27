import assert from 'node:assert/strict'
import test from 'node:test'

test('shared pure-cloud transport binds the resource AppID per environment and preserves REST paths', async () => {
  const calls: any[] = []
  let httpRequestCalled = false
  let failFunctionTransport = false
  class SharedCloud {
    options: any

    constructor(options: any) {
      this.options = options
      calls.push({ type: 'construct', options })
    }

    init() {
      calls.push({ type: 'init', options: this.options })
    }

    callFunction(options: any) {
      calls.push({ type: 'function', options, binding: this.options })
      if (failFunctionTransport) {
        options.fail({ errMsg: 'cloud.callFunction:fail Error: Failed to fetch (system error)' })
        return
      }
      options.success({ result: {
          statusCode: 200,
          data: {
          token: 'session-token',
          user: { id: 'user-1', nickname: '测试用户' },
          trialEligibility: 'ELIGIBLE'
          }
        } })
    }

    uploadFile(options: any) {
      calls.push({ type: 'upload', options, binding: this.options })
      options.success({ fileID: 'cloud://env.bucket/source/user/voice/media.mp4' })
      return { onProgressUpdate(handler: (event: any) => void) { handler({ progress: 100 }) } }
    }
  }
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({}),
    getStorageSync: (key: string) => key === 'nashide_ta_token' ? 'session-token' : '',
    setStorageSync() {},
    removeStorageSync() {},
    request(options: any) {
      httpRequestCalled = true
      options.success({
        statusCode: 200,
        data: { products: [{ productCode: 'POINTS_50', points: 50, amountFen: 990, autoRenew: false }] }
      })
    },
    cloud: {
      Cloud: SharedCloud,
      callContainer() {},
      callFunction() {}
    }
  }
  const api = await import('../services/api.js')
  const login = await api.loginWechat({ code: 'ignored-by-platform-identity' })
  assert.equal(login.token, 'session-token')
  const functionCall = calls.find((call) => call.type === 'function')
  assert.equal(functionCall.options.data.path, '/v1/auth/wechat')
  assert.equal(functionCall.options.name, 'aivoice-api-event')
  assert.equal(functionCall.options.config, undefined)
  assert.deepEqual(functionCall.binding, {
    resourceAppid: 'wx1e662dd78e2fb22e',
    resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc'
  })
  assert.equal(functionCall.options.data.headers['X-WX-SERVICE'], undefined)
  assert.equal(httpRequestCalled, false)

  const uploaded = await api.uploadToPolicy({
    policy: {
      mode: 'cloud-file',
      cloudPath: 'source/user/voice/media.mp4',
      mediaId: 'media-1',
      maxBytes: 100 * 1024 * 1024
    },
    filePath: 'wxfile://authorized-video.mp4'
  })
  assert.equal(uploaded.objectKey, 'cloud://env.bucket/source/user/voice/media.mp4')
  assert.equal(uploaded.mediaId, 'media-1')
  const uploadCall = calls.find((call) => call.type === 'upload')
  assert.equal(uploadCall.options.cloudPath, 'source/user/voice/media.mp4')
  assert.equal(uploadCall.options.config, undefined)
  assert.deepEqual(uploadCall.binding, {
    resourceAppid: 'wx1e662dd78e2fb22e',
    resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc'
  })

  failFunctionTransport = true
  const products = await api.listProducts()
  assert.equal(httpRequestCalled, true)
  assert.equal(products.products[0]?.productCode, 'POINTS_50')

  const functionCallsBeforeDevToolsRead = calls.filter((call) => call.type === 'function').length
  httpRequestCalled = false
  failFunctionTransport = false
  ;(globalThis as any).wx.getDeviceInfo = () => ({ platform: 'devtools' })
  const devToolsProducts = await api.listProducts()
  assert.equal(httpRequestCalled, true)
  assert.equal(devToolsProducts.products[0]?.productCode, 'POINTS_50')
  assert.equal(calls.filter((call) => call.type === 'function').length, functionCallsBeforeDevToolsRead)
})
