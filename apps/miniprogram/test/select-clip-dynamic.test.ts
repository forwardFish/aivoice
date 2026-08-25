import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('all clip range update paths keep waveform selection and markers synchronized', async () => {
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_creation_session', {
      voiceId: 'voice-clip',
      tempFilePath: '/tmp/clip.mp4',
      durationMs: 40000,
      clipStartMs: 5000,
      clipEndMs: 25000
    }]
  ])
  let pageDefinition: any
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    redirectTo: () => undefined,
    reLaunch: () => undefined,
    navigateTo: () => undefined,
    createVideoContext: () => ({ pause: () => undefined, seek: () => undefined, play: () => undefined })
  }

  await import('../pages/create/select-clip?case=dynamic-range')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  instance.onLoad({ voiceId: 'voice-clip' })
  assert.equal(instance.data.startPercent, 12.5)
  assert.equal(instance.data.endPercent, 62.5)
  assert.equal(instance.data.selectionPercent, 50)

  instance.onStartSlider({ detail: { value: 10 } })
  assert.equal(instance.data.startSec, 10)
  assert.equal(instance.data.startPercent, 25)
  assert.equal(instance.data.endPercent, 62.5)
  assert.equal(instance.data.selectionPercent, 37.5)

  instance.onEndSlider({ detail: { value: 30 } })
  assert.equal(instance.data.endSec, 30)
  assert.equal(instance.data.endPercent, 75)
  assert.equal(instance.data.selectionPercent, 50)

  instance.data.currentSec = 12
  instance.setStartFromCurrent()
  assert.equal(instance.data.startSec, 12)
  assert.equal(instance.data.startPercent, 30)
  assert.equal(instance.data.selectionPercent, 45)

  instance.data.currentSec = 35
  instance.setEndFromCurrent()
  assert.equal(instance.data.endSec, 35)
  assert.equal(instance.data.endPercent, 87.5)
  assert.equal(instance.data.selectionPercent, 57.5)
})

test('WXML binds live percentages and quota dialog avoids immediate-arrival promise', () => {
  const root = path.resolve(process.cwd(), 'apps/miniprogram')
  const view = fs.readFileSync(path.join(root, 'pages/create/select-clip.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(root, 'pages/create/select-clip.wxss'), 'utf8')
  const dialog = fs.readFileSync(path.join(root, 'components/quota-purchase-dialog/quota-purchase-dialog.wxml'), 'utf8')

  assert.match(view, /left: \{\{startPercent\}\}%; width: \{\{selectionPercent\}\}%/)
  assert.match(view, /marker-start[^>]+left: \{\{startPercent\}\}%/)
  assert.match(view, /marker-end[^>]+left: \{\{endPercent\}\}%/)
  assert.match(view, /bindchanging="onStartSlider"/)
  assert.match(view, /bindchanging="onEndSlider"/)
  assert.doesNotMatch(style, /left:\s*18%/)
  assert.doesNotMatch(style, /right:\s*18%/)
  assert.match(dialog, /支付成功后自动确认入账/)
  assert.doesNotMatch(dialog, /支付后立即到账/)
})
