const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://localhost:9420'
const outputPath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'shared-auth-live.json')

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: endpoint })
  try {
    const probe = await miniProgram.evaluate(async () => {
      const cloud = new wx.cloud.Cloud({
        resourceAppid: 'wx1e662dd78e2fb22e',
        resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
      })
      await cloud.init()
      const invoke = async (path, method, data, token = '') => {
        const response = await cloud.callFunction({
          name: 'aivoice-api-event',
          data: {
            path,
            method,
            data,
            headers: {
              'content-type': 'application/json',
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
          },
        })
        return response.result || {}
      }
      const loginCode = async () => await new Promise((resolve, reject) => {
        wx.login({ success: (result) => resolve(String(result.code || '')), fail: reject })
      })
      const first = await invoke('/v1/auth/wechat', 'POST', { code: await loginCode() })
      const token = String(first.data?.token || '')
      const me = await invoke('/v1/me', 'GET', undefined, token)
      const ledgers = await invoke('/v1/points/ledgers', 'GET', undefined, token)
      const second = await invoke('/v1/auth/wechat', 'POST', { code: await loginCode() })
      const registrationGrant = Array.isArray(ledgers.data?.ledgers)
        ? ledgers.data.ledgers.find((item) => item.type === 'REGISTER_GRANT')
        : null
      return {
        firstStatus: Number(first.statusCode || 0),
        tokenPresent: token.length >= 32,
        meStatus: Number(me.statusCode || 0),
        ledgersStatus: Number(ledgers.statusCode || 0),
        registrationGrant: Number(registrationGrant?.amount || 0),
        firstUserId: String(first.data?.user?.id || ''),
        meUserId: String(me.data?.user?.id || ''),
        secondStatus: Number(second.statusCode || 0),
        secondUserId: String(second.data?.user?.id || ''),
        firstPoints: Number(first.data?.points?.balance ?? first.data?.points?.availablePoints ?? -1),
        secondPoints: Number(second.data?.points?.balance ?? second.data?.points?.availablePoints ?? -1),
      }
    })
    const sameUser = Boolean(probe.firstUserId)
      && probe.firstUserId === probe.meUserId
      && probe.firstUserId === probe.secondUserId
    const result = {
      checkedAt: new Date().toISOString(),
      status: probe.firstStatus === 201
        && probe.tokenPresent
        && probe.meStatus === 200
        && probe.ledgersStatus === 200
        && probe.registrationGrant === 10
        && probe.secondStatus === 201
        && sameUser
        && probe.firstPoints >= 0
        && probe.secondPoints === probe.firstPoints
        ? 'PASS'
        : 'FAIL',
      targetAppId: 'wx106e5dcda1d1baeb',
      resourceAppId: 'wx1e662dd78e2fb22e',
      resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
      firstStatus: probe.firstStatus,
      tokenPresent: probe.tokenPresent,
      meStatus: probe.meStatus,
      ledgersStatus: probe.ledgersStatus,
      registrationGrant: probe.registrationGrant,
      secondStatus: probe.secondStatus,
      sameUser,
      firstPoints: probe.firstPoints,
      secondPoints: probe.secondPoints,
      duplicateSignupGrantPrevented: probe.secondPoints === probe.firstPoints,
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.status !== 'PASS') process.exitCode = 1
  } finally {
    miniProgram.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
