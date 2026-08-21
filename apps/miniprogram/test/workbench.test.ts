import assert from 'node:assert/strict'
import test from 'node:test'

test('zero quota shows the fixed purchase option only after an active generation and preserves the draft', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      queueMicrotask(() => options.success({
        statusCode: 402,
        data: {
          code: 'QUOTA_EXHAUSTED',
          purchaseOption: {
            productCode: 'VOICE_QUOTA_10',
            amountFen: 990,
            quota: 10,
            autoRenew: false
          }
        }
      }))
      return {}
    },
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-zero-quota',
      state: 'success',
      mode: 'exact',
      exactText: '下一次主动生成才显示购买框。',
      exactCount: 15,
      quota: { trialQuotaRemaining: 0, paidQuotaRemaining: 0, availableQuota: 0 },
      exactResults: [{ id: 'prior', status: 'READY', audioUrl: '/prior.wav', text: '上一次成功结果' }],
      purchaseVisible: false
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  assert.equal(instance.data.purchaseVisible, false)
  assert.equal(instance.data.exactResults.length, 1)
  await instance.generateExact()

  assert.equal(instance.data.purchaseVisible, true)
  assert.equal(instance.data.exactText, '下一次主动生成才显示购买框。')
  assert.deepEqual(instance.data.purchaseOption, {
    productCode: 'VOICE_QUOTA_10',
    amountFen: 990,
    quota: 10,
    autoRenew: false
  })
  assert.equal(instance.data.quota.availableQuota, 0)
  assert.equal(instance.data.exactResults.length, 1)
  assert.equal(storage.get('nashide_ta_workbench_draft:voice-zero-quota').exactText, '下一次主动生成才显示购买框。')
})
