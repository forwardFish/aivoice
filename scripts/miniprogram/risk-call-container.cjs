const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const evidenceDir = path.join(projectRoot, '.runtime', 'risk-first')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9420'

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
function timeout(promise, label, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))])
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const logs = []
  const result = { status: 'RUNNING', startedAt: new Date().toISOString(), logs }
  let miniProgram
  try {
    miniProgram = await timeout(automator.connect({ wsEndpoint: endpoint }), 'automation connect', 10_000)
  } catch (_error) {
    miniProgram = await timeout(automator.launch({
      cliPath,
      projectPath: path.join(projectRoot, 'apps', 'miniprogram'),
      trustProject: true,
      timeout: 60_000
    }), 'DevTools launch', 90_000)
  }
  process.stderr.write(`Connected to automation at ${endpoint}\n`)
  miniProgram.on('console', (...args) => logs.push({ type: 'console', message: args.map(String).join(' ') }))
  miniProgram.on('exception', (...args) => logs.push({ type: 'exception', message: args.map(String).join(' ') }))
  try {
    await timeout(miniProgram.callWxMethod('clearStorageSync'), 'clear storage', 10_000)
    process.stderr.write('Opening login page\n')
    let page = await timeout(miniProgram.reLaunch('/pages/login/index'), 'open login page', 20_000)
    await timeout(page.waitFor(500), 'login page settle', 5_000)
    const agreement = await timeout(page.$('.agreement-row'), 'find agreement', 10_000)
    const login = await timeout(page.$('.login-button'), 'find login', 10_000)
    if (!agreement || !login) throw new Error('login controls are missing')
    await timeout(agreement.tap(), 'agree terms', 10_000)
    const requestStartedAt = Date.now()
    process.stderr.write('Submitting real login through callContainer\n')
    await timeout(login.tap(), 'tap login', 10_000)
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      page = await timeout(miniProgram.currentPage(), 'read current page', 5_000)
      const data = await timeout(page.data(), 'read current page data', 5_000)
      if (page.path === 'pages/home/index') {
        Object.assign(result, {
          status: 'PASS',
          elapsedMs: Date.now() - requestStartedAt,
          finalPage: page.path,
          finalState: data.state,
        })
        break
      }
      if (!data.loading && data.errorMessage) {
        Object.assign(result, {
          status: 'FAIL',
          elapsedMs: Date.now() - requestStartedAt,
          finalPage: page.path,
          errorMessage: data.errorMessage,
        })
        break
      }
      await delay(300)
    }
    if (result.status === 'RUNNING') {
      page = await timeout(miniProgram.currentPage(), 'read timeout page', 5_000)
      Object.assign(result, { status: 'FAIL', finalPage: page.path, finalData: await timeout(page.data(), 'read timeout data', 5_000), errorMessage: 'login did not finish' })
    }
    result.finishedAt = new Date().toISOString()
    fs.writeFileSync(path.join(evidenceDir, 'call-container-login.json'), `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.status !== 'PASS') process.exitCode = 1
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
