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
    else if (stateName === 'voices-reference') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.switchTab('/pages/voices/index')
      await page.waitFor(900)
      await page.setData({
        state: 'success', errorMessage: '', activeFilter: 'ALL',
        voices: [
          {
            id: 'ui-ready', name: '小雨', displayName: '小雨', status: 'READY', group: 'READY',
            displayAvatar: '/assets/avatars/age-06-08-female.webp', avatarSize: 154,
            statusLabel: '可使用', statusTone: 'ready', primaryAction: '继续对话',
            isReady: true, isDisabled: false, showProgress: false, progress: 0,
            progressStage: '', metaLabel: '', metaText: '最近使用 2026-08-21'
          },
          {
            id: 'ui-processing', name: '奶奶', displayName: '奶奶', status: 'PROCESSING', group: 'PROCESSING',
            displayAvatar: '/assets/avatars/age-65-79-female.webp', avatarSize: 144,
            statusLabel: '正在创建', statusTone: 'processing', primaryAction: '查看进度',
            isReady: false, isDisabled: false, showProgress: true, progress: 68,
            progressStage: '正在创建声音模型…', metaLabel: '', metaText: ''
          },
          {
            id: 'ui-draft', name: '爷爷', displayName: '爷爷', status: 'DRAFT', group: 'DRAFT',
            displayAvatar: '/assets/avatars/age-65-79-male.webp', avatarSize: 144,
            statusLabel: '创建未完成', statusTone: 'draft', primaryAction: '继续创建',
            isReady: false, isDisabled: false, showProgress: false, progress: 0,
            progressStage: '', metaLabel: '', metaText: '今天 16:20'
          }
        ]
      })
    }
    else if (stateName === 'voices-error') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.switchTab('/pages/voices/index')
      await page.waitFor(800)
      await page.setData({
        state: 'error',
        errorMessage: 'cloud.callFunction:fail Error: Failed to fetch (system error)',
        voices: []
      })
    }
    else if (stateName === 'account') page = await miniProgram.switchTab('/pages/account/index')
    else if (stateName === 'purchase') page = await miniProgram.reLaunch('/pages/purchase/index?source=account')
    else if (stateName === 'purchase-controlled') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      await miniProgram.mockWxMethod('reLaunch', {})
      page = await miniProgram.reLaunch('/pages/purchase/index?source=account')
      await page.waitFor(500)
      await miniProgram.restoreWxMethod('reLaunch')
      await page.setData({
        state: 'success', errorMessage: '', voiceId: '', purchaseScopeId: 'account',
        voiceName: '账户积分', voiceInitial: '分', points: { availablePoints: 51 },
        pointsText: '当前剩余 51 积分', priceText: '¥9.9',
        purchaseOption: { productCode: 'POINTS_50', points: 50, quota: 50, amountFen: 990, autoRenew: false },
        requestedProductCode: '', paying: false, pending: false, purchaseMessage: '', orderId: ''
      })
    }
    else if (stateName.startsWith('legal-')) page = await miniProgram.reLaunch(`/pages/legal/index?type=${stateName.slice(6)}`)
    else if (stateName === 'select-video') page = await miniProgram.reLaunch('/pages/create/select-video')
    else if (stateName === 'workbench-chat-empty') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=chat`)
      await page.waitFor(1200)
      await page.setData({
        state: 'success', mode: 'chat', showModeChooser: false, voiceName: '小雨', voiceInitial: '小',
        voiceAvatar: '/assets/avatars/age-06-08-female.webp', pointsText: '剩余 49 积分', sending: false,
        chatMessages: [], chatText: '', scrollTarget: '', errorMessage: ''
      })
    }
    else if (stateName === 'workbench-chat') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=chat`)
      await page.waitFor(1200)
      await page.setData({
        state: 'success', mode: 'chat', showModeChooser: false, voiceName: '小雨', voiceInitial: '雨',
        voiceAvatar: '/assets/avatars/age-06-08-female.webp', pointsText: '剩余 0 积分', sending: false,
        chatMessages: [
          { id: 'ui-user', isUser: true, isAssistant: false, text: '你最近在学校开心吗？', status: 'READY', mode: 'CHAT', showAudio: false },
          { id: 'ui-assistant', isUser: false, isAssistant: true, text: '开心呀！今天老师夸我画画得很好，还给了我一颗小星星。', status: 'READY', mode: 'CHAT', showAudio: false, audioUrl: '', durationMs: 0, tag: 'AI回复', initial: '雨', feedbackVerdict: '' }
        ],
        scrollTarget: '', errorMessage: ''
      })
    }
    else if (stateName === 'workbench-chooser') page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&choose=1`)
    else if (stateName === 'workbench-exact') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=exact`)
      await page.waitFor(1200)
      await page.setData({
        state: 'success', mode: 'exact', showModeChooser: false, voiceName: '小雨', voiceInitial: '雨',
        voiceAvatar: '/assets/avatars/age-06-08-female.webp', pointsText: '剩余 0 积分', sending: false,
        exactText: '祝妈妈生日快乐，永远年轻漂亮！', exactCount: 14,
        exactResults: [{ id: 'ui-exact', text: '祝妈妈生日快乐，永远年轻漂亮！', status: 'READY', showAudio: false, audioUrl: '', durationMs: 0 }],
        errorMessage: ''
      })
    }
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
        voiceId: 'ui-audit',
        name: '妈妈',
        ageYears: '70',
        gender: 'FEMALE',
        permissionType: 'OTHER',
        relationshipType: 'MOTHER',
        relationshipOptions: [
          { key: 'MOTHER', title: '妈妈' },
          { key: 'FATHER', title: '爸爸' },
          { key: 'GRANDMOTHER', title: '奶奶' },
          { key: 'GRANDFATHER', title: '爷爷' },
          { key: 'PARTNER', title: '伴侣' },
          { key: 'FRIEND', title: '朋友' },
          { key: 'OTHER', title: '其他' }
        ],
        relationshipOther: '',
        userAddress: '小林',
        confirmed: true,
        consentText: '我已取得声音本人明确同意，并获得其声音克隆和 AI 合成使用授权。',
        submitting: false, errorMessage: ''
      })
    } else if (stateName === 'personality-guide') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/personality-guide?voiceId=ui-audit')
      await page.waitFor(500)
      await page.setData({
        voiceId: 'ui-audit', state: 'ready', saving: false,
        hasRecommendations: true,
        selectedTagIds: ['HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'],
        traitOptions: [
          { id: 'HARD_MOUTH_SOFT_HEART', label: '嘴硬心软', selected: true },
          { id: 'LIKES_CLOSENESS', label: '喜欢亲近', selected: true },
          { id: 'QUICK_TEMPER', label: '脾气来得快', selected: false },
          { id: 'DIRECT', label: '表达直接', selected: false },
          { id: 'VALUES_BOUNDARY', label: '重视边界', selected: false },
          { id: 'WARM_PATIENT', label: '温柔耐心', selected: false },
          { id: 'PLAYFUL', label: '爱开玩笑', selected: false },
          { id: 'RECOVERS_FAST', label: '情绪退得快', selected: true },
          { id: 'SHOWS_CARE_BY_ACTION', label: '用行动关心', selected: false },
          { id: 'VALUES_RESPECT', label: '在意被尊重', selected: false },
          { id: 'DISLIKES_LECTURING', label: '不爱讲大道理', selected: false },
          { id: 'PRACTICAL', label: '务实看现实', selected: false }
        ],
        description: '', descriptionCount: 0, maxDescriptionLength: 80, errorMessage: ''
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
    } else if (stateName === 'preview' || stateName === 'preview-before-play') {
      evidenceKind = 'CONTROLLED_TEST_STATE'
      page = await miniProgram.reLaunch('/pages/create/preview?voiceId=ui-audit')
      await page.setData({
        voiceId: 'ui-audit', state: 'success', voiceName: '小雨', voiceInitial: '雨', avatarUrl: '/assets/avatars/age-06-08-female.webp',
        audioUrl: '', previewText: '妈妈，今天过得怎么样？', durationMs: 3000,
        playCompleted: stateName === 'preview', previewPlaying: false, playbackPrompted: false,
        accepting: false, retrying: false, trialEligible: true,
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
    const screenshotPath = String(process.env.UI_AUDIT_SCREENSHOT || '').trim()
    if (screenshotPath) await miniProgram.screenshot({ path: path.resolve(screenshotPath) })
    process.stdout.write(`${JSON.stringify({ stateName, evidenceKind, voiceAvailable: Boolean(voiceId), expectedPath: page.path, actualPath: current?.path || '' })}\n`)
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
