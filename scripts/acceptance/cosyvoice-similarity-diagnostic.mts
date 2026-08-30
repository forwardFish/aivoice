import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const referencePath = path.resolve(String(process.env.AIVOICE_EMOTION_REFERENCE || '').trim())
if (!process.env.AIVOICE_EMOTION_REFERENCE || !fs.existsSync(referencePath)) {
  throw new Error('AIVOICE_EMOTION_REFERENCE must point to the consented real-person WAV')
}
const outputRoot = path.resolve(process.env.AIVOICE_SIMILARITY_OUTPUT
  || path.join(projectRoot, 'work/acceptance/cosyvoice-similarity-diagnostic'))
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(projectRoot, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY is missing')

const [{ AliyunCosyVoiceProvider }, { buildSpeechInstruction, buildSpeechSynthesisPlan }, { probeWav }] = await Promise.all([
  import('../../apps/worker/dist/providers/aliyun-cosyvoice.js'),
  import('../../apps/worker/dist/speech-instruction.js'),
  import('../../apps/worker/dist/media/ffmpeg.js')
])

const text = String(process.env.AIVOICE_SIMILARITY_TEXT || '你到了以后先过来找我，我们再慢慢说。').trim()
const baselineOnly = process.env.AIVOICE_SIMILARITY_BASELINE_ONLY === '1'
const models = ['cosyvoice-v3.5-flash', 'cosyvoice-v3.5-plus'] as const
const generated: Array<Record<string, unknown>> = []
await fsp.mkdir(outputRoot, { recursive: true })

for (const model of models) {
  process.env.AIVOICE_TARGET_MODEL = model
  const provider = new AliyunCosyVoiceProvider()
  let voiceId = ''
  let deleted = false
  try {
    voiceId = await provider.enroll(referencePath, `${model.includes('plus') ? 'simplus' : 'simflash'}${Date.now().toString().slice(-2)}`)
    const plan = buildSpeechSynthesisPlan('PLAIN', text)
    const variants = [
      { id: 'baseline', synthesisText: text, options: {} },
      { id: 'instruction-only', synthesisText: text, options: { instruction: buildSpeechInstruction('PLAIN') } },
      {
        id: 'ssml-plan', synthesisText: plan.text,
        options: { instruction: plan.instruction, rate: plan.rate, pitch: plan.pitch, volume: plan.volume, enableSsml: plan.enableSsml }
      }
    ].filter(variant => !baselineOnly || variant.id === 'baseline')
    for (const variant of variants) {
      const startedAt = Date.now()
      const audio = await provider.synthesize(voiceId, variant.synthesisText, {
        jobId: 'similarity-diagnostic', messageId: `${model}-${variant.id}`, ...variant.options
      })
      const fileName = `${model.replaceAll('.', '-')}-${variant.id}.wav`
      const outputPath = path.join(outputRoot, fileName)
      await fsp.writeFile(outputPath, audio)
      const probe = await probeWav(outputPath)
      generated.push({
        model, variant: variant.id, text, synthesisText: variant.synthesisText,
        outputPath, durationMs: probe.durationMs, bytes: probe.bytes,
        elapsedMs: Date.now() - startedAt,
        sha256: crypto.createHash('sha256').update(audio).digest('hex')
      })
    }
  } finally {
    if (voiceId) {
      await provider.deleteVoice(voiceId)
      deleted = true
    }
    generated.push({ model, temporaryVoiceDeleted: deleted })
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  referencePath,
  referenceDurationMs: (await probeWav(referencePath)).durationMs,
  text,
  generated,
  interpretation: {
    baselineDiffers: 'If baseline already differs from the source speaker, cloning/model quality is the limiting factor.',
    instructionOnlyDiffers: 'If instruction-only drifts but baseline does not, natural-language style control changes perceived identity.',
    ssmlPlanDiffers: 'If only ssml-plan drifts, rate/pitch/pause processing is too strong.',
    plusImproves: 'If Plus baseline is closer than Flash baseline, prefer Plus despite its small price premium.'
  }
}
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ status: 'GENERATED_NEEDS_OWNER_LISTENING', outputRoot, files: generated.filter(row => row.outputPath) }, null, 2))
