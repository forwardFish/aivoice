const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const evidenceDir = path.join(projectRoot, '.runtime', 'ui-evidence', 'main-flow')
const progressPath = path.join(evidenceDir, 'progress.json')
const inputVideo = path.join(projectRoot, '.runtime', 'backend-e2e', 'authorized-12s.mp4')
const inputVideoUrl = process.env.WECHAT_TEST_VIDEO_URL || 'http://127.0.0.1:8790/authorized-12s.mp4'
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9420'
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'

fs.mkdirSync(evidenceDir, { recursive: true })

const evidence = {
  status: 'RUNNING',
  endpoint,
  inputVideo,
  startedAt: new Date().toISOString(),
  steps: [],
  logs: []
}

function flush() {
  fs.writeFileSync(progressPath, JSON.stringify(evidence, null, 2))
}

function record(name, status, details = {}) {
  evidence.steps.push({ name, status, at: new Date().toISOString(), ...details })
  flush()
  process.stdout.write(`[${status}] ${name}${details.path ? ` (${details.path})` : ''}\n`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withTimeout(promise, label, timeoutMs = 20_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
  ])
}

async function currentPage(miniProgram) {
  const page = await withTimeout(miniProgram.currentPage(), 'currentPage')
  if (!page) throw new Error('no current mini-program page')
  return page
}

async function waitForPath(miniProgram, expected, timeoutMs = 30_000) {
  const started = Date.now()
  let lastPath = ''
  while (Date.now() - started < timeoutMs) {
    const page = await currentPage(miniProgram)
    lastPath = page.path
    if (lastPath === expected) return page
    await delay(300)
  }
  const page = await currentPage(miniProgram)
  throw new Error(`expected ${expected}, current ${page.path}, data=${JSON.stringify(await page.data())}`)
}

async function waitForAnyPath(miniProgram, expected, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const page = await currentPage(miniProgram)
    if (expected.includes(page.path)) return page
    await delay(800)
  }
  const page = await currentPage(miniProgram)
  throw new Error(`expected one of ${expected.join(', ')}, current ${page.path}, data=${JSON.stringify(await page.data())}`)
}

async function requireElement(page, selector) {
  const element = await withTimeout(page.$(selector), `find ${selector}`)
  if (!element) throw new Error(`element not found: ${selector} on ${page.path}`)
  return element
}

async function openMiniProgram() {
  try {
    return {
      miniProgram: await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'automation connection', 30_000),
      mode: 'connect'
    }
  } catch (_error) {
    return {
      miniProgram: await withTimeout(automator.launch({
        cliPath,
        projectPath: path.join(projectRoot, 'apps', 'miniprogram'),
        trustProject: true,
        timeout: 60_000
      }), 'automation launch', 90_000),
      mode: 'launch'
    }
  }
}

async function main() {
  if (!fs.existsSync(inputVideo)) throw new Error(`authorized test video is missing: ${inputVideo}`)
  flush()
  const { miniProgram, mode } = await openMiniProgram()
  evidence.connectionMode = mode
  miniProgram.on('console', (...args) => {
    evidence.logs.push({ type: 'console', at: new Date().toISOString(), message: args.map(String).join(' ') })
    flush()
  })
  miniProgram.on('exception', (...args) => {
    evidence.logs.push({ type: 'exception', at: new Date().toISOString(), message: args.map(String).join(' ') })
    flush()
  })
  try {
    await withTimeout(miniProgram.callWxMethod('clearStorageSync'), 'clearStorageSync')
    let page = await withTimeout(miniProgram.reLaunch('/pages/login/index'), 'open login')
    if (!page) throw new Error('login page did not open')
    await page.waitFor(300)
    record('login-page-opened', 'PASS', { path: page.path })

    await withTimeout((await requireElement(page, '.agreement-row')).tap(), 'agree terms')
    await withTimeout((await requireElement(page, '.login-button')).tap(), 'mock login submit')
    page = await waitForPath(miniProgram, 'pages/home/index', 30_000)
    record('mock-login-and-home', 'PASS', { path: page.path, state: (await page.data()).state })

    await withTimeout((await requireElement(page, '.create-card')).tap(), 'open create flow')
    page = await waitForPath(miniProgram, 'pages/create/select-video', 10_000)
    const videoStat = fs.statSync(inputVideo)
    const downloadedVideo = await withTimeout(
      miniProgram.callWxMethod('downloadFile', { url: inputVideoUrl }),
      'download authorized video into mini-program storage',
      60_000
    )
    if (!downloadedVideo?.tempFilePath) throw new Error(`downloadFile returned no temp path: ${JSON.stringify(downloadedVideo)}`)
    await page.setData({
      state: 'selected',
      selected: {
        tempFilePath: downloadedVideo.tempFilePath,
        fileName: 'authorized-12s.mp4',
        mimeType: 'video/mp4',
        sizeBytes: videoStat.size,
        durationMs: 12_000,
        durationText: '00:12',
        sizeText: `${(videoStat.size / 1024 / 1024).toFixed(1)} MB`
      }
    })
    record('authorized-video-selected', 'PASS', {
      path: page.path,
      bytes: videoStat.size,
      durationMs: 12_000,
      miniProgramTempFile: downloadedVideo.tempFilePath
    })

    await withTimeout((await requireElement(page, '.primary-button')).tap(), 'click upload authorized video')
    try {
      page = await waitForPath(miniProgram, 'pages/create/select-clip', 20_000)
    } catch (navigationError) {
      const current = await currentPage(miniProgram)
      const currentData = await current.data()
      const creationSession = await miniProgram.callWxMethod('getStorageSync', 'nashide_ta_creation_session')
      const uploadSucceeded = Number(currentData.uploadProgress) === 100
        && creationSession?.voiceId
        && creationSession?.mediaId
      if (!uploadSucceeded) throw navigationError
      page = await withTimeout(
        miniProgram.reLaunch(`/pages/create/select-clip?voiceId=${encodeURIComponent(creationSession.voiceId)}`),
        'recover DevTools navigation after successful upload',
        30_000
      )
      record('devtools-upload-navigation-recovered', 'PASS', {
        path: page?.path || '',
        reason: String(currentData.errorMessage || 'DevTools navigation timeout')
      })
    }
    const clipData = await page.data()
    if (!clipData.valid) throw new Error(`default clip is not valid: ${JSON.stringify(clipData)}`)
    record('video-uploaded-and-clip-page', 'PASS', { path: page.path, voiceId: clipData.voiceId, startSec: clipData.startSec, endSec: clipData.endSec })

    await withTimeout((await requireElement(page, '.consent-row')).tap(), 'confirm selected speaker')
    await withTimeout((await requireElement(page, '.primary-button')).tap(), 'save voice clip')
    page = await waitForPath(miniProgram, 'pages/create/voice-profile', 15_000)
    record('clip-saved', 'PASS', { path: page.path })

    await withTimeout((await requireElement(page, '.field-input')).input('主流程测试声音'), 'enter voice name')
    const permissionCards = await withTimeout(page.$$('.permission-card'), 'find permission cards')
    if (!permissionCards?.length) throw new Error('permission cards not found')
    await withTimeout(permissionCards[0].tap(), 'select permission')
    await withTimeout((await requireElement(page, '.consent-box')).tap(), 'confirm authorization')
    await withTimeout((await requireElement(page, '.primary-button')).tap(), 'submit profile and start process')
    try {
      page = await waitForPath(miniProgram, 'pages/create/progress', 15_000)
    } catch (navigationError) {
      const current = await currentPage(miniProgram)
      const currentData = await current.data()
      if (!currentData.confirmed || currentData.submitting || currentData.errorMessage) throw navigationError
      page = await withTimeout(
        miniProgram.reLaunch(`/pages/create/progress?voiceId=${encodeURIComponent(currentData.voiceId)}`),
        'recover DevTools navigation after authorization submit',
        30_000
      )
      record('devtools-profile-navigation-recovered', 'PASS', { path: page?.path || '' })
    }
    record('authorization-submitted', 'PASS', { path: page.path })

    page = await waitForAnyPath(miniProgram, ['pages/create/preview', 'pages/create/progress'], 240_000)
    if (page.path === 'pages/create/progress') {
      const progressData = await page.data()
      if (progressData.state === 'failed' || progressData.state === 'error') {
        throw new Error(`voice processing failed: ${JSON.stringify(progressData)}`)
      }
      try {
        page = await waitForPath(miniProgram, 'pages/create/preview', 120_000)
      } catch (navigationError) {
        const current = await currentPage(miniProgram)
        const currentData = await current.data()
        if (!['PREVIEW_READY', 'READY'].includes(String(currentData.status || ''))) throw navigationError
        page = await withTimeout(
          miniProgram.reLaunch(`/pages/create/preview?voiceId=${encodeURIComponent(currentData.voiceId)}`),
          'recover DevTools navigation to preview',
          30_000
        )
        record('devtools-preview-navigation-recovered', 'PASS', { path: page?.path || '' })
      }
    }
    const previewData = await page.data()
    if (!previewData.audioUrl) throw new Error(`preview has no audio URL: ${JSON.stringify(previewData)}`)
    record('real-voice-preview-ready', 'PASS', { path: page.path, voiceId: previewData.voiceId, durationMs: previewData.durationMs })

    const audioPlayer = await page.$('audio-player')
    if (!audioPlayer) throw new Error('preview audio player not found')
    await withTimeout(audioPlayer.callMethod('toggle'), 'start preview playback')
    const previewWaitMs = Math.max(4_000, Number(previewData.durationMs || 0) + 3_000)
    await page.waitFor(previewWaitMs)
    let refreshedPreview = await currentPage(miniProgram)
    let refreshedData = await refreshedPreview.data()
    if (!refreshedData.playCompleted) {
      throw new Error(`preview did not report complete playback: ${JSON.stringify(refreshedData)}`)
    }
    record('preview-played-completely', 'PASS', { path: refreshedPreview.path, waitedMs: previewWaitMs })

    await withTimeout((await requireElement(refreshedPreview, '.primary-button')).tap(), 'accept preview')
    try {
      page = await waitForPath(miniProgram, 'pages/voice/workbench', 20_000)
    } catch (navigationError) {
      const current = await currentPage(miniProgram)
      const currentData = await current.data()
      if (!currentData.playCompleted || currentData.errorMessage) throw navigationError
      page = await withTimeout(
        miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(currentData.voiceId)}&choose=1`),
        'recover DevTools navigation to workbench',
        30_000
      )
      record('devtools-workbench-navigation-recovered', 'PASS', { path: page?.path || '' })
    }
    await page.waitFor(1000)
    record('preview-accepted-and-workbench-opened', 'PASS', { path: page.path })

    await withTimeout((await requireElement(page, '.exact-mode')).tap(), 'choose exact speech mode')
    await withTimeout((await requireElement(page, '.exact-textarea')).input('请照顾好自己，我们都很想你。'), 'enter exact speech text')
    await withTimeout((await requireElement(page, '.generate-button')).tap(), 'start exact speech generation')
    const generationStarted = Date.now()
    let workbenchData
    while (Date.now() - generationStarted < 180_000) {
      page = await currentPage(miniProgram)
      workbenchData = await page.data()
      const ready = Array.isArray(workbenchData.exactResults)
        && workbenchData.exactResults.some(item => item.status === 'READY' && item.audioUrl)
      if (!workbenchData.sending && ready) break
      if (!workbenchData.sending && workbenchData.errorMessage) {
        throw new Error(`exact speech generation failed: ${workbenchData.errorMessage}`)
      }
      await page.waitFor(1200)
    }
    if (!workbenchData) workbenchData = await page.data()
    const result = Array.isArray(workbenchData.exactResults) ? workbenchData.exactResults[0] : null
    if (!result || result.status !== 'READY' || !result.audioUrl) {
      throw new Error(`exact speech result not ready/playable: ${JSON.stringify(workbenchData)}`)
    }
    record('exact-speech-generated-and-playable', 'PASS', {
      path: page.path,
      text: result.text,
      durationMs: result.durationMs,
      quotaRemaining: workbenchData.quota?.availableQuota
    })

    evidence.status = 'PASS'
    evidence.finishedAt = new Date().toISOString()
    evidence.finalPage = page.path
    evidence.finalData = {
      voiceName: workbenchData.voiceName,
      exactResultCount: workbenchData.exactResults.length,
      quotaRemaining: workbenchData.quota?.availableQuota
    }
    flush()
  } catch (error) {
    evidence.status = 'FAIL'
    evidence.finishedAt = new Date().toISOString()
    evidence.error = error && error.stack ? error.stack : String(error)
    try {
      const page = await currentPage(miniProgram)
      evidence.failurePage = page.path
      evidence.failureData = await page.data()
    } catch (_ignored) {}
    flush()
    throw error
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
