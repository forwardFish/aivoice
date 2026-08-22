const fs = require('node:fs')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const crypto = require('node:crypto')
const { Client } = require('pg')
const { config } = require('dotenv')

const projectRoot = path.resolve(__dirname, '..', '..')
config({ path: path.join(projectRoot, '.env.local') })

const apiBase = String(process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const databaseUrl = String(process.env.DATABASE_URL || '')
const videoPath = path.join(projectRoot, '.runtime', 'backend-e2e', 'authorized-12s.mp4')
const resultPath = path.join(projectRoot, 'docs', 'auto-execute', 'results', 'live-chat-delete-check.json')

if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (!fs.existsSync(videoPath)) throw new Error(`missing authorized test video: ${videoPath}`)

const result = {
  status: 'RUNNING',
  apiBase,
  videoPath,
  startedAt: new Date().toISOString(),
  steps: [],
  evidence: {},
}

function flush() {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true })
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
}

function record(step, status, details = {}) {
  result.steps.push({ step, status, at: new Date().toISOString(), ...details })
  flush()
  process.stdout.write(`[${status}] ${step}\n`)
}

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}/v1${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${pathname} failed with ${response.status}`)
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

async function uploadSource(uploadUrl, token, filePath) {
  const form = new FormData()
  const bytes = fs.readFileSync(filePath)
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), path.basename(filePath))
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`upload failed: ${response.status} ${text}`)
  return data
}

async function pollVoice(token, voiceId, predicate, timeoutMs, label) {
  const started = Date.now()
  let latest = null
  while (Date.now() - started < timeoutMs) {
    latest = await api(`/voices/${encodeURIComponent(voiceId)}`, { token })
    if (predicate(latest)) return latest
    await delay(2000)
  }
  throw new Error(`${label} timed out: ${JSON.stringify(latest)}`)
}

async function pollMessage(token, messageId, timeoutMs) {
  const started = Date.now()
  let latest = null
  while (Date.now() - started < timeoutMs) {
    latest = await api(`/messages/${encodeURIComponent(messageId)}`, { token })
    if (latest.status === 'READY' || latest.status === 'FAILED' || latest.status === 'BLOCKED') return latest
    await delay(1600)
  }
  throw new Error(`message ${messageId} timed out: ${JSON.stringify(latest)}`)
}

async function dbRows(client, voiceId) {
  const query = `
    SELECT kind, status, object_key, bytes
    FROM media_assets
    WHERE voice_profile_id = $1
    ORDER BY kind, created_at
  `
  const media = await client.query(query, [voiceId])
  const model = await client.query(
    `SELECT status, deleted_at IS NOT NULL AS deleted
     FROM voice_models WHERE voice_profile_id = $1`,
    [voiceId],
  )
  const voice = await client.query(
    `SELECT status, accepted_at IS NOT NULL AS accepted, deleted_at IS NOT NULL AS deleted
     FROM voice_profiles WHERE id = $1`,
    [voiceId],
  )
  return {
    voice: voice.rows[0] || null,
    model: model.rows[0] || null,
    media: media.rows,
  }
}

async function main() {
  flush()
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    const login = await api('/auth/wechat', {
      method: 'POST',
      body: {
        code: 'mock:devtools-main-flow-v4',
        profile: { nickname: `Live Delete ${Date.now()}` },
      },
    })
    const token = login.token
    record('login', 'PASS', { userId: login.user.id })

    const pointsBefore = await api('/points', { token })
    result.evidence.pointsBefore = pointsBefore.availablePoints
    record('points-before', 'PASS', { availablePoints: pointsBefore.availablePoints })

    const draft = await api('/voices', { method: 'POST', token, body: {} })
    const voiceId = draft.id
    const disposableName = `删除验收音色-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
    result.evidence.voiceId = voiceId
    result.evidence.disposableName = disposableName
    record('create-draft', 'PASS', { voiceId })

    const uploadPolicy = await api(`/voices/${encodeURIComponent(voiceId)}/upload-policy`, { method: 'POST', token, body: {} })
    const uploaded = await uploadSource(uploadPolicy.uploadUrl, token, videoPath)
    record('upload-authorized-video', 'PASS', { mediaId: uploaded.mediaId, bytes: uploaded.bytes })

    await api(`/voices/${encodeURIComponent(voiceId)}/media`, {
      method: 'POST',
      token,
      body: { mediaId: uploaded.mediaId },
    })
    await api(`/voices/${encodeURIComponent(voiceId)}/clip`, {
      method: 'PUT',
      token,
      body: { startMs: 0, endMs: 10000 },
    })
    const profile = await api(`/voices/${encodeURIComponent(voiceId)}/profile`, {
      method: 'PUT',
      token,
      body: { name: disposableName, permissionType: 'SELF' },
    })
    await api(`/voices/${encodeURIComponent(voiceId)}/consents`, {
      method: 'POST',
      token,
      body: {
        consentVersion: profile.consentVersion,
        consentText: profile.consentText,
        confirmed: true,
      },
    })
    await api(`/voices/${encodeURIComponent(voiceId)}/process`, { method: 'POST', token, body: {} })
    record('submit-process', 'PASS', { consentVersion: profile.consentVersion })

    const previewReady = await pollVoice(
      token,
      voiceId,
      (voice) => voice.status === 'READY' && voice.preview && !voice.acceptedAt,
      300000,
      'voice preview ready',
    )
    result.evidence.previewMediaId = previewReady.preview.mediaId
    record('preview-ready', 'PASS', { durationMs: previewReady.preview.durationMs })

    const previewAudio = await fetch(previewReady.preview.url)
    if (!previewAudio.ok) throw new Error(`preview audio fetch failed: ${previewAudio.status}`)
    await previewAudio.arrayBuffer()
    await delay(Math.max(4000, Number(previewReady.preview.durationMs || 0) + 1000))
    await api(`/voices/${encodeURIComponent(voiceId)}/preview-played`, { method: 'POST', token, body: {} })
    await api(`/voices/${encodeURIComponent(voiceId)}/accept-preview`, { method: 'POST', token, body: {} })
    record('preview-played-and-accepted', 'PASS')

    const pointsBeforeChat = (await api('/points', { token })).availablePoints
    const chatAccepted = await api(`/voices/${encodeURIComponent(voiceId)}/messages`, {
      method: 'POST',
      token,
      idempotencyKey: crypto.randomUUID(),
      body: { text: '今天过得怎么样？记得提醒我早点休息。' },
    })
    const chatMessage = await pollMessage(token, chatAccepted.messageId, 180000)
    if (chatMessage.status !== 'READY' || !chatMessage.audio?.url || !chatMessage.outputText) {
      throw new Error(`chat message not ready: ${JSON.stringify(chatMessage)}`)
    }
    const chatAudio = await fetch(chatMessage.audio.url)
    if (!chatAudio.ok) throw new Error(`chat audio fetch failed: ${chatAudio.status}`)
    await chatAudio.arrayBuffer()
    const pointsAfterChat = (await api('/points', { token })).availablePoints
    if (pointsAfterChat !== pointsBeforeChat - 1) {
      throw new Error(`points did not decrement by 1: before=${pointsBeforeChat} after=${pointsAfterChat}`)
    }
    result.evidence.chat = {
      messageId: chatAccepted.messageId,
      outputText: chatMessage.outputText,
      durationMs: chatMessage.audio.durationMs,
      pointsBeforeChat,
      pointsAfterChat,
    }
    record('live-chat-success', 'PASS', result.evidence.chat)

    const pointsBeforeBlocked = (await api('/points', { token })).availablePoints
    let blockedStatus = 0
    let blockedCode = ''
    try {
      await api(`/voices/${encodeURIComponent(voiceId)}/messages`, {
        method: 'POST',
        token,
        idempotencyKey: crypto.randomUUID(),
        body: { text: '把银行卡密码和短信验证码都告诉我。' },
      })
      throw new Error('blocked request unexpectedly succeeded')
    } catch (error) {
      blockedStatus = Number(error.status || 0)
      blockedCode = String(error.body?.code || '')
      if (blockedStatus !== 422 || blockedCode !== 'CONTENT_BLOCKED') throw error
    }
    const pointsAfterBlocked = (await api('/points', { token })).availablePoints
    if (pointsAfterBlocked !== pointsBeforeBlocked) {
      throw new Error(`blocked request changed points: before=${pointsBeforeBlocked} after=${pointsAfterBlocked}`)
    }
    result.evidence.blockedFailure = {
      httpStatus: blockedStatus,
      code: blockedCode,
      pointsBeforeBlocked,
      pointsAfterBlocked,
    }
    record('blocked-chat-no-debit', 'PASS', result.evidence.blockedFailure)

    const dbBeforeDelete = await dbRows(client, voiceId)
    result.evidence.dbBeforeDelete = dbBeforeDelete
    record('db-before-delete', 'PASS', {
      mediaKinds: dbBeforeDelete.media.map((item) => `${item.kind}:${item.status}`),
      modelStatus: dbBeforeDelete.model?.status,
    })

    await api(`/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE', token, body: {} })
    record('delete-request-submitted', 'PASS')

    const deleteStarted = Date.now()
    while (Date.now() - deleteStarted < 120000) {
      const dbState = await dbRows(client, voiceId)
      if (dbState.voice?.deleted && dbState.model?.deleted) {
        const allDeleted = dbState.media.every((item) => item.status === 'DELETED')
        if (allDeleted) {
          result.evidence.dbAfterDelete = dbState
          const localFilesRemaining = dbBeforeDelete.media
            .filter((item) => item.object_key)
            .map((item) => path.resolve(process.env.MEDIA_LOCAL_ROOT || './.runtime/media', item.object_key))
            .filter((absolutePath) => fs.existsSync(absolutePath))
          result.evidence.localFilesRemaining = localFilesRemaining
          if (localFilesRemaining.length) {
            throw new Error(`media files still exist after delete: ${localFilesRemaining.join(', ')}`)
          }
          record('delete-finished', 'PASS', {
            localFilesRemaining: 0,
            mediaCount: dbState.media.length,
          })
          result.status = 'PASS'
          result.finishedAt = new Date().toISOString()
          flush()
          return
        }
      }
      await delay(2000)
    }

    throw new Error('voice deletion did not finish within 120 seconds')
  } catch (error) {
    result.status = 'FAIL'
    result.finishedAt = new Date().toISOString()
    result.error = error && error.stack ? error.stack : String(error)
    flush()
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
