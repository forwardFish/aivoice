const automator = require('miniprogram-automator')

const endpoint = process.env.WECHAT_AUTOMATION_WS || 'ws://127.0.0.1:9421'
const route = process.env.WECHAT_DEBUG_ROUTE || '/pages/create/select-clip'

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms))
}

async function main() {
  const miniProgram = await Promise.race([automator.connect({ wsEndpoint: endpoint }), timeout(15_000, 'connect')])
  miniProgram.on('console', (...args) => console.log('MINIPROGRAM_CONSOLE', ...args))
  miniProgram.on('exception', (...args) => console.error('MINIPROGRAM_EXCEPTION', ...args))
  try {
    console.log('CREATION_SESSION', await miniProgram.callWxMethod('getStorageSync', 'nashide_ta_creation_session'))
    const page = await Promise.race([miniProgram.reLaunch(route), timeout(20_000, 'reLaunch')])
    console.log('RELAUNCH_RESULT', page && page.path)
    await new Promise(resolve => setTimeout(resolve, 2500))
    const current = await Promise.race([miniProgram.currentPage(), timeout(10_000, 'currentPage')])
    console.log('CURRENT_PAGE', current && current.path)
    if (current) console.log('CURRENT_DATA', await Promise.race([current.data(), timeout(10_000, 'data')]))
  } finally {
    miniProgram.disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
