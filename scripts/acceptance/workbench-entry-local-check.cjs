const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://localhost:9421'
const outputDir = path.resolve(process.cwd(), 'work', 'acceptance', 'workbench-entry-local')

function withTimeout(promise, label, timeoutMs = 15_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs)),
  ])
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const miniProgram = await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'connect')
  try {
    await withTimeout(miniProgram.callWxMethod('setStorageSync', 'nashide_ta_token', 'local-layout-check'), 'set token')
    await withTimeout(miniProgram.mockWxMethod('getDeviceInfo', { platform: 'devtools' }), 'mock device')
    await withTimeout(miniProgram.mockWxMethod('request', function(options) {
      const url = String(options && options.url || '')
      let data = {}
      if (/\/voices\/local-layout-check(?:\?|$)/.test(url) && !/\/conversation/.test(url)) {
        data = { id: 'local-layout-check', name: '本人', status: 'READY', permissionType: 'SELF' }
      } else if (/\/conversation/.test(url)) {
        data = { messages: [] }
      } else if (/\/points/.test(url)) {
        data = { availablePoints: 50 }
      } else if (/\/products/.test(url)) {
        data = { products: [] }
      }
      options && options.success && options.success({ statusCode: 200, data })
      return Promise.resolve({ statusCode: 200, data })
    }), 'mock request')
    await withTimeout(miniProgram.callWxMethod('reLaunch', {
      url: '/pages/voice/workbench?voiceId=local-layout-check&mode=chat',
    }), 'open workbench')
    await new Promise(resolve => setTimeout(resolve, 40))
    let page
    page = await withTimeout(miniProgram.currentPage(), 'current page')
    if (!page || page.path !== 'pages/voice/workbench') throw new Error(`unexpected route: ${page && page.path}`)

    const seedData = {
      state: 'success',
      errorMessage: '',
      voiceId: 'local-layout-check',
      voiceName: '本',
      voiceInitial: '声',
      pointsText: '剩余 50 积分',
      mode: 'chat',
      chatMessages: [{
        id: 'local-message',
        role: 'ASSISTANT',
        mode: 'CHAT',
        status: 'READY',
        text: '本地入口布局检查',
        isAssistant: true,
        isUser: false,
        showAudio: false,
        timeText: '刚刚',
      }],
      bottomAnchorId: 'chat-bottom-local-check',
      chatViewportReady: false,
      entryCoverVisible: true,
      messagesScrollStyle: '',
      messagesContentStyle: '',
      chatScrollTop: 0,
      scrollTarget: '',
    }
    const seededRoute = await withTimeout(miniProgram.evaluate(function(data) {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      current.setData(data)
      return current.route
    }, seedData), 'seed page state')
    if (seededRoute !== 'pages/voice/workbench') throw new Error(`seeded unexpected route: ${seededRoute}`)

    const readLayoutState = () => withTimeout(miniProgram.evaluate(function() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      return {
        route: current.route,
        entryCoverVisible: Boolean(current.data.entryCoverVisible),
        chatViewportReady: Boolean(current.data.chatViewportReady),
        messagesScrollStyle: current.data.messagesScrollStyle,
        chatScrollTop: current.data.chatScrollTop,
      }
    }), 'read layout state')

    const before = await readLayoutState()
    await withTimeout(miniProgram.evaluate(function(anchorId) {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      current.scheduleChatViewportSync()
      current.scheduleChatBottomScroll(anchorId)
      return true
    }, 'chat-bottom-local-check'), 'schedule layout')
    await page.waitFor(45)
    const during = await readLayoutState()
    await page.waitFor(140)
    const after = await readLayoutState()
    const screenshotPath = path.join(outputDir, 'workbench-entry-final.png')
    let screenshotStatus = 'CAPTURED'
    try {
      await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 'screenshot', 5_000)
    } catch (_error) {
      screenshotStatus = 'UNAVAILABLE'
    }

    const result = {
      status: before.entryCoverVisible
        && during.entryCoverVisible
        && !after.entryCoverVisible
        && after.chatViewportReady
        && Number(after.chatScrollTop) > 0
        ? 'PASS'
        : 'FAIL',
      route: page.path,
      before,
      during,
      after,
      screenshotStatus,
      screenshotPath,
    }
    fs.writeFileSync(path.join(outputDir, 'entry-check.json'), `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.status !== 'PASS') process.exitCode = 1
  } finally {
    await miniProgram.restoreWxMethod('request').catch(() => undefined)
    await miniProgram.restoreWxMethod('getDeviceInfo').catch(() => undefined)
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
