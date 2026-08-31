import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const referencePath = path.resolve(process.env.AIVOICE_PRO_AB_REFERENCE || '')
const transcriptionPath = path.resolve(process.env.AIVOICE_PRO_AB_TRANSCRIPTION || '')
const outputRoot = path.resolve(process.env.AIVOICE_PRO_AB_OUTPUT || path.join(root, 'work/acceptance/cosyvoice-pro-ab'))
if (!fs.existsSync(referencePath)) throw new Error(`reference missing: ${referencePath}`)
if (!fs.existsSync(transcriptionPath)) throw new Error(`transcription missing: ${transcriptionPath}`)

const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(root, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
process.env.AIVOICE_TARGET_MODEL = String(process.env.AIVOICE_PRO_AB_TARGET_MODEL || 'cosyvoice-v3.5-plus').trim()
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY missing')

const [
  { AliyunCosyVoiceProvider },
  { inspectReferenceQuality },
  { evaluateSpeakerDiarization },
  { observedPersonEvidenceFromQualityReport, speechPlanBaselineWithCorrections },
  { buildEmotionExpressionPlan },
  { buildSpeechSynthesisPlan, instructionWeightedLength },
  { probeWav },
] = await Promise.all([
  import('../../apps/worker/dist/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/dist/media/quality.js'),
  import('../../apps/worker/dist/providers/aliyun-speaker-diarization.js'),
  import('../../apps/worker/dist/observed-person-evidence.js'),
  import('../../apps/worker/dist/emotion-expression.js'),
  import('../../apps/worker/dist/speech-instruction.js'),
  import('../../apps/worker/dist/media/ffmpeg.js'),
])

const raw = JSON.parse(await fsp.readFile(transcriptionPath, 'utf8'))
const clippedRaw = {
  ...raw,
  transcripts: (Array.isArray(raw.transcripts) ? raw.transcripts : []).map((transcript: any) => ({
    ...transcript,
    sentences: (Array.isArray(transcript.sentences) ? transcript.sentences : [])
      .filter((sentence: any) => Number(sentence.end_time ?? sentence.endTime) <= 9_720),
  })),
}
const quality = await inspectReferenceQuality(referencePath)
const diarization = evaluateSpeakerDiarization(clippedRaw)
const qualityReport = { ...quality, speakerDiarization: diarization }
const evidence = observedPersonEvidenceFromQualityReport(qualityReport)
const baseline = speechPlanBaselineWithCorrections(evidence, qualityReport)

const text = {
  mixed: '我确实有点不高兴，不过你都解释清楚了，路上慢点。',
  irritated: '你晚到可以，至少提前跟我说一声。',
  plain: '知道了，你到了以后跟我说一声。',
} as const

function normalizePlainTtsText(value: string): string {
  return value.normalize('NFC').trim()
    .replace(/！{2,}/gu, '！')
    .replace(/[?？]{2,}/gu, '？')
    .replace(/(?:……){2,}|\.{4,}/gu, '……')
    .replace(/\s+/gu, '')
}

const conservativeInstructions = {
  MIXED: '保持原音色和日常说话方式，前半保留不满，转折后自然放软，不突然变声、不夸张。',
  IRRITATED: '保持原音色和日常说话方式，轻微不满，关键词稍加重，句尾收短，不喊叫、不演愤怒。',
  PLAIN: '保持原音色和日常说话方式，自然口语，语速正常，停顿少，句尾自然收住，不播音。',
} as const
for (const instruction of Object.values(conservativeInstructions)) {
  if (instructionWeightedLength(instruction) > 100) throw new Error(`instruction too long: ${instruction}`)
}

type TestCase = {
  id: string
  mode: 'CURRENT_FULL_CONTROL' | 'PRO_INSTRUCTION_ONLY'
  tone: 'MIXED' | 'IRRITATED' | 'PLAIN'
  text: string
}
let cases: TestCase[] = [
  { id: 'mixed-current', mode: 'CURRENT_FULL_CONTROL', tone: 'MIXED', text: text.mixed },
  { id: 'mixed-pro', mode: 'PRO_INSTRUCTION_ONLY', tone: 'MIXED', text: text.mixed },
  { id: 'irritated-current', mode: 'CURRENT_FULL_CONTROL', tone: 'IRRITATED', text: text.irritated },
  { id: 'irritated-pro', mode: 'PRO_INSTRUCTION_ONLY', tone: 'IRRITATED', text: text.irritated },
  { id: 'plain-pro', mode: 'PRO_INSTRUCTION_ONLY', tone: 'PLAIN', text: text.plain },
]
if (process.env.AIVOICE_PRO_AB_INSTRUCTION_ONLY === '1') {
  cases = cases.filter((testCase) => testCase.mode === 'PRO_INSTRUCTION_ONLY')
}
for (let index = cases.length - 1; index > 0; index -= 1) {
  const swap = crypto.randomInt(index + 1)
  ;[cases[index], cases[swap]] = [cases[swap], cases[index]]
}

await fsp.mkdir(outputRoot, { recursive: true })
const provider = new AliyunCosyVoiceProvider()
let voiceId = ''
let deleted = false
const generated: Array<Record<string, unknown>> = []
const startedAt = Date.now()
try {
  voiceId = await provider.enroll(referencePath, `proab${Date.now().toString().slice(-5)}`)
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index]
    const expression = buildEmotionExpressionPlan({ replyTone: testCase.tone, text: testCase.text, interactionState: null })
    const currentPlan = buildSpeechSynthesisPlan(testCase.tone, testCase.text, baseline, expression)
    const instruction = testCase.mode === 'PRO_INSTRUCTION_ONLY'
      ? conservativeInstructions[testCase.tone]
      : currentPlan.instruction
    const synthesisText = testCase.mode === 'PRO_INSTRUCTION_ONLY'
      ? normalizePlainTtsText(testCase.text)
      : currentPlan.text
    const callStartedAt = Date.now()
    const audio = await provider.synthesize(voiceId, synthesisText, {
      jobId: 'cosyvoice-pro-five-ab',
      messageId: testCase.id,
      instruction,
      ...(testCase.mode === 'CURRENT_FULL_CONTROL' ? {
        rate: currentPlan.rate,
        pitch: currentPlan.pitch,
        volume: currentPlan.volume,
        enableSsml: true,
      } : {}),
    })
    const label = String.fromCharCode(65 + index)
    const outputPath = path.join(outputRoot, `sample-${label}.wav`)
    await fsp.writeFile(outputPath, audio)
    const probe = await probeWav(outputPath)
    generated.push({
      blindLabel: label,
      ...testCase,
      outputPath,
      instruction,
      synthesisText,
      rate: testCase.mode === 'CURRENT_FULL_CONTROL' ? currentPlan.rate : 1,
      pitch: testCase.mode === 'CURRENT_FULL_CONTROL' ? currentPlan.pitch : 1,
      volume: testCase.mode === 'CURRENT_FULL_CONTROL' ? currentPlan.volume : 50,
      enableSsml: testCase.mode === 'CURRENT_FULL_CONTROL',
      durationMs: probe.durationMs,
      bytes: probe.bytes,
      elapsedMs: Date.now() - callStartedAt,
      sha256: crypto.createHash('sha256').update(audio).digest('hex'),
    })
  }
} finally {
  if (voiceId) {
    await provider.deleteVoice(voiceId)
    deleted = true
  }
}

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: provider.targetModel,
  referencePath,
  referenceQuality: quality,
  sameTemporaryVoiceIdForAllFive: true,
  seedControlAvailable: false,
  temporaryVoiceDeleted: deleted,
  totalMs: Date.now() - startedAt,
  generated,
  blindGate: {
    scoreEach: ['音色和年龄感像本人/40', '语速停顿重音像本人/30', '自然聊天不配音/20', '情绪与台词贴合/10'],
    pass: 'MIXED新方案>=90且胜旧方案；IRRITATED新方案>=88且胜旧方案；PLAIN>=90；三条新方案平均>=90。',
  },
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({
  status: deleted && generated.length === cases.length ? `${generated.length}_BLIND_SAMPLES_READY` : 'FAIL',
  outputRoot,
  temporaryVoiceDeleted: deleted,
  files: generated.map((row) => ({ blindLabel: row.blindLabel, durationMs: row.durationMs, elapsedMs: row.elapsedMs })),
}, null, 2))
