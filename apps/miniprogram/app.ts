import { getToken } from './utils/storage'
import { PURE_CLOUD_MODE } from './config'
import { prewarmCloudClients } from './services/cloud-client'

App({
  globalData: {
    bootstrapped: false,
    cloudReady: false,
    cloudError: ''
  },
  onLaunch() {
    if (PURE_CLOUD_MODE) {
      void prewarmCloudClients()
        .then(() => {
          this.globalData.cloudReady = true
          this.globalData.cloudError = ''
        })
        .catch((error: any) => {
          this.globalData.cloudReady = false
          this.globalData.cloudError = String(error?.errMsg || error?.message || '共享云环境初始化失败')
        })
    }
    this.globalData.bootstrapped = Boolean(getToken())
  }
})
