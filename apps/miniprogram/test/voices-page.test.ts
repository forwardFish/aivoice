import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import type { VoiceSummary } from '../models/api'

const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
const voicesStyle = fs.readFileSync(path.join(appRoot, 'pages/voices/index.wxss'), 'utf8')

test('voices page typography stays aligned with the rest of the mini-program hierarchy', () => {
  assert.match(voicesStyle, /\.voices-page-title\s*\{[^}]*font-size:\s*50rpx[^}]*line-height:\s*1\.12/s)
  assert.match(voicesStyle, /\.voices-empty-title\s*\{[^}]*font-size:\s*34rpx/s)
  assert.match(voicesStyle, /\.voices-empty-copy\s*\{[^}]*font-size:\s*24rpx[^}]*line-height:\s*1\.65/s)
  assert.match(voicesStyle, /\.voice-name\s*\{[^}]*font-size:\s*34rpx[^}]*line-height:\s*1\.22/s)
  assert.match(voicesStyle, /\.status-pill\s*\{[^}]*font-size:\s*20rpx/s)
  assert.match(voicesStyle, /\.voice-meta\s*\{[^}]*font-size:\s*22rpx/s)
  assert.match(voicesStyle, /\.progress-stage\s*\{[^}]*font-size:\s*22rpx/s)
  assert.match(voicesStyle, /\.progress-percent\s*\{[^}]*font-size:\s*24rpx/s)
  assert.match(voicesStyle, /\.conversation-action,[\s\S]*?font-size:\s*25rpx\s*!important/s)
  assert.match(voicesStyle, /\.resume-action\s*\{[^}]*font-size:\s*24rpx\s*!important/s)
  assert.match(voicesStyle, /@media \(max-height:\s*740px\)[\s\S]*\.voices-page-title\s*\{[^}]*font-size:\s*46rpx/s)
  assert.match(voicesStyle, /@media \(max-height:\s*740px\)[\s\S]*\.voice-name\s*\{[^}]*font-size:\s*32rpx/s)
})

test('voices page card geometry is compact without changing the page title or footer scale', () => {
  assert.match(voicesStyle, /\.voice-list\s*\{[^}]*gap:\s*28rpx/s)
  assert.match(voicesStyle, /\.voice-card\s*\{[^}]*min-height:\s*232rpx[^}]*padding:\s*28rpx 28rpx 26rpx[^}]*border-radius:\s*32rpx/s)
  assert.match(voicesStyle, /\.voice-card\.is-ready\s*\{[^}]*min-height:\s*300rpx/s)
  assert.match(voicesStyle, /\.voice-card\.is-processing\s*\{[^}]*min-height:\s*216rpx/s)
  assert.match(voicesStyle, /\.voice-card\.is-draft,[\s\S]*?min-height:\s*250rpx/s)
  assert.match(voicesStyle, /\.card-top\s*\{[^}]*gap:\s*20rpx/s)
  assert.match(voicesStyle, /\.settings-button\s*\{[^}]*width:\s*68rpx[^}]*height:\s*68rpx/s)
  assert.match(voicesStyle, /\.settings-button-icon\s*\{[^}]*width:\s*68rpx[^}]*height:\s*68rpx/s)
  assert.match(voicesStyle, /\.progress-section\s*\{[^}]*margin-left:\s*144rpx/s)
  assert.match(voicesStyle, /\.ready-actions\s*\{[^}]*margin-top:\s*20rpx[^}]*gap:\s*16rpx/s)
  assert.match(voicesStyle, /\.conversation-action,[\s\S]*?min-height:\s*88rpx\s*!important[\s\S]*?font-size:\s*25rpx\s*!important/s)
  assert.match(voicesStyle, /\.resume-action\s*\{[^}]*min-height:\s*86rpx\s*!important[^}]*font-size:\s*24rpx\s*!important/s)
  assert.match(voicesStyle, /\.action-icon\s*\{[^}]*width:\s*42rpx[^}]*height:\s*42rpx/s)
})

let voicesPageCase = 0

async function loadVoicesPage(voices: Array<Partial<VoiceSummary>>) {
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => key === 'nashide_ta_token' ? 'test-token' : '',
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/voices')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { voices } }))
        return {}
      }
      if (url.includes('/points') || url.endsWith('/me')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { availablePoints: 99 } }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    stopPullDownRefresh: () => undefined
  }

  voicesPageCase += 1
  await import(`../pages/voices/index?case=ready-first-sorting-${voicesPageCase}`)
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  await instance.loadVoices()
  return instance
}

test('voices page keeps all READY voices above non-ready voices and sorts each group by recent time descending', async () => {
  const instance = await loadVoicesPage([
    { id: 'processing-newer', name: '处理中-新', status: 'PROCESSING', updatedAt: '2026-09-04T12:00:00.000Z' },
    { id: 'ready-older', name: '可用-旧', status: 'READY', acceptedAt: '2026-09-03T09:01:00.000Z', lastUsedAt: '2026-09-03T09:00:00.000Z' },
    { id: 'draft-middle', name: '草稿-中', status: 'DRAFT', updatedAt: '2026-09-04T10:00:00.000Z' },
    { id: 'ready-newer', name: '可用-新', status: 'READY', acceptedAt: '2026-09-04T15:01:00.000Z', lastUsedAt: '2026-09-04T15:00:00.000Z' },
    { id: 'failed-older', name: '失败-旧', status: 'FAILED', updatedAt: '2026-09-03T08:00:00.000Z' }
  ])

  assert.deepEqual(
    instance.data.voices.map((item: any) => item.id),
    ['ready-newer', 'ready-older', 'processing-newer', 'draft-middle', 'failed-older']
  )
  assert.equal(instance.data.voices[0].avatarSize, 132)
  assert.equal(instance.data.voices[1].avatarSize, 132)
  assert.equal(instance.data.voices[2].avatarSize, 124)
  assert.equal(instance.data.voices[3].avatarSize, 124)
})

test('voices page keeps stable backend order when voices in the same priority group share the same effective time', async () => {
  const instance = await loadVoicesPage([
    { id: 'ready-first', name: '可用-A', status: 'READY', acceptedAt: '2026-09-04T08:01:00.000Z', lastUsedAt: '2026-09-04T08:00:00.000Z' },
    { id: 'ready-second', name: '可用-B', status: 'READY', acceptedAt: '2026-09-04T08:02:00.000Z', lastUsedAt: '2026-09-04T08:00:00.000Z' },
    { id: 'draft-first', name: '草稿-A', status: 'DRAFT', updatedAt: '2026-09-03T07:00:00.000Z' },
    { id: 'draft-second', name: '草稿-B', status: 'PREVIEW_READY', updatedAt: '2026-09-03T07:00:00.000Z' }
  ])

  assert.deepEqual(
    instance.data.voices.map((item: any) => item.id),
    ['ready-first', 'ready-second', 'draft-first', 'draft-second']
  )
})

test('voices page keeps missing-time items in backend order behind timed items inside the same priority group', async () => {
  const instance = await loadVoicesPage([
    { id: 'failed-no-time-a', name: '失败-A', status: 'FAILED' },
    { id: 'ready-no-time', name: '可用-无时间', status: 'READY', acceptedAt: '2026-09-04T08:30:00.000Z' },
    { id: 'processing-timed', name: '处理中-有时间', status: 'PROCESSING', updatedAt: '2026-09-04T11:00:00.000Z' },
    { id: 'failed-no-time-b', name: '失败-B', status: 'FAILED' },
    { id: 'ready-timed', name: '可用-有时间', status: 'READY', acceptedAt: '2026-09-04T09:01:00.000Z', updatedAt: '2026-09-04T09:00:00.000Z' }
  ])

  assert.deepEqual(
    instance.data.voices.map((item: any) => item.id),
    ['ready-timed', 'ready-no-time', 'processing-timed', 'failed-no-time-a', 'failed-no-time-b']
  )
})
