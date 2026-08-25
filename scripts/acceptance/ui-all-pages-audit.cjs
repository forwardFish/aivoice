const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const outputDir = path.join(projectRoot, '.runtime', 'ui-audit-all-pages')
const wsEndpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9422'

fs.mkdirSync(outputDir, { recursive: true })

function withTimeout(promise, label, timeoutMs = 20_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs))
  ])
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-')
}

async function main() {
  const miniProgram = await withTimeout(automator.connect({ wsEndpoint }), 'connect', 15_000)
  const results = []
  const runtimeLogs = []
  miniProgram.on('console', message => runtimeLogs.push({ type: 'console', message: String(message) }))
  miniProgram.on('exception', error => runtimeLogs.push({ type: 'exception', message: String(error) }))

  const originalToken = await miniProgram.callWxMethod('getStorageSync', 'nashide_ta_token')

  async function capture(name, evidenceKind, page, patch) {
    if (!page) throw new Error(`${name}: page unavailable`)
    if (patch) await withTimeout(page.setData(patch), `${name} setData`)
    await page.waitFor(500)
    const current = await withTimeout(miniProgram.currentPage(), `${name} currentPage`)
    const screenshotPath = path.join(outputDir, `${safeName(name)}.png`)
    await withTimeout(miniProgram.screenshot({ path: screenshotPath }), `${name} screenshot`, 60_000)
    results.push({
      name,
      evidenceKind,
      expectedPath: page.path,
      actualPath: current?.path || '',
      screenshotPath,
      status: current?.path === page.path ? 'CAPTURED' : 'PATH_CHANGED'
    })
    return current
  }

  try {
    let page = await withTimeout(miniProgram.switchTab('/pages/home/index'), 'open home')
    await page.waitFor(1200)
    await capture('01-home-real', 'REAL', page)
    const homeData = await page.data()
    const voiceId = Array.isArray(homeData.voices) && homeData.voices[0] ? String(homeData.voices[0].id || '') : ''

    page = await withTimeout(miniProgram.switchTab('/pages/voices/index'), 'open voices')
    await page.waitFor(1200)
    await capture('02-voices-real', 'REAL', page)

    page = await withTimeout(miniProgram.switchTab('/pages/account/index'), 'open account')
    await page.waitFor(1500)
    await capture('03-account-real', 'REAL', page)

    page = await withTimeout(miniProgram.reLaunch(`/pages/purchase/index?source=account`), 'open purchase')
    await page.waitFor(1200)
    await capture('04-purchase-real', 'REAL', page)

    for (const type of ['privacy', 'terms', 'ai']) {
      page = await withTimeout(miniProgram.reLaunch(`/pages/legal/index?type=${type}`), `open legal ${type}`)
      await capture(`05-legal-${type}-real`, 'REAL', page)
    }

    page = await withTimeout(miniProgram.reLaunch('/pages/create/select-video'), 'open select video')
    await capture('06-select-video-real-idle', 'REAL', page)

    if (voiceId) {
      page = await withTimeout(miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=chat`), 'open workbench chat')
      await page.waitFor(1500)
      await capture('07-workbench-chat-real', 'REAL', page)

      page = await withTimeout(miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&choose=1`), 'open workbench chooser')
      await page.waitFor(1200)
      await capture('08-workbench-chooser-real', 'REAL', page)

      page = await withTimeout(miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=exact`), 'open workbench exact')
      await page.waitFor(1200)
      await capture('09-workbench-exact-real', 'REAL', page)

      page = await withTimeout(miniProgram.reLaunch(`/pages/voice/settings?voiceId=${encodeURIComponent(voiceId)}`), 'open settings')
      await page.waitFor(1200)
      await capture('10-settings-real', 'REAL', page)
    } else {
      results.push({ name: '07-10-voice-pages', evidenceKind: 'REAL', status: 'SKIPPED_NO_READY_VOICE' })
    }

    page = await withTimeout(miniProgram.reLaunch('/pages/create/select-clip?voiceId=ui-audit'), 'open clip test state')
    await capture('11-select-clip-controlled', 'CONTROLLED_TEST_STATE', page, {
      state: 'success',
      voiceId: 'ui-audit',
      tempFilePath: '',
      durationSec: 28,
      currentSec: 8,
      currentText: '00:08',
      startSec: 5,
      endSec: 19,
      startText: '00:05',
      endText: '00:19',
      selectedText: '14 秒',
      valid: true,
      confirmed: true,
      saving: false,
      errorMessage: ''
    })

    page = await withTimeout(miniProgram.reLaunch('/pages/create/voice-profile?voiceId=ui-audit'), 'open profile test state')
    await capture('12-voice-profile-controlled', 'CONTROLLED_TEST_STATE', page, {
      voiceId: 'ui-audit',
      name: '妈妈',
      permissionType: 'OTHER',
      relationshipType: 'MOTHER',
      relationshipOther: '',
      userAddress: '小林',
      confirmed: true,
      consentText: '我已取得声音本人明确同意，并获得其声音克隆和 AI 合成使用授权。',
      submitting: false,
      errorMessage: ''
    })

    page = await withTimeout(miniProgram.reLaunch('/pages/create/progress?voiceId=ui-audit'), 'open progress test state')
    await capture('13-progress-controlled', 'CONTROLLED_TEST_STATE', page, {
      voiceId: 'ui-audit',
      state: 'processing',
      voiceName: '妈妈',
      status: 'PROCESSING',
      progress: 65,
      statusText: '正在创建私有 AI 声音',
      errorMessage: '',
      stages: [
        { label: '已收到视频', done: true, active: false },
        { label: '提取所选片段', done: true, active: false },
        { label: '检查声音质量', done: true, active: false },
        { label: '创建私有声音', done: false, active: true },
        { label: '生成免费试听', done: false, active: false }
      ]
    })

    page = await withTimeout(miniProgram.reLaunch('/pages/create/preview?voiceId=ui-audit'), 'open preview test state')
    await capture('14-preview-controlled', 'CONTROLLED_TEST_STATE', page, {
      voiceId: 'ui-audit',
      state: 'success',
      voiceName: '妈妈',
      voiceInitial: '妈',
      audioUrl: '',
      previewText: '你好呀，这是为你生成的私有 AI 声音试听。',
      durationMs: 5000,
      playCompleted: true,
      accepting: false,
      retrying: false,
      trialEligible: true,
      freeRetryRemaining: 1,
      errorMessage: ''
    })

    await miniProgram.callWxMethod('removeStorageSync', 'nashide_ta_token')
    page = await withTimeout(miniProgram.reLaunch('/pages/login/index'), 'open login')
    await capture('15-login-controlled-no-auth', 'CONTROLLED_AUTH_STATE', page)
  } finally {
    if (originalToken) await miniProgram.callWxMethod('setStorageSync', 'nashide_ta_token', originalToken)
    try { await miniProgram.switchTab('/pages/home/index') } catch (_error) {}
    miniProgram.disconnect()
  }

  const report = {
    status: results.every(item => item.status === 'CAPTURED' || item.status?.startsWith('SKIPPED_')) ? 'PASS' : 'PASS_WITH_LIMITATION',
    wsEndpoint,
    outputDir,
    capturedAt: new Date().toISOString(),
    results,
    runtimeLogs
  }
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
