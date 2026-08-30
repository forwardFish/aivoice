const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
const projectPath = path.join(projectRoot, 'apps', 'miniprogram')
const evidenceDir = path.join(projectRoot, '.omx', 'artifacts', 'visual-ralph', 'personality-guide')
const screenshotPath = path.join(evidenceDir, 'actual-final.png')
const evidencePath = path.join(evidenceDir, process.env.AIVOICE_PERSONALITY_UI_MODE === 'under-two' ? 'ui-evidence-under-two.json' : 'ui-evidence.json')

function withTimeout(promise, label, ms = 20_000) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms) })
  ])
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const consoleErrors = []
  let miniProgram
  let launchMode = 'connect'
  try {
    process.stdout.write('connect\n')
    miniProgram = await withTimeout(automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9422' }), 'connect')
  } catch (_error) {
    launchMode = 'launch'
    process.stdout.write('launch\n')
    miniProgram = await withTimeout(automator.launch({ cliPath, projectPath, port: 27285, trustProject: true, timeout: 90_000 }), 'launch', 95_000)
  }
  miniProgram.on('exception', (...args) => consoleErrors.push(args.map(String).join(' ')))
  try {
    const underTwo = process.env.AIVOICE_PERSONALITY_UI_MODE === 'under-two'
    process.stdout.write('storage\n')
    await withTimeout(miniProgram.callWxMethod('setStorageSync', 'nashide_ta_token', 'ui-visual-audit-token'), 'storage')
    const storedToken = await withTimeout(miniProgram.callWxMethod('getStorageSync', 'nashide_ta_token'), 'read-storage')
    process.stdout.write(`stored-token=${String(storedToken)}\n`)
    await withTimeout(miniProgram.mockWxMethod('request', {}), 'mock-request')
    process.stdout.write('relaunch\n')
    const page = await withTimeout(miniProgram.reLaunch('/pages/create/personality-guide?voiceId=ui-audit'), 'relaunch')
    await page.waitFor(1200)
    process.stdout.write('set-data\n')
    await withTimeout(page.setData({
      voiceId: 'ui-audit', state: 'ready', saving: false,
      hasRecommendations: !underTwo,
      selectedTagIds: underTwo ? [] : ['HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'],
      traitOptions: underTwo ? [] : [
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
    }), 'set-data')
    process.stdout.write(underTwo ? 'verify-empty-state\n' : 'tap\n')
    let afterTap = await withTimeout(page.data(), 'read-data')
    if (!underTwo) {
      const traitElements = await withTimeout(page.$$('.trait-chip'), 'query-traits')
      const unselected = traitElements[2]
      if (!unselected) throw new Error(`third personality trait is not rendered; count=${traitElements.length}`)
      await withTimeout(unselected.tap(), 'tap-trait')
      await page.waitFor(200)
      afterTap = await withTimeout(page.data(), 'read-data-after-tap')
      if (!afterTap.selectedTagIds.includes('QUICK_TEMPER')) throw new Error('trait tap did not update selectedTagIds')
    }
    const saveButton = await withTimeout(page.$('.action-save'), 'query-save')
    const skipButton = await withTimeout(page.$('.action-skip'), 'query-skip')
    if (!saveButton || !skipButton) throw new Error('save or skip action is not rendered')
    if (process.env.AIVOICE_DIRECT_SIMULATOR_SCREENSHOT === '1') {
      process.stdout.write('screenshot\n')
      await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 'screenshot', 45_000)
    }
    const evidence = {
      checkedAt: new Date().toISOString(), launchMode, route: page.path,
      mode: underTwo ? 'under-two' : 'recommended-tags',
      interaction: { tappedTrait: underTwo ? null : 'QUICK_TEMPER', selectedCount: afterTap.selectedTagIds.length, saveVisible: true, skipVisible: true },
      consoleErrors,
      screenshotPath: process.env.AIVOICE_DIRECT_SIMULATOR_SCREENSHOT === '1' ? screenshotPath : null,
      screenshotNote: process.env.AIVOICE_DIRECT_SIMULATOR_SCREENSHOT === '1'
        ? 'captured by miniprogram-automator'
        : 'direct simulator capture disabled because this DevTools version times out; capture the DevTools window separately'
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
    await miniProgram.restoreWxMethod('request')
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
