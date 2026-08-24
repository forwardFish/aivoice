import assert from 'node:assert/strict'
import test from 'node:test'

test('virtual pending orders retain provider identity when the success callback is lost', async () => {
  const storage = new Map<string, any>()
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key)
  }
  const pending = await import('../utils/storage.js')
  pending.setPendingOrderId('voice-risk', 'order-risk', 'VIRTUAL')
  assert.equal(pending.pendingOrderPaymentCompleted('voice-risk', 'order-risk'), false)
  assert.equal(pending.pendingOrderPaymentKind('voice-risk', 'order-risk'), 'VIRTUAL')
  pending.markPendingOrderPaymentCompleted('voice-risk', 'order-risk')
  assert.equal(pending.pendingOrderPaymentCompleted('voice-risk', 'order-risk'), true)
  assert.equal(pending.pendingOrderPaymentKind('voice-risk', 'order-risk'), 'VIRTUAL')
})
