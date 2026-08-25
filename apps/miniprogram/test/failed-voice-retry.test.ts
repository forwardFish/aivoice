import assert from 'node:assert/strict'
import test from 'node:test'

test('failed voice retry always restarts from video upload instead of trusting a stale local clip', async () => {
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_creation_session', { voiceId: 'failed-voice', tempFilePath: '/tmp/stale.mp4' }]
  ])
  let pageDefinition: any
  let redirected = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    redirectTo: ({ url }: { url: string }) => { redirected = url },
    reLaunch: () => undefined,
    switchTab: () => undefined
  }

  await import('../pages/create/progress?case=failed-retry-video-first')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data), voiceId: 'failed-voice', status: 'FAILED' },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  instance.retry()
  assert.equal(redirected, '/pages/create/select-video?voiceId=failed-voice')
  assert.doesNotMatch(redirected, /select-clip/)
})

test('failed voice card opens video selection directly', async () => {
  let pageDefinition: any
  let navigated = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    navigateTo: ({ url }: { url: string }) => { navigated = url },
    getStorageSync: () => 'test-token'
  }

  await import('../pages/voices/index?case=failed-card-video-first')
  const instance: any = { ...pageDefinition }
  instance.openPrimary({ currentTarget: { dataset: { id: 'failed-voice', status: 'FAILED' } } })
  assert.equal(navigated, '/pages/create/select-video?voiceId=failed-voice')
})
