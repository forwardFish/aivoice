const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const evidenceDir = path.join(projectRoot, 'docs', 'auto-execute', 'screenshots', 'functional-closure')
const evidencePath = path.join(evidenceDir, 'functional-closure-ui.json')
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9420'
const apiBase = String(process.env.WECHAT_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const loginCode = process.env.WECHAT_UI_LOGIN_CODE || 'mock:devtools-main-flow-v4'
const explicitReadyVoiceId = process.env.WECHAT_UI_READY_VOICE_ID || ''
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'

const CONSENT_INDEX = {
  SELF: 0,
  OTHER: 1,
  MINOR: 2
}

fs.mkdirSync(evidenceDir, { recursive: true })

const evidence = {
  status: 'RUNNING',
  startedAt: new Date().toISOString(),
  endpoint,
  apiBase,
  loginCodeType: loginCode.startsWith('mock:') ? 'mock' : 'external',
  screenshots: [],
  steps: [],
  logs: []
}

function flush() {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
}

function record(name, status, details = {}) {
  evidence.steps.push({ name, status, at: new Date().toISOString(), ...details })
  flush()
  process.stdout.write(`[${status}] ${name}\n`)
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

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}/v1${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body == null ? undefined : JSON.stringify(options.body)
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${text}`)
  }
  return data
}

async function currentPage(miniProgram) {
  const page = await withTimeout(miniProgram.currentPage(), 'currentPage')
  if (!page) throw new Error('no current page')
  return page
}

async function waitForPage(miniProgram, expectedPath, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const page = await currentPage(miniProgram)
    if (page.path === expectedPath) return page
    await delay(300)
  }
  const page = await currentPage(miniProgram)
  throw new Error(`expected ${expectedPath}, current ${page.path}, data=${JSON.stringify(await page.data())}`)
}

async function waitForData(page, predicate, label, timeoutMs = 15_000) {
  const started = Date.now()
  let lastData = null
  while (Date.now() - started < timeoutMs) {
    lastData = await page.data()
    if (predicate(lastData)) return lastData
    await delay(250)
  }
  throw new Error(`${label} timed out: ${JSON.stringify(lastData)}`)
}

async function requireElement(page, selector) {
  const element = await withTimeout(page.$(selector), `find ${selector}`)
  if (!element) throw new Error(`missing ${selector} on ${page.path}`)
  return element
}

async function capture(miniProgram, fileName) {
  const absolutePath = path.join(evidenceDir, fileName)
  await withTimeout(miniProgram.screenshot({ path: absolutePath }), `screenshot ${fileName}`, 30_000)
  evidence.screenshots.push(absolutePath)
  flush()
  return absolutePath
}

async function openMiniProgram() {
  try {
    return {
      miniProgram: await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'connect devtools', 45_000),
      mode: 'connect'
    }
  } catch (_error) {
    return {
      miniProgram: await withTimeout(automator.launch({
        cliPath,
        projectPath: path.join(projectRoot, 'apps', 'miniprogram'),
        trustProject: true,
        timeout: 60_000
      }), 'launch devtools', 90_000),
      mode: 'launch'
    }
  }
}

async function seedSession(miniProgram, token, user) {
  await withTimeout(miniProgram.callWxMethod('clearStorageSync'), 'clearStorageSync')
  await withTimeout(miniProgram.callWxMethod('setStorageSync', 'nashide_ta_token', token), 'set token')
  await withTimeout(miniProgram.callWxMethod('setStorageSync', 'nashide_ta_user', user), 'set user')
}

async function createDraftVoice(token) {
  return api('/voices', { method: 'POST', token, body: {} })
}

async function canonicalConsent(token, voiceId, permissionType, name) {
  return api(`/voices/${encodeURIComponent(voiceId)}/profile`, {
    method: 'PUT',
    token,
    body: { name, permissionType }
  })
}

async function firstReadyVoice(token) {
  const voices = await api('/voices', { token })
  const list = Array.isArray(voices)
    ? voices
    : Array.isArray(voices && voices.voices)
      ? voices.voices
      : []
  if (explicitReadyVoiceId) {
    const match = list.find(item => item.id === explicitReadyVoiceId)
    if (!match) throw new Error(`WECHAT_UI_READY_VOICE_ID=${explicitReadyVoiceId} was not found in /voices`)
    return match
  }
  const ready = list.find(item => item.status === 'READY')
  if (!ready) {
    throw new Error('no READY voice found for this test account; create one first or pass WECHAT_UI_READY_VOICE_ID')
  }
  return ready
}

async function installModalMock(miniProgram, mode) {
  if (mode === 'cancel-first') {
    await miniProgram.mockWxMethod('showModal', function(options) {
      const app = getApp()
      app.__functionalClosureModalCalls = app.__functionalClosureModalCalls || []
      app.__functionalClosureModalCalls.push({
        title: options && options.title,
        content: options && options.content,
        confirmText: options && options.confirmText
      })
      options && options.success && options.success({ confirm: false, cancel: true })
      return Promise.resolve({ confirm: false, cancel: true })
    })
    return
  }
  await miniProgram.mockWxMethod('showModal', function(options) {
    const app = getApp()
    app.__functionalClosureModalCalls = app.__functionalClosureModalCalls || []
    const nextIndex = app.__functionalClosureModalCalls.length + 1
    app.__functionalClosureModalCalls.push({
      title: options && options.title,
      content: options && options.content,
      confirmText: options && options.confirmText
    })
    const confirmed = nextIndex === 1
    options && options.success && options.success({ confirm: confirmed, cancel: !confirmed })
    return Promise.resolve({ confirm: confirmed, cancel: !confirmed })
  })
}

async function clearModalCalls(miniProgram) {
  await miniProgram.evaluate(() => {
    const app = getApp()
    app.__functionalClosureModalCalls = []
  })
}

async function readModalCalls(miniProgram) {
  return miniProgram.evaluate(() => {
    const app = getApp()
    return app.__functionalClosureModalCalls || []
  })
}

async function verifyConsentVariant(miniProgram, token, permissionType) {
  const draft = await createDraftVoice(token)
  const canonical = await canonicalConsent(token, draft.id, permissionType, `${permissionType} 服务端文案校验`)
  let page = await withTimeout(
    miniProgram.reLaunch(`/pages/create/voice-profile?voiceId=${encodeURIComponent(draft.id)}`),
    `open ${permissionType} voice profile`,
    30_000
  )
  page = await waitForPage(miniProgram, 'pages/create/voice-profile', 20_000)
  await withTimeout((await requireElement(page, '.field-input')).input(`${permissionType} 页面点击`), `input ${permissionType} name`)
  const cards = await withTimeout(page.$$('.permission-card'), `find permission cards for ${permissionType}`)
  const target = cards[CONSENT_INDEX[permissionType]]
  if (!target) throw new Error(`permission card ${permissionType} not found`)
  await withTimeout(target.tap(), `tap ${permissionType} card`)
  await withTimeout((await requireElement(page, '.consent-box')).tap(), `confirm ${permissionType}`)
  const data = await waitForData(page, value => value.permissionType === permissionType && value.confirmed === true, `${permissionType} page state`)
  if (data.consentText !== canonical.consentText) {
    throw new Error(`${permissionType} consent text mismatch: page=${data.consentText} server=${canonical.consentText}`)
  }
  const screenshot = await capture(miniProgram, `consent-${permissionType.toLowerCase()}.png`)
  record(`consent-${permissionType.toLowerCase()}`, 'PASS', {
    screenshot,
    voiceId: draft.id,
    consentText: data.consentText
  })
}

async function verifyVoicesAndSettings(miniProgram, token) {
  const readyVoice = await firstReadyVoice(token)
  let page = await withTimeout(miniProgram.reLaunch('/pages/voices/index'), 'open voices page', 30_000)
  page = await waitForPage(miniProgram, 'pages/voices/index', 20_000)
  const voicesData = await waitForData(page, value => value.state !== 'loading', 'voices page loaded', 20_000)
  if (!Array.isArray(voicesData.voices) || voicesData.voices.length === 0) {
    throw new Error(`voices page has no entries: ${JSON.stringify(voicesData)}`)
  }
  const readyIndex = voicesData.voices.findIndex(item => item.id === readyVoice.id && item.status === 'READY')
  if (readyIndex < 0) {
    throw new Error(`READY voice ${readyVoice.id} not visible on voices page`)
  }
  const voicesShot = await capture(miniProgram, 'voices-index.png')
  record('voices-index', 'PASS', {
    screenshot: voicesShot,
    voiceCount: voicesData.voices.length,
    readyVoiceId: readyVoice.id,
    readyVoiceSelection: explicitReadyVoiceId ? 'explicit' : 'auto'
  })

  const settingsButtons = await withTimeout(page.$$('.settings-button'), 'find settings buttons')
  const readyButtons = voicesData.voices.filter(item => item.status === 'READY')
  const buttonIndex = readyButtons.findIndex(item => item.id === readyVoice.id)
  if (buttonIndex < 0 || !settingsButtons[buttonIndex]) {
    throw new Error(`settings button missing for READY voice ${readyVoice.id}`)
  }
  await withTimeout(settingsButtons[buttonIndex].tap(), 'tap settings button')
  page = await waitForPage(miniProgram, 'pages/voice/settings', 20_000)
  const settingsData = await waitForData(page, value => value.state !== 'loading', 'settings loaded', 20_000)
  if (settingsData.voiceId !== readyVoice.id) {
    throw new Error(`settings opened wrong voice: ${JSON.stringify(settingsData)}`)
  }
  const settingsShot = await capture(miniProgram, 'voice-settings.png')
  record('voice-settings', 'PASS', {
    screenshot: settingsShot,
    voiceId: settingsData.voiceId,
    permissionType: settingsData.permissionType
  })

  await clearModalCalls(miniProgram)
  await installModalMock(miniProgram, 'cancel-first')
  let clearModalEvents
  try {
    await withTimeout(page.callMethod('clearChat'), 'invoke clearChat cancel path', 15_000)
    await delay(800)
    page = await currentPage(miniProgram)
    const clearData = await page.data()
    clearModalEvents = await readModalCalls(miniProgram)
    if (clearData.clearing || clearData.successMessage || clearData.errorMessage) {
      throw new Error(`clearChat cancel changed state unexpectedly: ${JSON.stringify(clearData)}`)
    }
    if (page.path !== 'pages/voice/settings' || clearModalEvents.length !== 1) {
      throw new Error(`clearChat cancel evidence mismatch: page=${page.path} modal=${JSON.stringify(clearModalEvents)}`)
    }
  } finally {
    await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  }
  record('clear-chat-cancel', 'PASS', {
    modal: clearModalEvents[0]
  })

  await clearModalCalls(miniProgram)
  await installModalMock(miniProgram, 'cancel-second')
  let deleteModalEvents
  let voiceAfterDelete
  try {
    const voiceBeforeDelete = await api(`/voices/${encodeURIComponent(readyVoice.id)}`, { token })
    await withTimeout(page.callMethod('removeVoice'), 'invoke removeVoice cancel path', 15_000)
    await delay(800)
    page = await currentPage(miniProgram)
    const deleteData = await page.data()
    deleteModalEvents = await readModalCalls(miniProgram)
    voiceAfterDelete = await api(`/voices/${encodeURIComponent(readyVoice.id)}`, { token })
    if (deleteData.deleting || deleteData.deleted || deleteData.successMessage || deleteData.errorMessage) {
      throw new Error(`removeVoice cancel changed state unexpectedly: ${JSON.stringify(deleteData)}`)
    }
    if (page.path !== 'pages/voice/settings' || deleteModalEvents.length !== 2 || voiceBeforeDelete.status !== voiceAfterDelete.status) {
      throw new Error(`removeVoice cancel evidence mismatch: page=${page.path} modal=${JSON.stringify(deleteModalEvents)} before=${JSON.stringify(voiceBeforeDelete)} after=${JSON.stringify(voiceAfterDelete)}`)
    }
  } finally {
    await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  }
  const deleteShot = await capture(miniProgram, 'voice-settings-after-cancel.png')
  record('delete-cancel', 'PASS', {
    screenshot: deleteShot,
    modals: deleteModalEvents.map(item => item.title),
    statusAfterCancel: voiceAfterDelete.status
  })
}

async function verifyLegalPages(miniProgram) {
  let page
  const legalTargets = [
    { type: 'terms', expectedTitle: '服务协议' },
    { type: 'privacy', expectedTitle: '隐私政策' },
    { type: 'ai', expectedTitle: 'AI 生成标识说明' }
  ]
  for (const target of legalTargets) {
    page = await withTimeout(
      miniProgram.reLaunch(`/pages/legal/index?type=${encodeURIComponent(target.type)}`),
      `open legal page ${target.type}`,
      30_000
    )
    page = await waitForPage(miniProgram, 'pages/legal/index', 20_000)
    const data = await waitForData(page, value => value.doc && value.doc.title, `${target.type} legal data`, 10_000)
    if (data.doc.title !== target.expectedTitle) {
      throw new Error(`legal page ${target.type} title mismatch: ${JSON.stringify(data.doc)}`)
    }
    const screenshot = await capture(miniProgram, `legal-${target.type}.png`)
    record(`legal-${target.type}`, 'PASS', {
      screenshot,
      title: data.doc.title,
      version: data.doc.version
    })
  }
}

async function main() {
  flush()
  const login = await api('/auth/wechat', {
    method: 'POST',
    body: { code: loginCode, profile: { nickname: 'UI Functional Closure' } }
  })
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
    await seedSession(miniProgram, login.token, login.user)
    record('seed-session', 'PASS', { userId: login.user.id })

    await verifyConsentVariant(miniProgram, login.token, 'OTHER')
    await verifyConsentVariant(miniProgram, login.token, 'MINOR')
    await verifyVoicesAndSettings(miniProgram, login.token)
    await verifyLegalPages(miniProgram)

    evidence.status = 'PASS'
    evidence.finishedAt = new Date().toISOString()
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
    await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
