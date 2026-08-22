/**
 * Public runtime configuration only.
 * Production may provide `apiBaseUrl` through WeChat ExtConfig, or replace the
 * fallback domain below with a备案且已加入微信 request/upload 合法域名的 HTTPS 地址。
 * Never place AppSecret, API keys, payment certificates or provider credentials here.
 */
function resolveApiBaseUrl(): string {
  try {
    const extConfig = typeof wx !== 'undefined' && typeof wx.getExtConfigSync === 'function'
      ? wx.getExtConfigSync()
      : null
    const configured = extConfig && String(extConfig.apiBaseUrl || '').trim()
    if (configured && /^https:\/\//i.test(configured)) return configured.replace(/\/+$/, '')
  } catch (_error) {
    // ExtConfig is optional; fall back to the public compile-time origin.
  }
  return 'https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com'
}

export const API_BASE_URL = resolveApiBaseUrl()
export const LOCAL_DEV_MODE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API_BASE_URL)
export const LOCAL_DEV_LOGIN_CODE = 'mock:devtools-main-flow-v4'
export const API_PREFIX = '/v1'
export const REQUEST_TIMEOUT_MS = 30000
export const UPLOAD_TIMEOUT_MS = 300000
export const POLL_INTERVAL_MS = 1600
export const PROCESS_POLL_INTERVAL_MS = 2200
export const ORDER_POLL_ATTEMPTS = 40
export const MESSAGE_POLL_ATTEMPTS = 75
