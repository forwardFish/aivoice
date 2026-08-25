const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9420'
const outputPath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'shared-event-function-live.json')

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: endpoint })
  try {
    const probe = await miniProgram.evaluate(async () => {
      const cloud = new wx.cloud.Cloud({
        resourceAppid: 'wx1e662dd78e2fb22e',
        resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
      })
      await cloud.init()
      const invoke = async (path) => {
        const response = await cloud.callFunction({
          name: 'aivoice-api-event',
          data: { path, method: 'GET', headers: { 'content-type': 'application/json' } },
        })
        return response.result || {}
      }
      const started = Date.now()
      const health = await invoke('/v1/health')
      const healthMs = Date.now() - started
      const products = await invoke('/v1/products')
      return {
        healthStatus: Number(health.statusCode || 0),
        healthService: String(health.data?.service || ''),
        healthMs,
        productsStatus: Number(products.statusCode || 0),
        productCode: String(products.data?.products?.[0]?.productCode || ''),
        productPoints: Number(products.data?.products?.[0]?.points || 0),
      }
    })
    const result = {
      checkedAt: new Date().toISOString(),
      status: probe.healthStatus === 200
        && probe.healthService === 'aivoice-api'
        && probe.productsStatus === 200
        && probe.productCode === 'POINTS_50'
        && probe.productPoints === 50
        ? 'PASS'
        : 'FAIL',
      targetAppId: 'wx106e5dcda1d1baeb',
      resourceAppId: 'wx1e662dd78e2fb22e',
      resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
      functionName: 'aivoice-api-event',
      ...probe,
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
