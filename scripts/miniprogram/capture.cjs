const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

async function main() {
  const root = path.resolve(__dirname, '..', '..')
  const target = path.join(root, '.runtime', 'ui-evidence', 'main-flow', 'final-workbench.png')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const miniProgram = await automator.connect({
    wsEndpoint: process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9421'
  })
  try {
    const voiceId = process.env.WECHAT_CAPTURE_VOICE_ID
    const current = voiceId
      ? await miniProgram.reLaunch(`/pages/voice/workbench?voiceId=${encodeURIComponent(voiceId)}&mode=exact`)
      : await miniProgram.currentPage()
    if (current) await current.waitFor(1500)
    if (!current || current.path !== 'pages/voice/workbench') {
      throw new Error(`expected workbench, current=${current && current.path}`)
    }
    await miniProgram.screenshot({ path: target })
    process.stdout.write(`${target}\n`)
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
