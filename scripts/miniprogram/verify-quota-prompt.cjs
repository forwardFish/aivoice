const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const root = path.resolve(__dirname, '..', '..')
const output = path.join(root, '.runtime', 'ui-evidence', 'main-flow', 'quota-prompt.json')
const voiceId = process.env.WECHAT_QUOTA_VOICE_ID
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9421'
const draft = '下一次主动生成才应该显示购买框。'

if (!voiceId) throw new Error('WECHAT_QUOTA_VOICE_ID is required')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = (promise, label, ms = 20_000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
])

async function requireElement(page, selector) {
  const element = await timeout(page.$(selector), `find ${selector}`)
  if (!element) throw new Error(`missing ${selector}`)
  return element
}

async function main() {
  const miniProgram = await timeout(automator.connect({ wsEndpoint: endpoint }), 'connect')
  const evidence = { status: 'RUNNING', voiceId, draft, startedAt: new Date().toISOString() }
  try {
    await timeout(
      miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=exact`),
      'open workbench',
      30_000
    )
    await delay(1500)
    const page = await timeout(miniProgram.currentPage(), 'read workbench page')
    if (!page) throw new Error('workbench did not open')
    if (page.path !== 'pages/voice/workbench') throw new Error(`expected workbench, current=${page.path}`)
    let data = await page.data()
    if (data.state !== 'success' || Number(data.quota?.availableQuota) !== 0) {
      throw new Error(`expected zero-quota workbench: ${JSON.stringify(data)}`)
    }
    if (!Array.isArray(data.exactResults) || data.exactResults.length < 1 || data.purchaseVisible) {
      throw new Error(`last successful result was not preserved normally: ${JSON.stringify(data)}`)
    }

    const exactMode = await page.$('.exact-mode')
    if (exactMode) await exactMode.tap()
    else await page.callMethod('switchMode', { currentTarget: { dataset: { mode: 'exact' } } })
    await timeout((await requireElement(page, '.exact-textarea')).input(draft), 'input draft')
    await delay(300)
    data = await page.data()
    if (data.exactText !== draft) {
      await timeout(page.callMethod('onExactInput', { detail: { value: draft } }), 'sync exact draft')
    }
    data = await page.data()
    if (data.exactText !== draft) throw new Error(`draft input did not bind: ${JSON.stringify(data)}`)
    await timeout(page.callMethod('generateExact'), 'request generation', 30_000)

    const started = Date.now()
    while (Date.now() - started < 20_000) {
      data = await page.data()
      if (data.purchaseVisible && !data.sending) break
      await delay(300)
    }
    const option = data.purchaseOption || {}
    if (!data.purchaseVisible || data.exactText !== draft) {
      throw new Error(`purchase modal or preserved draft missing: ${JSON.stringify(data)}`)
    }
    if (option.productCode !== 'VOICE_QUOTA_10' || option.amountFen !== 990 || option.quota !== 10 || option.autoRenew !== false) {
      throw new Error(`unexpected purchase option: ${JSON.stringify(option)}`)
    }
    Object.assign(evidence, {
      status: 'PASS',
      finishedAt: new Date().toISOString(),
      assertions: {
        priorResultVisibleAtZeroQuota: true,
        noAutomaticPurchasePopupAtZeroQuota: true,
        nextActiveGenerationShowsPurchase: true,
        draftPreserved: true,
        fixedProduct: option
      }
    })
  } catch (error) {
    evidence.status = 'FAIL'
    evidence.finishedAt = new Date().toISOString()
    evidence.error = error?.stack || String(error)
    throw error
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2))
    miniProgram.disconnect()
  }
}

main().then(() => console.log(output)).catch(error => {
  console.error(error)
  process.exitCode = 1
})
