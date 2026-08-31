import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const referencePath = path.resolve(process.env.AIVOICE_AGE_SCENE_REFERENCE || '')
const outputRoot = path.resolve(process.env.AIVOICE_AGE_SCENE_OUTPUT || path.join(root, 'work/acceptance/cosyvoice-age-scene-three'))
if (!fs.existsSync(referencePath)) throw new Error(`reference missing: ${referencePath}`)

const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(root, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus'
process.env.AIVOICE_ENROLL_PREPROCESS = 'false'

const [{ AliyunCosyVoiceProvider }, { probeWav }, { instructionWeightedLength }] = await Promise.all([
  import('../../apps/worker/dist/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/dist/media/ffmpeg.js'),
  import('../../apps/worker/dist/speech-instruction.js'),
])

const baseCases = [
  {
    id: 'plain-no-instruction',
    text: '妈妈，我知道啦，等一下就去。',
    instruction: '',
  },
  {
    id: 'plain-family-conversation',
    text: '妈妈，我知道啦，等一下就去。',
    instruction: '像在家里跟熟悉的妈妈随口说，语气松弛，停顿自然，不朗读、不表演。',
  },
  {
    id: 'mild-irritated-family-conversation',
    text: '妈妈，我都说等一下了，你别一直催嘛。',
    instruction: '像在家里跟熟悉的妈妈说话，有点不耐烦但不喊，语速自然，不朗读。',
  },
]
const refinementCases = [
  {
    id: 'plain-short-positive-scene',
    text: '妈妈，我知道啦，等一下就去。',
    instruction: '像在家里随口回应妈妈，保持原来的语速和语调，停顿自然。',
  },
  {
    id: 'irritated-text-scene-only',
    text: '妈妈，我都说等一下了，你别一直催嘛。',
    instruction: '像在家里随口跟妈妈说话，保持原来的语速和语调，停顿自然。',
  },
]
const cases = process.env.AIVOICE_AGE_SCENE_REFINEMENT === '1' ? refinementCases : baseCases
for (const row of cases) if (row.instruction && instructionWeightedLength(row.instruction) > 100) throw new Error('instruction too long')

await fsp.mkdir(outputRoot, { recursive: true })
const provider = new AliyunCosyVoiceProvider()
let voiceId = ''
let deleted = false
const generated: Array<Record<string, unknown>> = []
try {
  voiceId = await provider.enroll(referencePath, `scene${Date.now().toString().slice(-5)}`)
  for (let index = 0; index < cases.length; index += 1) {
    const row = cases[index]
    const startedAt = Date.now()
    const audio = await provider.synthesize(voiceId, row.text, {
      jobId: 'cosyvoice-age-scene-three',
      messageId: row.id,
      ...(row.instruction ? { instruction: row.instruction } : {}),
    })
    const label = String.fromCharCode(65 + index)
    const outputPath = path.join(outputRoot, `sample-${label}.wav`)
    await fsp.writeFile(outputPath, audio)
    const probe = await probeWav(outputPath)
    generated.push({ blindLabel: label, ...row, outputPath, durationMs: probe.durationMs, elapsedMs: Date.now() - startedAt })
  }
} finally {
  if (voiceId) {
    await provider.deleteVoice(voiceId)
    deleted = true
  }
}

await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  schemaVersion: 1,
  model: provider.targetModel,
  referencePath,
  sameVoiceId: true,
  temporaryVoiceDeleted: deleted,
  control: 'RAW_TEXT_OPTIONAL_SCENE_INSTRUCTION_NO_SSML_NO_NUMERIC_OVERRIDES',
  generated,
}, null, 2)}\n`)
console.log(JSON.stringify({ status: deleted && generated.length === cases.length ? `${generated.length}_AGE_SCENE_SAMPLES_READY` : 'FAIL', outputRoot, generated }, null, 2))
