import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { parse as parseDotEnv } from 'dotenv'
import automator from 'miniprogram-automator'
import CloudBase from '@cloudbase/manager-node'
import cloudbaseSdk from '@cloudbase/node-sdk'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const inputPath = process.env.AIVOICE_ACCEPTANCE_VIDEO
  || path.join(projectRoot, '.aivoice-tmp', 'acceptance-input.mp4')
const resultPath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'pure-cloud-main-flow-live.json')
const resourceEnv = 'aiassistant-0517-d6en8tw82f2f7fc'
const functionName = 'aivoice-api-event'
const credentials = parseDotEnv(fs.readFileSync('D:/lyh/secrets/aivoice/tencentcloud-deploy.env'))

function progress(stage, data = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), stage, ...data })}\n`)
}

async function freshLoginCode() {
  const miniProgram = await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATION_WS || 'ws://localhost:9420' })
  try {
    return await miniProgram.evaluate(() => new Promise((resolve, reject) => {
      wx.login({ success: (result) => resolve(String(result.code || '')), fail: reject })
    }))
  } finally {
    miniProgram.disconnect()
  }
}

const app = new CloudBase({
  envId: resourceEnv,
  region: 'ap-shanghai',
  secretId: credentials.TENCENTCLOUD_SECRETID,
  secretKey: credentials.TENCENTCLOUD_SECRETKEY,
})

async function invoke(pathname, method = 'GET', data, token = '', extraHeaders = {}) {
  const result = await app.functions.invokeFunction(functionName, {
    path: pathname,
    method,
    data,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
  })
  const response = JSON.parse(result.RetMsg || '{}')
  if (Number(response.statusCode || 0) < 200 || Number(response.statusCode || 0) >= 300) {
    throw new Error(`${method} ${pathname} failed: ${response.statusCode} ${JSON.stringify(response.data || {})}`)
  }
  return response.data
}

async function pollVoice(voiceId, token, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await invoke(`/v1/voices/${voiceId}`, 'GET', undefined, token)
    progress('voice-poll', { status: last.status, failureCode: last.failureCode || '' })
    if (['READY', 'FAILED'].includes(last.status)) return last
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`voice processing timeout; last status ${last?.status || 'unknown'}`)
}

async function pollMessage(messageId, token, timeoutMs = 8 * 60_000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await invoke(`/v1/messages/${messageId}`, 'GET', undefined, token)
    progress('message-poll', { status: last.status, errorCode: last.errorCode || '' })
    if (['READY', 'FAILED', 'BLOCKED'].includes(last.status)) return last
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`message processing timeout; last status ${last?.status || 'unknown'}`)
}

async function downloadCloudFile(storage, fileID, outputPath) {
  if (!String(fileID || '').startsWith('cloud://')) throw new Error('expected a cloud file ID')
  const result = await storage.downloadFile({ fileID })
  if (result.fileContent === undefined) throw new Error('download returned no file content')
  const body = typeof result.fileContent === 'string' ? Buffer.from(result.fileContent) : Buffer.from(result.fileContent)
  await fsp.writeFile(outputPath, body)
  return body.length
}

async function main() {
  const stat = await fsp.stat(inputPath)
  if (stat.size <= 0) throw new Error('acceptance video is empty')
  progress('start', { inputBytes: stat.size })

  const code = await freshLoginCode()
  const login = await invoke('/v1/auth/wechat', 'POST', { code })
  const token = String(login.token || '')
  if (token.length < 32) throw new Error('login token is missing')
  progress('login-pass', { points: Number(login.points?.balance ?? -1) })

  const pointsBefore = await invoke('/v1/points', 'GET', undefined, token)
  const storage = cloudbaseSdk.init({
    env: resourceEnv,
    secretId: credentials.TENCENTCLOUD_SECRETID,
    secretKey: credentials.TENCENTCLOUD_SECRETKEY,
  })
  let voiceId = String(process.env.AIVOICE_ACCEPTANCE_VOICE_ID || '')
  if (process.env.AIVOICE_ACCEPTANCE_RESUME_LATEST === 'true' && !voiceId) {
    const listed = await invoke('/v1/voices?status=FAILED', 'GET', undefined, token)
    const voices = Array.isArray(listed) ? listed : listed.voices || []
    voiceId = String(voices.find((item) => item.name === '云端完整流程验收')?.id || '')
  }

  if (voiceId) {
    const existingVoice = await invoke(`/v1/voices/${voiceId}`, 'GET', undefined, token)
    if (existingVoice.status === 'READY') {
      progress('voice-ready-resumed')
    } else {
      await invoke(`/v1/voices/${voiceId}/process`, 'POST', {}, token)
      progress('voice-processing-retried')
    }
  } else {
    const voice = await invoke('/v1/voices', 'POST', { name: '云端完整流程验收' }, token)
    voiceId = String(voice.id || '')
    if (!voiceId) throw new Error('voice ID is missing')
    progress('voice-created')

    const policy = await invoke(`/v1/voices/${voiceId}/upload-policy`, 'POST', {
      fileName: path.basename(inputPath),
      mimeType: 'video/mp4',
      sizeBytes: stat.size,
    }, token)
    if (policy.mode !== 'cloud-file' || !policy.cloudPath) throw new Error('native cloud upload policy is missing')

    const uploaded = await storage.uploadFile({ cloudPath: policy.cloudPath, fileContent: await fsp.readFile(inputPath) })
    const fileID = String(uploaded.fileID || '')
    if (!fileID.startsWith('cloud://')) throw new Error('cloud upload returned no file ID')
    progress('upload-pass', { inputBytes: stat.size })

    await invoke(`/v1/voices/${voiceId}/media`, 'POST', {
      objectKey: fileID,
      mediaId: policy.mediaId,
      fileName: path.basename(inputPath),
      mimeType: 'video/mp4',
      sizeBytes: stat.size,
      durationMs: 30_000,
    }, token)
    await invoke(`/v1/voices/${voiceId}/clip`, 'PUT', { startMs: 0, endMs: 20_000 }, token)
    const profiled = await invoke(`/v1/voices/${voiceId}/profile`, 'PUT', {
      name: '云端完整流程验收',
      permissionType: 'SELF',
    }, token)
    await invoke(`/v1/voices/${voiceId}/consents`, 'POST', {
      consentVersion: profiled.consentVersion,
      consentText: profiled.consentText,
      confirmed: true,
    }, token)
    await invoke(`/v1/voices/${voiceId}/process`, 'POST', {}, token)
    progress('voice-processing-started')
  }

  const completedVoice = await pollVoice(voiceId, token)
  if (completedVoice.status !== 'READY') {
    throw new Error(`voice failed: ${completedVoice.failureCode || ''} ${completedVoice.failureMessage || ''}`)
  }
  const preview = await invoke(`/v1/voices/${voiceId}/preview`, 'GET', undefined, token)
  const previewPath = path.join(projectRoot, '.aivoice-tmp', 'acceptance-preview.wav')
  const previewBytes = await downloadCloudFile(storage, preview.url, previewPath)
  await invoke(`/v1/voices/${voiceId}/preview-started`, 'POST', {}, token)
  await new Promise((resolve) => setTimeout(resolve, Math.max(1_000, Number(preview.durationMs || 0))))
  await invoke(`/v1/voices/${voiceId}/preview-played`, 'POST', {}, token)
  await invoke(`/v1/voices/${voiceId}/accept-preview`, 'POST', {}, token)
  progress('preview-pass', { previewBytes })

  const idempotencyKey = crypto.randomUUID()
  const createdMessage = await invoke(`/v1/voices/${voiceId}/exact-speech`, 'POST', {
    text: process.env.AIVOICE_ACCEPTANCE_TEXT || '你好，这是那年的TA云端完整流程验证。',
  }, token, { 'idempotency-key': idempotencyKey })
  const messageId = String(createdMessage.messageId || '')
  if (!messageId) throw new Error('message ID is missing')
  progress('generation-started')

  const completedMessage = await pollMessage(messageId, token)
  if (completedMessage.status !== 'READY' || !completedMessage.audio?.url) {
    throw new Error(`message failed: ${completedMessage.errorCode || ''} ${completedMessage.errorMessage || ''}`)
  }
  const generatedPath = path.join(projectRoot, '.aivoice-tmp', 'acceptance-generated.wav')
  const generatedBytes = await downloadCloudFile(storage, completedMessage.audio.url, generatedPath)
  const pointsAfter = await invoke('/v1/points', 'GET', undefined, token)

  const report = {
    checkedAt: new Date().toISOString(),
    status: generatedBytes > 44 && previewBytes > 44
      && Number(pointsAfter.balance) === Number(pointsBefore.balance) - 1 ? 'PASS' : 'FAIL',
    targetAppId: 'wx106e5dcda1d1baeb',
    resourceEnv,
    voiceId,
    voiceStatus: completedVoice.status,
    previewBytes,
    previewPath,
    messageId,
    messageStatus: completedMessage.status,
    generatedBytes,
    generatedPath,
    pointsBefore: Number(pointsBefore.balance),
    pointsAfter: Number(pointsAfter.balance),
    pointCost: Number(pointsBefore.balance) - Number(pointsAfter.balance),
  }
  await fsp.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`)
  progress('complete', report)
  if (report.status !== 'PASS') process.exitCode = 1
}

main().catch(async (error) => {
  const report = {
    checkedAt: new Date().toISOString(),
    status: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }
  await fsp.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`)
  console.error(error)
  process.exitCode = 1
})
