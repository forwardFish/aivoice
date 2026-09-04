import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const CREATION_SESSION_KEY = 'nashide_ta_creation_session'
const TOKEN_KEY = 'nashide_ta_token'

test('video selection page stays quiet on normal entry and opens the album without a native modal', async () => {
  const markup = readFileSync(new URL('../pages/create/select-video.wxml', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../pages/create/select-video.wxss', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../pages/create/select-video.ts', import.meta.url), 'utf8')
  const apiSource = readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../pages/create/select-video.json', import.meta.url), 'utf8'))
  assert.match(markup, /speakerFailureDialogVisible/)
  assert.match(markup, /speaker-failure-dialog-overlay/)
  assert.match(markup, /wx:elif="\{\{state === 'checking'\}\}"/)
  assert.match(markup, /正在检查视频声音/)
  assert.match(markup, /确认视频中只有 TA 一个人清楚说话，请稍候。/)
  assert.match(markup, /upload-orb-checking/)
  assert.match(markup, /custom-class="speaker-failure-dialog-button"/)
  assert.equal(config.usingComponents['app-button'], '/components/app-button/app-button')
  assert.match(styles, /\.speaker-failure-dialog-button-host\s*\{[^}]*width:\s*100%/s)
  assert.match(styles, /\.speaker-failure-dialog-button\s*\{[^}]*width:\s*100% !important/s)
  assert.match(styles, /\.upload-orb-checking\s*\{/)
  assert.match(styles, /@keyframes upload-halo-pulse/)
  assert.match(styles, /@keyframes upload-dot-blink/)
  assert.match(pageSource, /startSourceSpeakerCheck\(voice\.id\)/)
  assert.match(pageSource, /state:\s*'checking'/)
  assert.match(apiSource, /source-speaker-check/)

  let pageDefinition: any
  let pickerCalls = 0
  let modalCalls = 0
  const removedKeys: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: () => { modalCalls += 1 },
    chooseMedia: ({ success }: any) => {
      pickerCalls += 1
      success({ tempFiles: [] })
    },
    getStorageSync: (key: string) => key === TOKEN_KEY ? 'test-token' : '',
    removeStorageSync: (key: string) => { removedKeys.push(key) }
  }

  await import('../pages/create/select-video?case=single-speaker-normal-entry')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  instance.onLoad({})
  assert.equal(instance.data.speakerFailureDialogVisible, false)
  assert.deepEqual(removedKeys, [])
  await instance.chooseVideo()
  assert.equal(modalCalls, 0)
  assert.equal(pickerCalls, 1)
})

test('source speaker precheck routes a passing video forward and rejects a multi-speaker video in place', async () => {
  let pageDefinition: any
  let redirected = ''
  const storage: Record<string, any> = {
    [TOKEN_KEY]: 'test-token',
    [CREATION_SESSION_KEY]: {
      voiceId: 'voice-source-check',
      tempFilePath: 'wxfile://source-check.mp4',
      fileName: 'source-check.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024,
      durationMs: 12000,
      sourceSpeakerCheckPending: true
    }
  }
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value },
    removeStorageSync: (key: string) => { delete storage[key] },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }

  await import('../pages/create/select-video?case=source-speaker-check-results')
  const makeInstance = () => ({
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      state: 'checking',
      existingVoiceId: 'voice-source-check',
      selected: { tempFilePath: 'wxfile://source-check.mp4' }
    },
    sourceSpeakerCheckRun: 1,
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  })

  const passing = makeInstance()
  await passing.waitForSourceSpeakerCheck('voice-source-check', 1, { status: 'DRAFT' })
  assert.equal(redirected, '/pages/create/select-clip?voiceId=voice-source-check')
  assert.equal(passing.data.state, 'success')
  assert.equal(storage[CREATION_SESSION_KEY].sourceSpeakerCheckPending, false)

  redirected = ''
  storage[CREATION_SESSION_KEY].sourceSpeakerCheckPending = true
  const rejected = makeInstance()
  await rejected.waitForSourceSpeakerCheck('voice-source-check', 1, {
    status: 'FAILED',
    error: { code: 'MULTIPLE_SPEAKERS', message: '检测到多个声音' }
  })
  assert.equal(redirected, '')
  assert.equal(rejected.data.state, 'idle')
  assert.equal(rejected.data.selected, null)
  assert.equal(rejected.data.speakerFailureDialogVisible, true)
  assert.equal(rejected.data.speakerFailureDialogTitle, '检测到多个声音')
  assert.equal(storage[CREATION_SESSION_KEY], undefined)
})

test('progress redirects speaker failures back to select-video with voiceId and failure code', async () => {
  let pageDefinition: any
  let redirected = ''
  let modalCalls = 0

  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: () => { modalCalls += 1 },
    redirectTo: ({ url }: { url: string }) => { redirected = url },
    getStorageSync: (key: string) => key === TOKEN_KEY ? 'test-token' : ''
  }

  await import('../pages/create/progress?case=single-speaker-progress-redirect')
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
    },
    progress: 0
  }

  instance.applyVoice(failedVoice)
  assert.equal(modalCalls, 0)
  assert.equal(redirected, '/pages/create/select-video?voiceId=voice-multiple-speakers&speakerFailure=MULTIPLE_SPEAKERS')
  assert.notEqual(instance.data.state, 'failed')
})

test('select-video with a legal speakerFailure query clears the session and shows an in-page dialog over idle state', async () => {
  let pageDefinition: any
  let modalCalls = 0
  let pickerCalls = 0
  const removedKeys: string[] = []
  const storage: Record<string, any> = {
    [TOKEN_KEY]: 'test-token',
    [CREATION_SESSION_KEY]: {
      voiceId: 'voice-multiple-speakers',
      tempFilePath: 'wxfile://failed-video.mp4',
      thumbTempFilePath: 'wxfile://failed-video.jpg',
      fileName: 'failed-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 12345678,
      durationMs: 12000,
      selectedTileIndex: 3
    }
  }

  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: () => { modalCalls += 1 },
    chooseMedia: ({ success }: any) => {
      pickerCalls += 1
      success({ tempFiles: [] })
    },
    getStorageSync: (key: string) => storage[key] || '',
    removeStorageSync: (key: string) => {
      removedKeys.push(key)
      delete storage[key]
    }
  }

  await import('../pages/create/select-video?case=single-speaker-failure-return')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data) },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }

  instance.onLoad({ voiceId: 'voice-multiple-speakers', speakerFailure: 'MULTIPLE_SPEAKERS' })
  assert.deepEqual(removedKeys, [CREATION_SESSION_KEY])
  assert.equal(instance.data.existingVoiceId, 'voice-multiple-speakers')
  assert.equal(instance.data.state, 'idle')
  assert.equal(instance.data.selected, null)
  assert.equal(instance.data.selectedIndex, -1)
  assert.equal(instance.data.speakerFailureDialogVisible, true)
  assert.equal(instance.data.speakerFailureDialogTitle, '检测到多个声音')
  assert.match(instance.data.speakerFailureDialogMessage, /只有 TA 一个人清楚说话/)
  assert.equal(modalCalls, 0)

  instance.dismissSpeakerFailureDialog()
  assert.equal(instance.data.speakerFailureDialogVisible, false)
  assert.equal(instance.data.state, 'idle')
  await instance.chooseVideo()
  assert.equal(pickerCalls, 1)
})
