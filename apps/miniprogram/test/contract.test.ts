import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  normalizeConversation,
  normalizePreview,
  normalizeUploadPolicy,
  normalizeVoice
} from '../models/normalize'

test('normalizes the implemented backend voice lifecycle and permission values', () => {
  const previewReady = normalizeVoice({
    id: 'voice-1',
    name: '奶奶',
    status: 'READY',
    permissionType: 'OTHER',
    acceptedAt: null,
    previewRetryCount: 0,
    points: { availablePoints: 0, trialEligibility: 'ELIGIBLE' }
  })
  assert.equal(previewReady.status, 'PREVIEW_READY')
  assert.equal(previewReady.permissionType, 'OTHER')
  assert.equal(previewReady.freeRetryRemaining, 1)

  const accepted = normalizeVoice({ ...previewReady, status: 'READY', acceptedAt: new Date().toISOString() })
  assert.equal(accepted.status, 'READY')
})

test('normalizes server upload and preview response fields', () => {
  assert.deepEqual(normalizeUploadPolicy({ uploadUrl: 'http://127.0.0.1/upload', fieldName: 'file' }).fileField, 'file')
  const signed = normalizeUploadPolicy({
    mode: 'signed-put',
    uploadUrl: 'https://storage.example.test/upload?token=signed',
    method: 'PUT',
    objectKey: 'source/user/voice/video.mp4',
    maxBytes: 104857600
  })
  assert.equal(signed.mode, 'signed-put')
  assert.equal(signed.uploadMethod, 'PUT')
  assert.equal(signed.maxBytes, 104857600)
  assert.equal(normalizePreview({ url: 'http://127.0.0.1/audio', durationMs: 3210 }).audioUrl, 'http://127.0.0.1/audio')
})

test('normalizes shaped conversation rows and exact speech mode', () => {
  const result = normalizeConversation({
    conversationId: 'conversation-1',
    messages: [
      { id: 'user-1', role: 'USER', mode: 'CHAT', status: 'READY', text: '最近好吗？' },
      { id: 'assistant-1', role: 'ASSISTANT', mode: 'CHAT', status: 'READY', text: '挺好的。', audio: { url: '/audio/1', durationMs: 1200 } },
      { id: 'exact-1', role: 'ASSISTANT', mode: 'EXACT_SPEECH', status: 'READY', outputText: '生日快乐。', audio: { url: '/audio/2' } }
    ]
  })
  assert.equal(result.messages.length, 3)
  assert.equal(result.messages[2].mode, 'EXACT_TTS')
  assert.equal(result.messages[2].text, '生日快乐。')
})

test('frontend source uses current server authority endpoints and no hardcoded consent version', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const apiSource = fs.readFileSync(path.join(appRoot, 'services/api.ts'), 'utf8')
  const workbenchSource = fs.readFileSync(path.join(appRoot, 'pages/voice/workbench.ts'), 'utf8')
  const previewSource = fs.readFileSync(path.join(appRoot, 'pages/create/preview.ts'), 'utf8')
  const profileSource = fs.readFileSync(path.join(appRoot, 'pages/create/voice-profile.ts'), 'utf8')
  assert.match(apiSource, /\/preview-played/)
  assert.match(apiSource, /uploadHeaders\.Authorization/)
  assert.match(apiSource, /wx\.getFileSystemManager\(\)\.readFile/)
  assert.match(apiSource, /method: 'PUT'/)
  assert.match(apiSource, /path: '\/orders'[\s\S]*'Idempotency-Key': await uuidV4\(\)/)
  assert.match(workbenchSource, /const idempotencyKey = await uuidV4\(\)/)
  assert.match(previewSource, /markVoicePreviewPlayed/)
  assert.doesNotMatch(profileSource, /CONSENT_VERSION/)
  assert.match(profileSource, /savedProfile\.consentVersion/)
})
