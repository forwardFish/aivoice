const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

function withTimeout(promise, label, timeoutMs = 15_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs))
  ])
}

async function main() {
  const endpoint = process.env.WECHAT_AUTOMATION_WS || ''
  const evidenceDir = path.resolve(process.cwd(), '.runtime', 'ui-evidence')
  fs.mkdirSync(evidenceDir, { recursive: true })
  const logs = []
  process.stderr.write(`Connecting to WeChat automation${endpoint ? ` at ${endpoint}` : ''}...\n`)
  const miniProgram = await withTimeout(endpoint
    ? automator.connect({ wsEndpoint: endpoint })
    : automator.launch({
      cliPath: 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
      projectPath: path.resolve(process.cwd(), 'apps/miniprogram'),
      port: Number(process.env.WECHAT_AUTOMATION_PORT || 9421),
      trustProject: true,
      timeout: 60_000
    }), 'automation connection', 60_000)
  miniProgram.on('console', (message) => logs.push({ type: 'console', message: String(message) }))
  miniProgram.on('exception', (error) => logs.push({ type: 'exception', message: String(error) }))
  try {
    process.stderr.write('Opening login page...\n')
    const page = await withTimeout(miniProgram.reLaunch('/pages/login/index'), 'login page reLaunch')
    if (!page) throw new Error('login page did not open')
    await page.waitFor(1200)
    const current = await withTimeout(miniProgram.currentPage(), 'currentPage')
    const screenshotPath = path.join(evidenceDir, 'smoke-login.png')
    process.stderr.write('Capturing login evidence...\n')
    await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 'screenshot')
    const evidence = {
      status: current?.path === 'pages/login/index' ? 'PASS' : 'FAIL',
      path: current?.path || '',
      query: current?.query || {},
      data: current ? await withTimeout(current.data(), 'page data') : null,
      logs,
      screenshotPath,
      capturedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(evidenceDir, 'smoke-login.json'), JSON.stringify(evidence, null, 2))
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
    if (evidence.status !== 'PASS') process.exitCode = 1
  } finally {
    miniProgram.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
