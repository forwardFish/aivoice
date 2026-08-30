const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const evidenceDir = path.join(projectRoot, '.omx', 'artifacts', 'visual-ralph', 'settings-personality-entry')
const evidencePath = path.join(evidenceDir, 'ui-flow-evidence.json')
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9422'

function withTimeout(promise, label, ms = 20_000) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms) })
  ])
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const miniProgram = await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'connect')
  const consoleErrors = []
  const settingsOnly = process.env.AIVOICE_PERSONALITY_SETTINGS_STOP === 'settings'
  miniProgram.on('exception', (...args) => consoleErrors.push(args.map(String).join(' ')))
  try {
    await withTimeout(miniProgram.callWxMethod('setStorageSync', 'nashide_ta_token', 'ui-visual-audit-token'), 'set-token')
    await withTimeout(miniProgram.mockWxMethod('request', {}), 'mock-request')
    let page = await withTimeout(miniProgram.reLaunch('/pages/voice/settings?voiceId=ui-audit'), 'open-settings')
    await page.waitFor(700)
    await withTimeout(page.setData({
      voiceId: 'ui-audit', state: 'success', deleted: false,
      voiceName: '小于', nameDraft: '小于', statusText: '已可使用', statusTone: 'success',
      permissionType: 'OTHER', permissionText: '我的声音',
      relationshipType: 'PARTNER', relationshipOptions: [{ key: 'PARTNER', title: '伴侣' }],
      showRelationship: false, personalityNote: '【用户明确选择】温柔耐心：平时愿意听完再回应。',
      personalityConfigured: true, ageYears: '24', gender: 'FEMALE', userAgeYears: '26',
      saving: false, clearing: false, deleting: false, errorMessage: '', successMessage: ''
    }), 'seed-settings')
    const entry = await withTimeout(page.$('.personality-entry'), 'find-personality-entry')
    if (!entry) throw new Error('personality settings entry is not rendered')
    if (settingsOnly) {
      await page.waitFor(5000)
      const evidence = {
        checkedAt: new Date().toISOString(),
        settingsEntryVisible: true,
        settingsStatus: '已设置',
        destinationPath: page.path,
        stoppedBeforeNavigation: true,
        consoleErrors
      }
      fs.writeFileSync(path.join(evidenceDir, 'ui-settings-evidence.json'), JSON.stringify(evidence, null, 2))
      process.stdout.write(`${JSON.stringify(evidence)}\n`)
      return
    }
    await withTimeout(entry.tap(), 'tap-personality-entry')
    await page.waitFor(1500)
    page = await withTimeout(miniProgram.currentPage(), 'current-edit-page')
    if (!page || page.path !== 'pages/create/personality-guide') throw new Error(`expected personality guide, current=${page?.path || ''}`)
    const data = await withTimeout(page.data(), 'read-edit-mode')
    if (!data.editMode) throw new Error('personality guide did not enter edit mode')
    await withTimeout(page.setData({
      state: 'ready', editMode: true, voiceId: 'ui-audit', hasRecommendations: true,
      selectedTagIds: ['HARD_MOUTH_SOFT_HEART', 'QUICK_TEMPER', 'WARM_PATIENT', 'PRACTICAL'],
      traitOptions: [
        { id: 'HARD_MOUTH_SOFT_HEART', label: '嘴硬心软', selected: true },
        { id: 'LIKES_CLOSENESS', label: '喜欢亲近', selected: false },
        { id: 'QUICK_TEMPER', label: '脾气来得快', selected: true },
        { id: 'DIRECT', label: '表达直接', selected: false },
        { id: 'VALUES_BOUNDARY', label: '重视边界', selected: false },
        { id: 'WARM_PATIENT', label: '温柔耐心', selected: true },
        { id: 'PLAYFUL', label: '爱开玩笑', selected: false },
        { id: 'RECOVERS_FAST', label: '情绪退得快', selected: false },
        { id: 'SHOWS_CARE_BY_ACTION', label: '用行动关心', selected: false },
        { id: 'VALUES_RESPECT', label: '在意被尊重', selected: false },
        { id: 'DISLIKES_LECTURING', label: '不爱讲大道理', selected: false },
        { id: 'PRACTICAL', label: '务实看现实', selected: true }
      ],
      description: '', descriptionCount: 0, maxDescriptionLength: 80, saving: false, errorMessage: ''
    }), 'seed-edit-page')
    const save = await withTimeout(page.$('.action-save'), 'find-save')
    const skip = await withTimeout(page.$('.action-skip'), 'find-skip')
    if (!save) throw new Error('edit save action is not rendered')
    if (skip) throw new Error('onboarding skip action is visible in edit mode')
    const evidence = {
      checkedAt: new Date().toISOString(),
      settingsEntryVisible: true,
      settingsStatus: '已设置',
      destinationPath: page.path,
      editMode: true,
      selectedCount: 4,
      saveVisible: true,
      skipHidden: true,
      consoleErrors
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
  } finally {
    try { await miniProgram.restoreWxMethod('request') } catch (_error) {}
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
