import { cloudBaseRuntimeFromEnv } from '@aivoice/cloudbase-runtime'
import { decryptWechatMessage, handleVirtualPayEvent, verifyMessageSignature } from './handler.mjs'

const token = process.env.WECHAT_MESSAGE_TOKEN || ''
const encodingAesKey = process.env.WECHAT_MESSAGE_ENCODING_AES_KEY || ''
const appId = process.env.WECHAT_APP_ID || ''
const merchantId = process.env.WECHAT_VIRTUAL_PAY_MCH_ID || ''
const productId = process.env.WECHAT_VIRTUAL_PAY_PRODUCT_ID || 'POINTS_50'

if (!token || !appId || !merchantId) throw new Error('virtual payment event configuration is incomplete')

const runtime = cloudBaseRuntimeFromEnv()

function response(statusCode, body, contentType = 'application/json; charset=utf-8') {
  return {
    statusCode,
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
  }
}
function queryFromEvent(event) {
  const query = new URLSearchParams()
  const rawQuery = event?.rawQueryString || event?.queryString || event?.requestContext?.http?.queryString || ''
  if (typeof rawQuery === 'string' && rawQuery) {
    for (const [name, value] of new URLSearchParams(rawQuery)) query.append(name, value)
  }
  const parameters = event?.queryStringParameters || event?.query || {}
  if (parameters && typeof parameters === 'object') {
    for (const [name, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) query.set(name, String(value))
    }
  }
  return query
}

function bodyFromEvent(event) {
  const value = event?.body ?? event?.requestContext?.body ?? ''
  if (typeof value !== 'string') return JSON.stringify(value || {})
  return event?.isBase64Encoded ? Buffer.from(value, 'base64').toString('utf8') : value
}

export async function main(event = {}) {
  try {
    const method = String(event.httpMethod || event.requestContext?.http?.method || event.method || 'GET').toUpperCase()
    const query = queryFromEvent(event)
    const timestamp = query.get('timestamp') || ''
    const nonce = query.get('nonce') || ''

    if (method === 'GET') {
      const echo = query.get('echostr') || ''
      const encryptedMode = query.has('msg_signature')
      const signature = query.get('msg_signature') || query.get('signature') || ''
      if (!verifyMessageSignature({ token, timestamp, nonce, signature, encrypted: encryptedMode ? echo : '' })) {
        return response(401, { error: 'signature mismatch' })
      }
      return response(200, encryptedMode ? decryptWechatMessage(echo, encodingAesKey, appId) : echo, 'text/plain; charset=utf-8')
    }

    if (method !== 'POST') return response(405, { error: 'method not allowed' })

    const raw = bodyFromEvent(event)
    if (Buffer.byteLength(raw) > 1_048_576) throw new Error('event body too large')
    let envelope = JSON.parse(raw || '{}')
    const encrypted = String(envelope.Encrypt || envelope.encrypt || '')
    const signature = query.get('msg_signature') || query.get('signature') || ''
    if (!verifyMessageSignature({ token, timestamp, nonce, signature, encrypted })) {
      return response(401, { error: 'signature mismatch' })
    }
    if (encrypted) envelope = JSON.parse(decryptWechatMessage(encrypted, encodingAesKey, appId))
    return response(200, await handleVirtualPayEvent(envelope, { runtime, appId, merchantId, productId }))
  } catch (error) {
    console.error('virtual payment gateway event failed', error)
    return response(500, { ErrCode: -1, ErrMsg: 'retry' })
  }
}
