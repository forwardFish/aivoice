import assert from 'node:assert/strict'
import test from 'node:test'

test('zero points shows the purchase option only after an active generation and preserves the draft', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/exact-speech') || url.includes('/messages')) {
        queueMicrotask(() => options.success({
          statusCode: 402,
          data: {
            code: 'QUOTA_EXHAUSTED',
            purchaseOption: {
              productCode: 'VOICE_POINTS_50',
              amountFen: 990,
              points: 50,
              autoRenew: false
            }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=points-exhausted')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-zero-points',
      state: 'success',
      mode: 'exact',
      exactText: '下一次主动生成才显示购买框。',
      exactCount: 15,
      points: { availablePoints: 0 },
      exactResults: [{ id: 'prior', status: 'READY', audioUrl: '/prior.wav', text: '上一次成功结果' }],
      purchaseVisible: false
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.generateExact()

  assert.equal(instance.data.purchaseVisible, true)
  assert.equal(instance.data.exactText, '下一次主动生成才显示购买框。')
  assert.equal(instance.data.purchaseOption.productCode, 'VOICE_POINTS_50')
  assert.equal(instance.data.purchaseOption.amountFen, 990)
  assert.equal(instance.data.purchaseOption.points, 50)
  assert.equal(instance.data.purchaseOption.autoRenew, false)
  assert.equal(instance.data.points.availablePoints, 0)
  assert.equal(storage.get('nashide_ta_workbench_draft:voice-zero-points').exactText, '下一次主动生成才显示购买框。')
})

test('purchase action opens the dedicated purchase page with preserved mode and product code', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let navigatedUrl = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    navigateTo: ({ url }: any) => { navigatedUrl = String(url || '') },
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=open-purchase')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-open-purchase',
      state: 'success',
      mode: 'exact',
      purchaseVisible: true,
      purchaseOption: {
        productCode: 'VOICE_POINTS_50',
        amountFen: 990,
        points: 50,
        autoRenew: false
      }
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  instance.buyQuota()

  assert.equal(instance.data.purchaseVisible, false)
  assert.equal(navigatedUrl, '/pages/purchase/index?voiceId=voice-open-purchase&mode=exact&productCode=VOICE_POINTS_50')
})

test('workbench auto-opens purchase recovery when a pending order exists', async () => {
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_pending_order:voice-pending', { orderId: 'order-pending', paymentCompleted: true, updatedAt: Date.now() }]
  ])
  let pageDefinition: any
  const navigations: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/points')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { availablePoints: 0 } }))
        return {}
      }
      if (url.includes('/products')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: { products: [{ productCode: 'VOICE_POINTS_50', amountFen: 990, points: 50, autoRenew: false }] }
        }))
        return {}
      }
      if (url.includes('/voices/voice-pending/conversation')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { messages: [] } }))
        return {}
      }
      if (url.includes('/voices/voice-pending')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'voice-pending',
            name: '待恢复声音',
            status: 'READY',
            acceptedAt: '2026-08-21T12:00:00.000Z',
            points: { availablePoints: 0 }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    navigateTo: ({ url }: { url: string }) => navigations.push(url),
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=pending-order-recovery')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-pending'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.loadData(false)

  assert.deepEqual(navigations, ['/pages/purchase/index?voiceId=voice-pending&resume=1'])
  assert.equal(storage.get('nashide_ta_pending_order:voice-pending').orderId, 'order-pending')
})
