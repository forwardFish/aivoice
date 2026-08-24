import assert from 'node:assert/strict'
import test from 'node:test'

test('shared pure-cloud transport binds the resource AppID per environment and preserves REST paths', async () => {
  const calls: any[] = []
  let httpRequestCalled = false
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
    getStorageSync: () => '',
    setStorageSync() {},
    removeStorageSync() {},
    request() { httpRequestCalled = true },
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
})
