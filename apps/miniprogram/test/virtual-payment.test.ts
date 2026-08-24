import assert from 'node:assert/strict'
import test from 'node:test'

test('virtual payment params use wx.requestVirtualPayment instead of ordinary JSAPI payment', async () => {
  const calls: any[] = []
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({ apiBaseUrl: 'https://api.example.test', apiTransport: 'http' }),
    getStorageSync: () => '',
    setStorageSync() {},
    removeStorageSync() {},
    requestVirtualPayment(options: any) {
      calls.push(options)
      options.success({ errMsg: 'requestVirtualPayment:ok' })
    },
    requestPayment() { throw new Error('ordinary JSAPI payment must not be used') }
  }
  const { requestPayment } = await import('../services/api.js')
  await requestPayment({
    kind: 'VIRTUAL',
    signData: '{"offerId":"offer-risk"}',
    paySig: 'pay-sig',
    signature: 'user-signature',
    mode: 'short_series_goods'
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].mode, 'short_series_goods')
  assert.equal(calls[0].paySig, 'pay-sig')
})
