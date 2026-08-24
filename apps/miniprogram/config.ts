/** Public runtime configuration only. Never place credentials here. */
function extConfig(): Record<string, any> {
  try {
    return typeof wx !== 'undefined' && typeof wx.getExtConfigSync === 'function'
      ? wx.getExtConfigSync()
      : {}
  } catch (_error) {
    return {}
  }
}

const runtimeConfig = extConfig()

function resolveApiBaseUrl() {
  try {
    const configured = String(runtimeConfig.apiBaseUrl || '').trim()
    if (configured && /^https:\/\//i.test(configured)) return configured.replace(/\/+$/, '')
  } catch (_error) {
    // ExtConfig is optional; keep the legacy origin for explicit HTTP fallback only.
  }
  return 'https://aivoice-run-d9gu3ee7n56f21869-1434074357.ap-shanghai.app.tcloudbase.com'
}

export const API_BASE_URL = resolveApiBaseUrl()
export const LOCAL_DEV_MODE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API_BASE_URL)
export const CLOUDBASE_RESOURCE_APP_ID = String(runtimeConfig.cloudbaseResourceAppId || 'wx1e662dd78e2fb22e')
export const CLOUDBASE_ENV_ID = String(runtimeConfig.cloudbaseEnvId || 'aiassistant-0517-d6en8tw82f2f7fc')
export const CLOUDBASE_HTTP_FUNCTION_NAME = String(runtimeConfig.cloudbaseHttpFunctionName || 'aivoice-api-event')
export const CLOUDBASE_RUN_ENV_ID = String(runtimeConfig.cloudbaseRunEnvId || 'aiassistant-0517-d6en8tw82f2f7fc')
export const CLOUDBASE_RUN_SERVICE_NAME = String(runtimeConfig.cloudbaseRunServiceName || 'aivoice-api')
const runtimeContainerAvailable = typeof wx !== 'undefined'
  && Boolean((wx as any).cloud)
  && typeof (wx as any).cloud.callContainer === 'function'
const runtimeHttpFunctionAvailable = typeof wx !== 'undefined'
  && Boolean((wx as any).cloud)
  && typeof (wx as any).cloud.callFunction === 'function'
const requestedTransport = String(runtimeConfig.apiTransport || '').toLowerCase()
export const CLOUDBASE_API_TRANSPORT = LOCAL_DEV_MODE || requestedTransport === 'http' || runtimeConfig.apiBaseUrl
  ? 'http'
  : requestedTransport === 'function'
    ? 'function'
    : requestedTransport === 'container'
      ? 'container'
      : runtimeHttpFunctionAvailable
          ? 'function'
          : runtimeContainerAvailable
            ? 'container'
          : 'http'
export const PURE_CLOUD_MODE = CLOUDBASE_API_TRANSPORT !== 'http'
export const LOCAL_DEV_LOGIN_CODE = 'mock:devtools-main-flow-v4'
export const API_PREFIX = '/v1'
export const REQUEST_TIMEOUT_MS = 30000
export const UPLOAD_TIMEOUT_MS = 300000
export const POLL_INTERVAL_MS = 1600
export const PROCESS_POLL_INTERVAL_MS = 2200
export const ORDER_POLL_ATTEMPTS = 40
export const MESSAGE_POLL_ATTEMPTS = 75
