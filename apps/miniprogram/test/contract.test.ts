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
    relationshipType: 'GRANDMOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    ageYears: 70,
    gender: 'FEMALE',
    userAgeYears: 40,
    userLifeStage: 'ADULT',
    background: '退休前是中学老师。',
    relationshipNote: '和成年女儿每周通话。',
    personalityNote: '遇到大事先问清具体情况。',
    speechHabitNote: '句子不长，先问具体事情。',
    acceptedAt: null,
    previewRetryCount: 0,
    points: { availablePoints: 0, trialEligibility: 'ELIGIBLE' }
  })
  assert.equal(previewReady.status, 'PREVIEW_READY')
  assert.equal(previewReady.permissionType, 'OTHER')
  assert.equal(previewReady.relationshipType, 'GRANDMOTHER')
  assert.equal(previewReady.userAddress, '小林')
  assert.equal(previewReady.ageYears, 70)
  assert.equal(previewReady.gender, 'FEMALE')
  assert.equal(previewReady.userAgeYears, 40)
  assert.equal(previewReady.userLifeStage, 'ADULT')
  assert.equal(previewReady.background, '退休前是中学老师。')
  assert.equal(previewReady.relationshipNote, '和成年女儿每周通话。')
  assert.equal(previewReady.personalityNote, '遇到大事先问清具体情况。')
  assert.equal(previewReady.speechHabitNote, '句子不长，先问具体事情。')
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

test('normalizes speaker quality failures into actionable Chinese guidance', () => {
  const voice = normalizeVoice({
    id: 'voice-speakers',
    status: 'FAILED',
    failureCode: 'MULTIPLE_SPEAKERS',
    failureMessage: 'MULTIPLE_SPEAKERS'
  })
  assert.equal(voice.error?.code, 'MULTIPLE_SPEAKERS')
  assert.match(String(voice.error?.message), /多个声音/)
  assert.match(String(voice.error?.message), /只有 TA 一个人说话的视频/)
})

test('normalizes missing source media into a recoverable Chinese restart instruction', () => {
  const voice = normalizeVoice({
    id: 'voice-missing-source',
    status: 'FAILED',
    failureCode: 'SOURCE_VIDEO_REQUIRED',
    failureMessage: 'source video is required'
  })
  assert.equal(voice.error?.code, 'SOURCE_VIDEO_REQUIRED')
  assert.match(String(voice.error?.message), /原视频已经失效.*重新选择视频/)
  assert.doesNotMatch(String(voice.error?.message), /source video is required/i)
})

test('frontend source uses current server authority endpoints and no hardcoded consent version', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const apiSource = fs.readFileSync(path.join(appRoot, 'services/api.ts'), 'utf8')
  const workbenchSource = fs.readFileSync(path.join(appRoot, 'pages/voice/workbench.ts'), 'utf8')
  const previewSource = fs.readFileSync(path.join(appRoot, 'pages/create/preview.ts'), 'utf8')
  const profileSource = fs.readFileSync(path.join(appRoot, 'pages/create/voice-profile.ts'), 'utf8')
  assert.match(apiSource, /\/preview-played/)
  assert.match(apiSource, /\/preview-started/)
  assert.match(apiSource, /uploadHeaders\.Authorization/)
  assert.match(apiSource, /wx\.getFileSystemManager\(\)\.readFile/)
  assert.match(apiSource, /method: 'PUT'/)
  assert.match(apiSource, /path: '\/orders'[\s\S]*'Idempotency-Key': await uuidV4\(\)/)
  assert.match(workbenchSource, /const idempotencyKey = await uuidV4\(\)/)
  assert.match(previewSource, /markVoicePreviewPlayed/)
  assert.match(previewSource, /markVoicePreviewStarted/)
  assert.doesNotMatch(profileSource, /CONSENT_VERSION/)
  assert.match(profileSource, /savedProfile\.consentVersion/)
})
