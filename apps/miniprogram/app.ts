import { getToken } from './utils/storage'

App({
  globalData: {
    bootstrapped: false
  },
  onLaunch() {
    this.globalData.bootstrapped = Boolean(getToken())
  }
})
