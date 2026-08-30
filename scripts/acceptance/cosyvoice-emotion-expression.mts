import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputRoot = path.resolve(process.env.AIVOICE_EMOTION_OUTPUT
  || path.join(projectRoot, 'work/acceptance/cosyvoice-emotion-expression'))
const explicitReference = String(process.env.AIVOICE_EMOTION_REFERENCE || '').trim()
if (!explicitReference) {
  throw new Error('AIVOICE_EMOTION_REFERENCE is required; use a consented real-person 8-20 second WAV, never an AI-designed or previously synthesized voice')
}
const referencePath = path.resolve(explicitReference)
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(projectRoot, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
process.env.AIVOICE_TARGET_MODEL = String(process.env.AIVOICE_TARGET_MODEL || 'cosyvoice-v3.5-plus').trim()
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY is missing')
if (!fs.existsSync(referencePath)) throw new Error(`emotion reference is missing: ${referencePath}`)

const [{ AliyunCosyVoiceProvider }, { buildSpeechSynthesisPlan }, { probeWav }] = await Promise.all([
  import('../../apps/worker/dist/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/dist/speech-instruction.js'),
  import('../../apps/worker/dist/media/ffmpeg.js')
])

const sameText = '你到了以后先过来找我，我们再慢慢说。'
const cases = [
  { id: 'same-plain', group: 'same-text', tone: 'PLAIN', text: sameText },
  { id: 'same-irritated', group: 'same-text', tone: 'IRRITATED', text: sameText },
  { id: 'same-mixed', group: 'same-text', tone: 'MIXED', text: sameText },
  { id: 'same-positive', group: 'same-text', tone: 'POSITIVE', text: sameText },
  { id: 'context-plain', group: 'contextual', tone: 'PLAIN', text: '我知道了，你路上慢一点，到家再说。' },
  { id: 'context-irritated', group: 'contextual', tone: 'IRRITATED', text: '你又没提前告诉我，我当然会有点不高兴。' },
  { id: 'context-mixed', group: 'contextual', tone: 'MIXED', text: '知道错就行，过来让我靠一会儿。' },
  { id: 'context-positive', group: 'contextual', tone: 'POSITIVE', text: '你终于回来啦，快过来让我抱一下。' }
] as const
const requestedCaseIds = new Set(String(process.env.AIVOICE_EMOTION_CASES || '').split(',').map(value => value.trim()).filter(Boolean))
const selectedCases = requestedCaseIds.size ? cases.filter(testCase => requestedCaseIds.has(testCase.id)) : cases

await fsp.mkdir(outputRoot, { recursive: true })
const provider = new AliyunCosyVoiceProvider()
const prefix = `emo${Date.now().toString().slice(-7)}`
let temporaryVoiceId = ''
let temporaryVoiceDeleted = false
const generated: Array<Record<string, unknown>> = []
const startedAt = Date.now()
try {
  temporaryVoiceId = await provider.enroll(referencePath, prefix)
  for (const testCase of selectedCases) {
    const speechPlan = buildSpeechSynthesisPlan(testCase.tone, testCase.text)
    const caseStartedAt = Date.now()
    const audio = await provider.synthesize(temporaryVoiceId, speechPlan.text, {
      jobId: 'emotion-expression-acceptance',
      messageId: testCase.id,
      instruction: speechPlan.instruction,
      rate: speechPlan.rate,
      pitch: speechPlan.pitch,
      volume: speechPlan.volume,
      enableSsml: speechPlan.enableSsml
    })
    const outputPath = path.join(outputRoot, `${testCase.id}.wav`)
    await fsp.writeFile(outputPath, audio)
    const probe = await probeWav(outputPath)
    generated.push({
      ...testCase,
      instruction: speechPlan.instruction,
      synthesisText: speechPlan.text,
      rate: speechPlan.rate,
      pitch: speechPlan.pitch,
      volume: speechPlan.volume,
      outputPath,
      bytes: probe.bytes,
      durationMs: probe.durationMs,
      sha256: crypto.createHash('sha256').update(audio).digest('hex'),
      elapsedMs: Date.now() - caseStartedAt
    })
  }
} finally {
  if (temporaryVoiceId) {
    await provider.deleteVoice(temporaryVoiceId)
    temporaryVoiceDeleted = true
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: provider.targetModel,
  referencePath,
  referenceDurationMs: (await probeWav(referencePath)).durationMs,
  temporaryVoiceDeleted,
  totalMs: Date.now() - startedAt,
  generated,
  listeningGate: {
    required: true,
    sameText: 'Without seeing filenames, identify plain, irritated, easing, and positive in all four files.',
    contextual: 'Emotion must fit the text, avoid broadcast tone, and retain the same perceived voice identity.',
    pass: 'At least 7/8 emotion labels are correctly identifiable, no sample has obvious broadcast delivery, and no sample sounds like a different speaker.'
  }
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({
  status: temporaryVoiceDeleted && generated.length === selectedCases.length ? 'AUDIO_GENERATED_NEEDS_BLIND_LISTENING' : 'FAIL',
  outputRoot,
  model: report.model,
  temporaryVoiceDeleted,
  totalMs: report.totalMs,
  files: generated.map(item => ({ id: item.id, durationMs: item.durationMs, elapsedMs: item.elapsedMs }))
}, null, 2))
