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
  assert.match(pageSource, /autoClipSelected:\s*true/)
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
  await passing.waitForSourceSpeakerCheck('voice-source-check', 1, {
    status: 'DRAFT', clipStartMs: 1_750, clipEndMs: 13_750
  })
  assert.equal(redirected, '/pages/create/select-clip?voiceId=voice-source-check')
  assert.equal(passing.data.state, 'success')
  assert.equal(storage[CREATION_SESSION_KEY].sourceSpeakerCheckPending, false)
  assert.equal(storage[CREATION_SESSION_KEY].clipStartMs, 1_750)
  assert.equal(storage[CREATION_SESSION_KEY].clipEndMs, 13_750)
  assert.equal(storage[CREATION_SESSION_KEY].autoClipSelected, true)

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

  storage[CREATION_SESSION_KEY] = {
    voiceId: 'voice-source-check', tempFilePath: 'wxfile://source-check.mp4', durationMs: 12000,
    clipStartMs: 1000, clipEndMs: 11000, autoClipSelected: true, sourceSpeakerCheckPending: true
  }
  redirected = ''
  const noWindow = makeInstance()
  await noWindow.waitForSourceSpeakerCheck('voice-source-check', 1, { status: 'DRAFT', clipStartMs: null, clipEndMs: null })
  assert.equal(redirected, '/pages/create/select-clip?voiceId=voice-source-check')
  assert.equal(storage[CREATION_SESSION_KEY].autoClipSelected, false)
  assert.equal(storage[CREATION_SESSION_KEY].clipStartMs, 0)
  assert.equal(storage[CREATION_SESSION_KEY].clipEndMs, 0)
})

test('progress routes speaker failures to a new video and quality failures back to the retained clip', async () => {
  let pageDefinition: any
  let redirected = ''
  let modalCalls = 0
  const storage: Record<string, any> = {
    [TOKEN_KEY]: 'test-token',
    [CREATION_SESSION_KEY]: { voiceId: 'voice-multiple-speakers', autoClipSelected: true }
  }

  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    showModal: () => { modalCalls += 1 },
    redirectTo: ({ url }: { url: string }) => { redirected = url },
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value }
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

  redirected = ''
  instance.speakerFailureRedirecting = false
  instance.applyVoice({
    ...failedVoice,
    error: { code: 'NO_VALID_SPEECH', message: '没有找到连续清晰人声' }
  })
  assert.equal(redirected, '/pages/create/select-clip?voiceId=voice-multiple-speakers')
  assert.equal(storage[CREATION_SESSION_KEY].autoClipSelected, false)
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

test('resume idempotently starts an unqueued precheck before accepting DRAFT as complete', async () => {
  let pageDefinition: any
  let redirected = ''
  let requestCount = 0
  const storage: Record<string, any> = {
    [TOKEN_KEY]: 'test-token',
    [CREATION_SESSION_KEY]: {
      voiceId: 'voice-resume', tempFilePath: 'wxfile://resume.mp4', durationMs: 12000,
      sourceSpeakerCheckPending: true, sourceSpeakerCheckStarted: false
    }
  }
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value },
    request: ({ method, url, success }: any) => {
      requestCount += 1
      if (method === 'GET') {
        assert.match(url, /\/voices\/voice-resume$/)
        success({ statusCode: 200, data: { id: 'voice-resume', status: 'DRAFT' } })
      } else {
        assert.equal(method, 'POST')
        assert.match(url, /voice-resume\/source-speaker-check$/)
        success({ statusCode: 200, data: { id: 'voice-resume', status: 'DRAFT', clipStartMs: 0, clipEndMs: 12000 } })
      }
    },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }
  await import('../pages/create/select-video?case=source-speaker-resume-start')
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data), state: 'checking', existingVoiceId: 'voice-resume',
      selected: { tempFilePath: 'wxfile://resume.mp4' }
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  await instance.resumeSourceSpeakerCheck()
  assert.equal(requestCount, 2)
  assert.equal(storage[CREATION_SESSION_KEY].sourceSpeakerCheckStarted, true)
  assert.equal(storage[CREATION_SESSION_KEY].autoClipSelected, true)
  assert.equal(redirected, '/pages/create/select-clip?voiceId=voice-resume')
})

test('resume reads and handles a stored speaker rejection before trying to queue again', async () => {
  let pageDefinition: any
  let redirected = ''
  let postCalls = 0
  const storage: Record<string, any> = {
    [TOKEN_KEY]: 'test-token',
    [CREATION_SESSION_KEY]: {
      voiceId: 'voice-rejected-resume', tempFilePath: 'wxfile://rejected.mp4', durationMs: 12000,
      sourceSpeakerCheckPending: true, sourceSpeakerCheckStarted: true
    }
  }
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value },
    removeStorageSync: (key: string) => { delete storage[key] },
    request: ({ method, success }: any) => {
      if (method === 'POST') postCalls += 1
      success({ statusCode: 200, data: {
        id: 'voice-rejected-resume', status: 'FAILED',
        failureCode: 'MULTIPLE_SPEAKERS', failureMessage: '检测到多个声音'
      } })
    },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }
  await import('../pages/create/select-video?case=source-speaker-resume-rejected')
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data), state: 'checking', existingVoiceId: 'voice-rejected-resume',
      selected: { tempFilePath: 'wxfile://rejected.mp4' }
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  await instance.resumeSourceSpeakerCheck()
  assert.equal(postCalls, 0)
  assert.equal(instance.data.speakerFailureDialogVisible, true)
  assert.equal(storage[CREATION_SESSION_KEY], undefined)
  assert.equal(redirected, '')
})

test('unloading during upload prevents the stale continuation from writing a session or navigating', async () => {
  let pageDefinition: any
  let resolvePolicy: ((response: any) => void) | undefined
  let redirected = ''
  const storage: Record<string, any> = { [TOKEN_KEY]: 'test-token' }
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value },
    request: ({ success }: any) => { resolvePolicy = success },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }
  await import('../pages/create/select-video?case=cancel-upload-continuation')
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data), state: 'selected', existingVoiceId: 'voice-upload-cancel', selectedIndex: 0,
      selected: {
        tempFilePath: 'wxfile://cancel.mp4', fileName: 'cancel.mp4', mimeType: 'video/mp4',
        sizeBytes: 1000, durationMs: 12000
      }
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  const pending = instance.uploadAndContinue()
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(resolvePolicy)
  instance.onUnload()
  resolvePolicy?.({ statusCode: 200, data: {
    mode: 'signed-put', uploadMethod: 'PUT', uploadUrl: 'https://upload.test/source',
    objectKey: 'source/user/voice/cancel.mp4', mediaId: 'media-cancel', maxBytes: 100000,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  } })
  await pending
  assert.equal(storage[CREATION_SESSION_KEY], undefined)
  assert.equal(redirected, '')
  instance.onShow()
  assert.equal(instance.data.state, 'selected')
})

test('an upload finishing after unload is still confirmed for server-side expiry but never navigates', async () => {
  let pageDefinition: any
  let resolveUpload: ((response: any) => void) | undefined
  let confirmCalls = 0
  let redirected = ''
  const storage: Record<string, any> = { [TOKEN_KEY]: 'test-token' }
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage[key] || '',
    setStorageSync: (key: string, value: any) => { storage[key] = value },
    getFileSystemManager: () => ({
      readFile: ({ success }: any) => success({ data: new Uint8Array([1, 2, 3]).buffer })
    }),
    request: ({ method, url, success }: any) => {
      if (method === 'PUT') {
        resolveUpload = success
        return
      }
      if (/\/upload-policy$/.test(url)) {
        success({ statusCode: 200, data: {
          mode: 'signed-put', uploadMethod: 'PUT', uploadUrl: 'https://upload.test/late-source',
          objectKey: 'source/user/voice/late.mp4', mediaId: 'media-late', maxBytes: 100000,
          expiresAt: new Date(Date.now() + 60000).toISOString()
        } })
        return
      }
      if (/\/media$/.test(url)) {
        confirmCalls += 1
        success({ statusCode: 200, data: { id: 'voice-upload-late', status: 'DRAFT' } })
        return
      }
      throw new Error(`unexpected request ${method} ${url}`)
    },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }
  await import('../pages/create/select-video?case=confirm-upload-after-unload')
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data), state: 'selected', existingVoiceId: 'voice-upload-late', selectedIndex: 0,
      selected: {
        tempFilePath: 'wxfile://late.mp4', fileName: 'late.mp4', mimeType: 'video/mp4',
        sizeBytes: 3, durationMs: 12000
      }
    },
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  const pending = instance.uploadAndContinue()
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(resolveUpload)
  instance.onUnload()
  resolveUpload?.({ statusCode: 200, data: '', header: { etag: 'late-etag' } })
  await pending
  assert.equal(confirmCalls, 1)
  assert.equal(storage[CREATION_SESSION_KEY], undefined)
  assert.equal(redirected, '')
})

test('progress ignores a voice response that resolves after the page was hidden', async () => {
  let pageDefinition: any
  let resolveVoice: ((response: any) => void) | undefined
  let redirected = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => key === TOKEN_KEY ? 'test-token' : '',
    request: ({ success }: any) => { resolveVoice = success },
    redirectTo: ({ url }: { url: string }) => { redirected = url }
  }
  await import('../pages/create/progress?case=cancel-inflight-poll')
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data), voiceId: 'voice-poll-cancel' },
    pollRun: 7,
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  const pending = instance.pollOnce(7)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(resolveVoice)
  instance.onHide()
  resolveVoice?.({ statusCode: 200, data: { id: 'voice-poll-cancel', status: 'READY' } })
  await pending
  assert.equal(redirected, '')
})
