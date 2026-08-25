const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const outputDir = path.join(projectRoot, '.runtime', 'ui-audit-all-pages')
const contextPath = path.join(outputDir, 'context.json')
const wsEndpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9422'
const stateName = String(process.argv[2] || '')

fs.mkdirSync(outputDir, { recursive: true })

async function resolveVoiceId(miniProgram) {
  if (fs.existsSync(contextPath)) {
    const saved = JSON.parse(fs.readFileSync(contextPath, 'utf8'))
    if (saved.voiceId) return String(saved.voiceId)
  }
  const home = await miniProgram.switchTab('/pages/home/index')
  await home.waitFor(1000)
  const data = await home.data()
  const voiceId = Array.isArray(data.voices) && data.voices[0] ? String(data.voices[0].id || '') : ''
  fs.writeFileSync(contextPath, JSON.stringify({ voiceId }, null, 2))
  return voiceId
}

async function main() {
  if (!stateName) throw new Error('usage: node ui-audit-state.cjs <state>')
  const miniProgram = await automator.connect({ wsEndpoint })
  try {
    const voiceId = await resolveVoiceId(miniProgram)
    let page
    let evidenceKind = 'REAL'

    if (stateName === 'home') page = await miniProgram.switchTab('/pages/home/index')
    else if (stateName === 'voices') page = await miniProgram.switchTab('/pages/voices/index')
    else if (stateName === 'account') page = await miniProgram.switchTab('/pages/account/index')
    else if (stateName === 'purchase') page = await miniProgram.reLaunch('/pages/purchase/index?source=account')
    else if (stateName.startsWith('legal-')) page = await miniProgram.reLaunch(`/pages/legal/index?type=${stateName.slice(6)}`)
    else if (stateName === 'select-video') page = await miniProgram.reLaunch('/pages/create/select-video')
    else if (stateName === 'workbench-chat') page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=chat`)
    else if (stateName === 'workbench-chooser') page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&choose=1`)
    else if (stateName === 'workbench-exact') page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=exact`)
    else if (stateName === 'settings') page = await miniProgram.reLaunch(`/pages/voice/settings?voiceId=${encodeURIComponent(voiceId)}`)
    else if (stateName === 'select-clip') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/select-clip?voiceId=ui-audit')
      await page.setData({
        state: 'success', voiceId: 'ui-audit', tempFilePath: '', durationSec: 28,
        currentSec: 8, currentText: '00:08', startSec: 5, endSec: 19,
        startText: '00:05', endText: '00:19', selectedText: '14 秒',
        valid: true, confirmed: true, saving: false, errorMessage: ''
      })
    } else if (stateName === 'voice-profile') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/voice-profile?voiceId=ui-audit')
      await page.setData({
        voiceId: 'ui-audit', name: '妈妈', permissionType: 'OTHER', relationshipType: 'MOTHER',
        relationshipOther: '', userAddress: '小林', confirmed: true,
        consentText: '我已取得声音本人明确同意，并获得其声音克隆和 AI 合成使用授权。',
        submitting: false, errorMessage: ''
      })
    } else if (stateName === 'progress') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/progress?voiceId=ui-audit')
      await page.setData({
        voiceId: 'ui-audit', state: 'processing', voiceName: '妈妈', status: 'PROCESSING',
        progress: 65, statusText: '正在创建私有 AI 声音', errorMessage: '',
        stages: [
          { label: '已收到视频', done: true, active: false },
          { label: '提取所选片段', done: true, active: false },
          { label: '检查声音质量', done: true, active: false },
          { label: '创建私有声音', done: false, active: true },
          { label: '生成免费试听', done: false, active: false }
        ]
      })
    } else if (stateName === 'preview') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/preview?voiceId=ui-audit')
      await page.setData({
        voiceId: 'ui-audit', state: 'success', voiceName: '妈妈', voiceInitial: '妈',
        audioUrl: '', previewText: '你好呀，这是为你生成的私有 AI 声音试听。', durationMs: 5000,
        playCompleted: true, accepting: false, retrying: false, trialEligible: true,
        freeRetryRemaining: 1, errorMessage: ''
      })
    } else if (stateName === 'login') {
      evidenceKind = 'CONTROLLED_AUTH_STATE'
      await miniProgram.mockWxMethod('switchTab', {})
      page = await miniProgram.reLaunch('/pages/login/index')
      await miniProgram.restoreWxMethod('switchTab')
      await page.setData({ agreed: false, loading: false, success: false, errorMessage: '' })
    } else {
      throw new Error(`unknown state: ${stateName}`)
    }

    if (!page) throw new Error(`page unavailable for ${stateName}`)
    await page.waitFor(1200)
    const current = await miniProgram.currentPage()
    process.stdout.write(`${JSON.stringify({ stateName, evidenceKind, voiceAvailable: Boolean(voiceId), expectedPath: page.path, actualPath: current?.path || '' })}\n`)
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
