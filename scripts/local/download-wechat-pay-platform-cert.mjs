import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function readEnv(filePath) {
  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/u)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/u, '$2')
  }
  return values
}

function updateEnvPath(filePath, key, value) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)
  const index = lines.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line))
  const replacement = `${key}=${value}`
  if (index >= 0) lines[index] = replacement
  else lines.push(replacement)
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
}

function authorization({ mchid, serialNo, privateKey, requestPath }) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `GET\n${requestPath}\n${timestamp}\n${nonce}\n\n`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
}

function decryptCertificate(apiV3Key, encrypted) {
  if (encrypted.algorithm !== 'AEAD_AES_256_GCM') throw new Error('Unsupported platform certificate algorithm')
  const ciphertextWithTag = Buffer.from(encrypted.ciphertext, 'base64')
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16)
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(encrypted.nonce, 'utf8'))
  decipher.setAAD(Buffer.from(encrypted.associated_data || '', 'utf8'))
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

const envPath = path.resolve(arg('env', '.env.local'))
const values = readEnv(envPath)
const required = ['WECHAT_PAY_MCH_ID', 'WECHAT_PAY_SERIAL_NO', 'WECHAT_PAY_PRIVATE_KEY_PATH', 'WECHAT_PAY_API_V3_KEY']
for (const key of required) {
  if (!values[key]) throw new Error(`Missing ${key} in target env`)
}
if (values.WECHAT_PAY_API_V3_KEY.length !== 32) throw new Error('WECHAT_PAY_API_V3_KEY must be 32 characters')

const privateKeyPath = path.resolve(values.WECHAT_PAY_PRIVATE_KEY_PATH)
const outputPath = path.resolve(arg('output', path.join(path.dirname(privateKeyPath), 'wechatpay_platform.pem')))
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const requestPath = '/v3/certificates'
const response = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
  headers: {
    Authorization: authorization({
      mchid: values.WECHAT_PAY_MCH_ID,
      serialNo: values.WECHAT_PAY_SERIAL_NO,
      privateKey,
      requestPath,
    }),
    Accept: 'application/json',
    'User-Agent': 'aivoice-platform-cert-fetcher/1.0',
  },
  signal: AbortSignal.timeout(20_000),
})
const requestId = response.headers.get('request-id') || ''
if (!response.ok) throw new Error(`WeChat Pay certificates request failed: HTTP ${response.status}; Request-ID=${requestId || 'missing'}`)
const payload = await response.json()
const now = Date.now()
const candidates = Array.isArray(payload.data) ? payload.data
  .filter(item => Date.parse(item.effective_time) <= now && Date.parse(item.expire_time) > now)
  .sort((a, b) => Date.parse(b.effective_time) - Date.parse(a.effective_time)) : []
if (!candidates.length) throw new Error('No currently valid WeChat Pay platform certificate returned')

const selected = candidates[0]
const certificatePem = decryptCertificate(values.WECHAT_PAY_API_V3_KEY, selected.encrypt_certificate)
const certificate = new crypto.X509Certificate(certificatePem)
if (Date.now() >= Date.parse(certificate.validTo)) throw new Error('Downloaded WeChat Pay platform certificate is expired')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
const temporaryPath = `${outputPath}.tmp-${process.pid}`
fs.writeFileSync(temporaryPath, certificatePem, { encoding: 'utf8', mode: 0o600 })
fs.renameSync(temporaryPath, outputPath)
updateEnvPath(envPath, 'WECHAT_PAY_PLATFORM_CERT_PATH', outputPath)

console.log(JSON.stringify({
  status: 'PASS',
  outputPath,
  validFrom: certificate.validFrom,
  validTo: certificate.validTo,
  daysRemaining: Math.floor((Date.parse(certificate.validTo) - Date.now()) / 86_400_000),
  requestIdPresent: Boolean(requestId),
}, null, 2))
