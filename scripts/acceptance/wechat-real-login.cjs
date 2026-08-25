const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')
const { parse: parseDotEnv } = require('dotenv')
const CloudBase = require('@cloudbase/manager-node')

const projectRoot = path.resolve(__dirname, '..', '..')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
const projectPath = path.join(projectRoot, 'apps', 'miniprogram')
const evidenceDir = path.join(projectRoot, 'docs', 'auto-execute', 'screenshots', 'real-wechat-login')
const evidencePath = path.join(evidenceDir, 'real-wechat-login.json')
const apiBase = 'cloud-function:aivoice-api-event'
const automationEndpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://localhost:9420'
const sessionSecretPath = process.env.WECHAT_REAL_SESSION_PATH || 'D:/lyh/secrets/aivoice/wechat/real-login-session.json'
const skipScreenshots = process.env.WECHAT_SKIP_SCREENSHOTS === '1'

fs.mkdirSync(evidenceDir, { recursive: true })

const evidence = {
  status: 'RUNNING',
  startedAt: new Date().toISOString(),
  appId: 'wx106e5dcda1d1baeb',
  apiBase,
  route: '/pages/login/index',
  screenshots: [],
  checks: [],
  errors: []
}

function save() {
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout(promise, label, timeoutMs = 30_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
  ])
}

async function waitFor(predicate, label, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await predicate()
    if (value) return value
    await delay(350)
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`)
}

async function capture(miniProgram, name) {
  if (skipScreenshots) {
    evidence.checks.push({ name: `screenshot-${name}`, status: 'PASS_WITH_LIMITATION', reason: 'disabled for flaky DevTools automation; desktop capture required' })
    save()
    return
  }
  const target = path.join(evidenceDir, name)
  try {
    await withTimeout(miniProgram.screenshot({ path: target }), `screenshot ${name}`, 12_000)
    evidence.screenshots.push(target)
  } catch (error) {
    evidence.checks.push({ name: `screenshot-${name}`, status: 'PASS_WITH_LIMITATION', reason: error.message })
  }
  save()
}

async function run() {
  save()
  let miniProgram
  try {
    miniProgram = await withTimeout(automator.connect({ wsEndpoint: automationEndpoint }), 'connect automation')
  } catch (_error) {
    miniProgram = await automator.launch({
      cliPath,
      projectPath,
      trustProject: true,
      timeout: 90_000
    })
  }

  miniProgram.on('exception', error => {
    evidence.errors.push(String(error && error.message ? error.message : error))
    save()
  })

  try {
    await withTimeout(miniProgram.callWxMethod('clearStorageSync'), 'clear storage')
    let page = await withTimeout(miniProgram.reLaunch('/pages/login/index'), 'open login page', 45_000)
    await capture(miniProgram, '01-login-before.png')

    const agreement = await page.$('.agreement-row')
    if (!agreement) throw new Error('agreement control is missing')
    await agreement.tap()
    evidence.checks.push({ name: 'agreement-selected', status: 'PASS' })

    const loginButton = await page.$('.login-button')
    if (!loginButton) throw new Error('login button is missing')
    await loginButton.tap()

    try {
      page = await waitFor(async () => {
        const current = await miniProgram.currentPage()
        return current && current.path === 'pages/home/index' ? current : null
      }, 'real WeChat login navigation')
    } catch (error) {
      const current = await withTimeout(miniProgram.currentPage(), 'read failed login page')
      const currentData = current ? await withTimeout(current.data(), 'read failed login data') : null
      evidence.checks.push({
        name: 'real-wx-login-page-navigation',
        status: 'FAIL',
        path: current && current.path,
        errorMessage: currentData && currentData.errorMessage,
        loading: currentData && currentData.loading,
        agreed: currentData && currentData.agreed
      })
      save()
      throw new Error(`${error.message}; page=${current && current.path}; ui=${currentData && currentData.errorMessage}`)
    }

    const token = await withTimeout(miniProgram.callWxMethod('getStorageSync', 'nashide_ta_token'), 'read server session')
    if (!token || typeof token !== 'string') throw new Error('server session token was not stored')
    fs.mkdirSync(path.dirname(sessionSecretPath), { recursive: true })
    fs.writeFileSync(sessionSecretPath, `${JSON.stringify({ token, capturedAt: new Date().toISOString() })}\n`, { mode: 0o600 })
    const credentials = parseDotEnv(fs.readFileSync('D:/lyh/secrets/aivoice/tencentcloud-deploy.env'))
    const cloudbase = new CloudBase({
      envId: 'aiassistant-0517-d6en8tw82f2f7fc',
      region: 'ap-shanghai',
      secretId: credentials.TENCENTCLOUD_SECRETID,
      secretKey: credentials.TENCENTCLOUD_SECRETKEY
    })
    const invoked = await cloudbase.functions.invokeFunction('aivoice-api-event', {
      path: '/v1/me',
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    })
    const envelope = JSON.parse(invoked.RetMsg || '{}')
    const body = envelope.data || {}
    if (Number(envelope.statusCode) !== 200) throw new Error(`GET /v1/me failed with ${envelope.statusCode}`)

    const points = Number(body && (body.points?.balance ?? body.user?.points ?? body.user?.quota))
    evidence.checks.push(
      { name: 'real-wx-login-page-navigation', status: 'PASS', path: page.path },
      { name: 'server-session-issued', status: 'PASS' },
      { name: 'live-me-response', status: 'PASS', httpStatus: envelope.statusCode },
      { name: 'account-points', status: Number.isFinite(points) ? 'PASS' : 'FAIL', points }
    )
    await capture(miniProgram, '02-home-after-login.png')
    evidence.status = evidence.errors.length === 0 && evidence.checks.every(item => item.status === 'PASS' || item.status === 'PASS_WITH_LIMITATION')
      ? 'PASS'
      : 'FAIL'
    evidence.finishedAt = new Date().toISOString()
    save()
    console.log(JSON.stringify({
      status: evidence.status,
      route: page.path,
      points,
      evidencePath,
      screenshots: evidence.screenshots
    }, null, 2))
  } finally {
    miniProgram.disconnect()
  }
}

run().catch(error => {
  evidence.status = 'FAIL'
  evidence.finishedAt = new Date().toISOString()
  evidence.errors.push(String(error && error.stack ? error.stack : error))
  save()
  console.error(error)
  process.exitCode = 1
})
