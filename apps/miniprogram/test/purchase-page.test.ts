import assert from 'node:assert/strict'
import test from 'node:test'

test('purchase page validates product mismatch before opening payment', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  const paymentCalls: any[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/voice/workbench', options: { voiceId: 'voice-1', mode: 'exact' } }, { route: 'pages/purchase/index', options: { voiceId: 'voice-1', mode: 'exact' } }]
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/products')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: { products: [{ productCode: 'POINTS_50', amountFen: 990, points: 50, autoRenew: false }] }
        }))
        return {}
      }
      if (url.includes('/points')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { availablePoints: 0 } }))
        return {}
      }
      if (url.endsWith('/orders') && options.method === 'POST') {
        queueMicrotask(() => options.success({
          statusCode: 201,
          data: {
            order: {
              id: 'order-1',
              voiceId: 'voice-1',
              productCode: 'POINTS_50',
              amountFen: 1990,
              points: 20,
              status: 'CREATED'
            },
            payment: {
              timeStamp: '1',
              nonceStr: '2',
              package: 'prepay_id=3',
              signType: 'RSA',
              paySign: '4'
            }
          }
        }))
        return {}
      }
      if (url.includes('/voices/voice-1')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'voice-1',
            name: '测试声音',
            status: 'READY',
            acceptedAt: '2026-08-21T12:00:00.000Z',
            points: { availablePoints: 0 }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    requestPayment: (options: any) => paymentCalls.push(options),
    showToast: () => undefined,
    navigateBack: () => undefined,
    redirectTo: () => undefined,
    reLaunch: () => undefined
  }

  await import('../pages/purchase/index?case=product-mismatch')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      mode: 'exact',
      state: 'success',
      purchaseOption: {
        productCode: 'POINTS_50',
        amountFen: 990,
        points: 50,
        autoRenew: false
      }
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.submitPurchase()

  assert.equal(paymentCalls.length, 0)
  assert.match(instance.data.errorMessage, /积分商品不一致/)
  assert.equal(storage.get('nashide_ta_pending_order:voice-1'), undefined)
})

test('purchase page confirms local paid order and returns to the workbench', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let navigatedBack = 0
  let redirectedUrl = ''
  let pointsAvailable = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => [{ route: 'pages/voice/workbench', options: { voiceId: 'voice-1', mode: 'exact' } }, { route: 'pages/purchase/index', options: { voiceId: 'voice-1', mode: 'exact' } }]
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/products')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: { products: [{ productCode: 'POINTS_50', amountFen: 990, points: 50, autoRenew: false }] }
        }))
        return {}
      }
      if (url.includes('/points')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { availablePoints: pointsAvailable } }))
        return {}
      }
      if (url.endsWith('/orders') && options.method === 'POST') {
        queueMicrotask(() => options.success({
          statusCode: 201,
          data: {
            order: {
              id: 'order-1',
              voiceId: 'voice-1',
              productCode: 'POINTS_50',
              amountFen: 990,
              points: 50,
              status: 'CREATED'
            },
            payment: {
              timeStamp: '1',
              nonceStr: '2',
              package: 'prepay_id=mock-prepay-order-1',
              signType: 'RSA',
              paySign: '4'
            }
          }
        }))
        return {}
      }
      if (url.includes('/orders/order-1/mock-paid')) {
        pointsAvailable = 50
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'order-1',
            voiceId: 'voice-1',
            productCode: 'POINTS_50',
            amountFen: 990,
            points: 50,
            status: 'PAID',
            pointsGranted: true,
            pointsGrantedAt: '2026-08-21T12:00:00.000Z'
          }
        }))
        return {}
      }
      if (url.includes('/orders/order-1/refresh')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'order-1',
            voiceId: 'voice-1',
            productCode: 'POINTS_50',
            amountFen: 990,
            points: 50,
            status: 'PAID',
            pointsGranted: true,
            pointsGrantedAt: '2026-08-21T12:00:00.000Z'
          }
        }))
        return {}
      }
      if (url.includes('/voices/voice-1')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'voice-1',
            name: '测试声音',
            status: 'READY',
            acceptedAt: '2026-08-21T12:00:00.000Z',
            points: { availablePoints: pointsAvailable }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    requestPayment: (options: any) => {
      queueMicrotask(() => options.success?.())
    },
    showToast: () => undefined,
    navigateBack: () => { navigatedBack += 1 },
    redirectTo: ({ url }: any) => { redirectedUrl = String(url || '') },
    reLaunch: () => undefined,
    showModal: () => undefined
  }

  await import('../pages/purchase/index?case=success-flow')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      mode: 'exact',
      state: 'success',
      purchaseOption: {
        productCode: 'POINTS_50',
        amountFen: 990,
        points: 50,
        autoRenew: false
      }
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.submitPurchase()

  assert.equal(navigatedBack, 1)
  assert.equal(redirectedUrl, '')
  assert.equal(storage.get('nashide_ta_pending_order:voice-1'), undefined)
  assert.equal(instance.data.pending, false)
  assert.equal(instance.data.points.availablePoints, 50)
})
