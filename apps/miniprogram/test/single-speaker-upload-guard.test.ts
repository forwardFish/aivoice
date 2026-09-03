import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('video selection displays the single-speaker rule before opening the album', async () => {
  const markup = readFileSync(new URL('../pages/create/select-video.wxml', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../pages/create/select-video.wxss', import.meta.url), 'utf8')
  assert.match(markup, /只能有 TA 一个人说话/)
  assert.match(markup, /不要包含旁白、电视声、其他人插话或多人同时说话/)
  assert.match(styles, /\.speaker-rule-card\s*\{[^}]*border:\s*2rpx solid[^}]*background:\s*linear-gradient/s)

  let pageDefinition: any
  let pickerCalls = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: ({ success }: any) => success({ confirm: false }),
    chooseMedia: () => { pickerCalls += 1 },
    getStorageSync: () => 'test-token'
  }

  await import('../pages/create/select-video?case=single-speaker-before-picker')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  await instance.chooseVideo()
  assert.equal(pickerCalls, 0)
})

test('speaker detection failures show a blocking modal and restart from video selection', async () => {
  let pageDefinition: any
  let modal: any
  let redirected = ''
  let modalCalls = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: (options: any) => {
      modal = options
      modalCalls += 1
      options.success({ confirm: true })
    },
    redirectTo: ({ url }: { url: string }) => { redirected = url },
    getStorageSync: () => 'test-token',
    switchTab: () => undefined
  }

  await import('../pages/create/progress?case=single-speaker-failure-modal')
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-multiple-speakers'
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  const failedVoice: any = {
    name: '爸爸',
    status: 'FAILED',
    error: {
      code: 'MULTIPLE_SPEAKERS',
      message: '检测到多个声音，请重新选择只有 TA 一个人说话的视频。'
    }
  }
  instance.applyVoice(failedVoice)
  instance.applyVoice(failedVoice)

  assert.equal(modal.title, '检测到多个声音')
  assert.equal(modal.showCancel, false)
  assert.equal(modal.confirmText, '重新选择视频')
  assert.match(modal.content, /只有 TA 一个人清楚说话/)
  assert.equal(modalCalls, 1)
  assert.equal(redirected, '/pages/create/select-video?voiceId=voice-multiple-speakers')
})
