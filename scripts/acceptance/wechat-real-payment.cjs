const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const apiBase = 'https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com'
const sessionPath = process.env.WECHAT_REAL_SESSION_PATH || 'D:/lyh/secrets/aivoice/wechat/real-login-session.json'
const paymentStatePath = process.env.WECHAT_REAL_PAYMENT_STATE_PATH || 'D:/lyh/secrets/aivoice/wechat/real-payment-state.json'
const projectRoot = path.resolve(__dirname, '..', '..')
const evidencePath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'wechat-real-payment.json')
const mode = process.argv[2] || 'prepare'

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value, secret = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, secret ? { mode: 0o600 } : undefined)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout(promise, label, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
  ])
}

async function api(token, pathname, options = {}) {
  const response = await fetch(`${apiBase}/v1${pathname}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${text}`)
  return body
}

async function prepare() {
  const { token } = readJson(sessionPath)
  const points = await api(token, '/points')
  const idempotencyKey = `real-payment-${crypto.randomUUID()}`
  const created = await api(token, '/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: { productCode: 'POINTS_50' }
  })
  if (!created.order?.id || !created.payment?.package || !created.payment?.paySign) {
    throw new Error('real WeChat prepay response is incomplete')
  }
  const state = {
    preparedAt: new Date().toISOString(),
    orderId: created.order.id,
    amountFen: created.order.amountFen,
    points: created.order.points,
    beforePoints: Number(points.balance ?? points.availablePoints),
    payment: created.payment
  }
  writeJson(paymentStatePath, state, true)
  writeJson(evidencePath, {
    status: 'READY_FOR_USER_CONFIRMATION',
    preparedAt: state.preparedAt,
    orderId: state.orderId,
    amountFen: state.amountFen,
    points: state.points,
    beforePoints: state.beforePoints,
    paymentParameterKeys: Object.keys(state.payment)
  })
  console.log(JSON.stringify({
    status: 'READY_FOR_USER_CONFIRMATION',
    orderId: state.orderId,
    amountFen: state.amountFen,
    points: state.points,
    beforePoints: state.beforePoints,
    evidencePath
  }, null, 2))
}

async function pay() {
  const endpoint = process.env.WECHAT_AUTOMATION_WS
  if (!endpoint) throw new Error('WECHAT_AUTOMATION_WS is required for real payment')
  const { token } = readJson(sessionPath)
  const state = readJson(paymentStatePath)
  const miniProgram = await withTimeout(automator.connect({ wsEndpoint: endpoint }), 'connect automation', 30_000)
  try {
    await withTimeout(miniProgram.callWxMethod('requestPayment', state.payment), 'wx.requestPayment', 180_000)
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
    writeJson(evidencePath, {
      status: /cancel/i.test(message) ? 'CANCELLED_BY_USER' : 'PAYMENT_CLIENT_FAILED',
      checkedAt: new Date().toISOString(),
      orderId: state.orderId,
      amountFen: state.amountFen,
      error: message
    })
    throw error
  } finally {
    miniProgram.disconnect()
  }

  let finalOrder = null
  let finalPoints = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const refreshed = await api(token, `/orders/${encodeURIComponent(state.orderId)}/refresh`, { method: 'POST' })
    finalOrder = refreshed.order || refreshed
    finalPoints = await api(token, '/points')
    const balance = Number(finalPoints.balance ?? finalPoints.availablePoints)
    if (finalOrder.status === 'PAID' && balance === state.beforePoints + state.points) break
    await delay(3_000)
  }

  const afterPoints = Number(finalPoints?.balance ?? finalPoints?.availablePoints)
  const passed = finalOrder?.status === 'PAID'
    && afterPoints === state.beforePoints + state.points
    && Boolean(finalOrder.pointsGrantedAt || finalOrder.quotaGrantedAt)
  const evidence = {
    status: passed ? 'PASS' : 'FAIL',
    checkedAt: new Date().toISOString(),
    orderId: state.orderId,
    amountFen: state.amountFen,
    purchasedPoints: state.points,
    beforePoints: state.beforePoints,
    afterPoints,
    pointDelta: afterPoints - state.beforePoints,
    orderStatus: finalOrder?.status,
    pointsGrantedAt: finalOrder?.pointsGrantedAt || finalOrder?.quotaGrantedAt || null
  }
  writeJson(evidencePath, evidence)
  console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2))
  if (!passed) process.exitCode = 1
}

(mode === 'prepare' ? prepare() : mode === 'pay' ? pay() : Promise.reject(new Error(`unknown mode: ${mode}`)))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
