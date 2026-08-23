import assert from 'node:assert/strict'
import test from 'node:test'

test('WeChat random values produce a different RFC 4122 idempotency key for every request', async () => {
  let sequence = 1
  ;(globalThis as any).wx = {
    getRandomValues(options: any) {
      const bytes = new Uint8Array(Number(options.length || 0))
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (sequence * 31 + index * 17) & 0xff
      }
      sequence += 1
      queueMicrotask(() => options.success({ randomValues: bytes.buffer }))
    }
  }

  const { uuidV4 } = await import('../utils/uuid?case=wechat-random-values')
  const values = await Promise.all([uuidV4(), uuidV4(), uuidV4()])

  assert.equal(new Set(values).size, values.length)
  for (const value of values) {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
})
