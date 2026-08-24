const fs = require('node:fs')
const path = require('node:path')
const automator = require('miniprogram-automator')

const projectRoot = path.resolve(__dirname, '..', '..')
const projectPath = path.join(projectRoot, 'apps', 'miniprogram')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
const wsEndpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9420'
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_HTTP_PORT || 27285)
const evidencePath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'shared-environment-init.json')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const result = {
    checkedAt: new Date().toISOString(),
    status: 'RUNNING',
    targetAppId: 'wx106e5dcda1d1baeb',
    resourceAppId: 'wx1e662dd78e2fb22e',
    resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
  }
  let miniProgram
  try {
    miniProgram = await automator.connect({ wsEndpoint })
  } catch (_error) {
    miniProgram = await automator.launch({
      cliPath,
      projectPath,
      port: devtoolsPort,
      trustProject: true,
      timeout: 90_000,
    })
  }
  try {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const state = await miniProgram.evaluate(() => {
        const app = getApp()
        return {
          cloudReady: Boolean(app?.globalData?.cloudReady),
          cloudError: String(app?.globalData?.cloudError || ''),
        }
      })
      if (state.cloudReady) {
        const storage = await miniProgram.evaluate(async () => {
          const cloud = new wx.cloud.Cloud({
            resourceAppid: 'wx1e662dd78e2fb22e',
            resourceEnv: 'aiassistant-0517-d6en8tw82f2f7fc',
          })
          await cloud.init()
          const localPath = `${wx.env.USER_DATA_PATH}/aivoice-shared-probe.txt`
          const cloudPath = `aivoice-risk-probe/${Date.now()}-shared.txt`
          wx.getFileSystemManager().writeFileSync(localPath, 'aivoice-shared-environment-probe', 'utf8')
          let fileID = ''
          try {
            const uploaded = await cloud.uploadFile({ cloudPath, filePath: localPath })
            fileID = String(uploaded.fileID || '')
            if (!fileID.startsWith('cloud://')) throw new Error('shared upload returned no cloud file ID')
            const deleted = await cloud.deleteFile({ fileList: [fileID] })
            return {
              uploaded: true,
              fileIdScheme: 'cloud://',
              deleted: Array.isArray(deleted.fileList)
                && deleted.fileList.some((item) => item.fileID === fileID
                  && (item.status === 0 || item.code === 'SUCCESS')),
            }
          } finally {
            try { wx.getFileSystemManager().unlinkSync(localPath) } catch (_error) {}
          }
        })
        Object.assign(result, {
          status: storage.uploaded && storage.deleted ? 'PASS' : 'FAIL',
          cloudReady: true,
          storage,
        })
        break
      }
      if (state.cloudError) {
        Object.assign(result, { status: 'FAIL', cloudReady: false, error: state.cloudError })
        break
      }
      await delay(500)
    }
    if (result.status === 'RUNNING') {
      Object.assign(result, { status: 'FAIL', cloudReady: false, error: 'shared environment init timed out' })
    }
  } finally {
    miniProgram.disconnect()
  }
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.status !== 'PASS') process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
