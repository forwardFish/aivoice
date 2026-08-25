import assert from 'node:assert/strict'
import test from 'node:test'

test('cloud file IDs download to a local playable path without an HTTP domain', async () => {
  const calls: any[] = []
  class SharedCloud {
    options: any

    constructor(options: any) {
      this.options = options
    }

    init() {}

    downloadFile(options: any) {
      calls.push({ options, binding: this.options })
      options.success({ tempFilePath: 'wxfile://tmp/generated.wav' })
    }
  }
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({}),
    cloud: {
      Cloud: SharedCloud
    }
  }
  const { isCloudFileId, resolvePlayableSource } = await import('../services/cloud-media.js')
  assert.equal(isCloudFileId('cloud://env.bucket/generated.wav'), true)
  assert.equal(await resolvePlayableSource('cloud://env.bucket/generated.wav'), 'wxfile://tmp/generated.wav')
  assert.equal(calls[0].options.fileID, 'cloud://env.bucket/generated.wav')
  assert.equal(calls[0].options.config, undefined)
  assert.deepEqual(calls[0].binding, {
    resourceAppid: 'wx1e662dd78e2fb22e',
    resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc'
  })
  assert.equal(await resolvePlayableSource('https://example.test/generated.wav'), 'https://example.test/generated.wav')
})
