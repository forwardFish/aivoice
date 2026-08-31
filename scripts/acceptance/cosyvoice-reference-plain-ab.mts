import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputRoot = path.resolve(process.env.AIVOICE_REFERENCE_AB_OUTPUT || path.join(root, 'work/acceptance/cosyvoice-reference-plain-ab'))
const references = [
  { id: 'enhanced-20s', path: path.resolve(process.env.AIVOICE_REFERENCE_AB_ENHANCED || '') },
  { id: 'clean-9s', path: path.resolve(process.env.AIVOICE_REFERENCE_AB_CLEAN || '') },
]
for (const reference of references) if (!fs.existsSync(reference.path)) throw new Error(`missing ${reference.id}: ${reference.path}`)

const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(root, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
process.env.AIVOICE_TARGET_MODEL = 'cosyvoice-v3.5-plus'
process.env.AIVOICE_ENROLL_PREPROCESS = 'false'

const [{ AliyunCosyVoiceProvider }, { probeWav }] = await Promise.all([
  import('../../apps/worker/dist/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/dist/media/ffmpeg.js'),
])

const text = '知道了，你到了以后跟我说一声。'
if (crypto.randomInt(2)) references.reverse()
await fsp.mkdir(outputRoot, { recursive: true })
const generated: Array<Record<string, unknown>> = []

for (let index = 0; index < references.length; index += 1) {
  const reference = references[index]
  const provider = new AliyunCosyVoiceProvider()
  let voiceId = ''
  let deleted = false
  try {
    voiceId = await provider.enroll(reference.path, `refab${index}${Date.now().toString().slice(-4)}`)
    const startedAt = Date.now()
    const audio = await provider.synthesize(voiceId, text, {
      jobId: 'cosyvoice-reference-plain-ab',
      messageId: reference.id,
    })
    const label = String.fromCharCode(65 + index)
    const outputPath = path.join(outputRoot, `sample-${label}.wav`)
    await fsp.writeFile(outputPath, audio)
    const probe = await probeWav(outputPath)
    generated.push({
      blindLabel: label,
      referenceId: reference.id,
      referencePath: reference.path,
      outputPath,
      text,
      instruction: null,
      rate: null,
      pitch: null,
      volume: null,
      enableSsml: false,
      durationMs: probe.durationMs,
      elapsedMs: Date.now() - startedAt,
      sha256: crypto.createHash('sha256').update(audio).digest('hex'),
    })
  } finally {
    if (voiceId) {
      await provider.deleteVoice(voiceId)
      deleted = true
    }
    generated.push({ referenceId: reference.id, temporaryVoiceDeleted: deleted })
  }
}

await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: 'cosyvoice-v3.5-plus',
  sameText: text,
  control: 'NO_INSTRUCTION_NO_SSML_NO_NUMERIC_OVERRIDES',
  generated,
}, null, 2)}\n`)
console.log(JSON.stringify({
  status: generated.filter((row) => row.outputPath).length === 2 ? 'TWO_REFERENCE_BLIND_SAMPLES_READY' : 'FAIL',
  outputRoot,
  files: generated.filter((row) => row.outputPath).map((row) => ({ blindLabel: row.blindLabel, durationMs: row.durationMs, elapsedMs: row.elapsedMs })),
}, null, 2))
