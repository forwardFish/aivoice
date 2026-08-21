const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const evidenceDir = path.join(projectRoot, '.runtime', 'ui-evidence', 'main-flow')
const evidencePath = path.join(evidenceDir, 'preview-to-generation.json')
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9421'
const voiceId = process.env.WECHAT_RESUME_VOICE_ID

if (!voiceId) throw new Error('WECHAT_RESUME_VOICE_ID is required')
fs.mkdirSync(evidenceDir, { recursive: true })

const evidence = { status: 'RUNNING', voiceId, startedAt: new Date().toISOString(), steps: [], logs: [] }
const save = () => fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const record = (name, details = {}) => {
  evidence.steps.push({ name, status: 'PASS', at: new Date().toISOString(), ...details })
  save()
  console.log(`[PASS] ${name}`)
}
const withTimeout = (promise, label, timeoutMs = 20_000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs))
])

async function currentPage(miniProgram) {
  const page = await withTimeout(miniProgram.currentPage(), 'currentPage')
  if (!page) throw new Error('no current page')
  return page
}

async function waitForPath(miniProgram, expected, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const page = await currentPage(miniProgram)
    if (page.path === expected) return page
    await delay(300)
  }
  const page = await currentPage(miniProgram)
  throw new Error(`expected ${expected}, current ${page.path}, data=${JSON.stringify(await page.data())}`)
}

async function requireElement(page, selector) {
  const element = await withTimeout(page.$(selector), `find ${selector}`)
  if (!element) throw new Error(`element not found: ${selector}`)
  return element
}

async function main() {
  save()
  const miniProgram = await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'connect', 30_000)
  miniProgram.on('console', (...args) => { evidence.logs.push({ type: 'console', message: args.map(String).join(' ') }); save() })
  miniProgram.on('exception', (...args) => { evidence.logs.push({ type: 'exception', message: args.map(String).join(' ') }); save() })
  try {
    let page = await withTimeout(miniProgram.reLaunch(`/pages/create/preview?voiceId=${encodeURIComponent(voiceId)}`), 'open preview')
    if (!page) throw new Error('preview page did not open')
    const previewStarted = Date.now()
    let previewData
    while (Date.now() - previewStarted < 30_000) {
      previewData = await page.data()
      if (previewData.state === 'success' && previewData.audioUrl) break
      if (previewData.state === 'error') throw new Error(previewData.errorMessage || 'preview page failed')
      await page.waitFor(500)
    }
    if (!previewData?.audioUrl) throw new Error(`preview not ready: ${JSON.stringify(previewData)}`)
    record('preview-page-ready', { durationMs: previewData.durationMs, audioUrlPresent: true })

    const audioPlayer = await requireElement(page, 'audio-player')
    await withTimeout(audioPlayer.callMethod('toggle'), 'start audio playback')
    const waitMs = Math.max(4_000, Number(previewData.durationMs || 0) + 3_000)
    await page.waitFor(waitMs)
    page = await currentPage(miniProgram)
    previewData = await page.data()
    if (!previewData.playCompleted) throw new Error(`preview playback did not complete: ${JSON.stringify(previewData)}`)
    record('preview-played-completely', { waitMs })

    await withTimeout((await requireElement(page, '.primary-button')).tap(), 'accept preview')
    page = await waitForPath(miniProgram, 'pages/voice/workbench', 30_000)
    await page.waitFor(1200)
    let workbench = await page.data()
    if (workbench.state !== 'success') throw new Error(`workbench did not load: ${JSON.stringify(workbench)}`)
    record('preview-accepted-workbench-opened', { quota: workbench.quota })

    await withTimeout((await requireElement(page, '.exact-mode')).tap(), 'select exact mode')
    await withTimeout((await requireElement(page, '.exact-textarea')).input('请照顾好自己，我们都很想你。'), 'input exact text')
    await withTimeout((await requireElement(page, '.generate-button')).tap(), 'start generation')
    const generationStarted = Date.now()
    while (Date.now() - generationStarted < 180_000) {
      page = await currentPage(miniProgram)
      workbench = await page.data()
      const ready = Array.isArray(workbench.exactResults)
        && workbench.exactResults.find(item => item.status === 'READY' && item.audioUrl)
      if (!workbench.sending && ready) {
        evidence.result = { text: ready.text, durationMs: ready.durationMs, audioUrlPresent: true }
        break
      }
      if (!workbench.sending && workbench.errorMessage) throw new Error(workbench.errorMessage)
      await page.waitFor(1200)
    }
    if (!evidence.result) throw new Error(`generation did not complete: ${JSON.stringify(workbench)}`)
    record('exact-speech-generated-and-playable', { result: evidence.result, quota: workbench.quota })

    evidence.status = 'PASS'
    evidence.finishedAt = new Date().toISOString()
    evidence.finalPage = page.path
    evidence.finalData = { voiceName: workbench.voiceName, quota: workbench.quota, exactResultCount: workbench.exactResults.length }
    save()
  } catch (error) {
    evidence.status = 'FAIL'
    evidence.finishedAt = new Date().toISOString()
    evidence.error = error?.stack || String(error)
    try {
      const page = await currentPage(miniProgram)
      evidence.failurePage = page.path
      evidence.failureData = await page.data()
    } catch (_ignored) {}
    save()
    throw error
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
