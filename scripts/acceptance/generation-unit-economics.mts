import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'
import { serializePersonalityNote } from '../../apps/miniprogram/utils/personality.ts'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(projectRoot, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/u, '')
const model = String(process.env.CHAT_MODEL || 'qwen3.8-max').trim()
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing')

const [contextModule, stateModule, jsonModule] = await Promise.all([
  import('../../apps/worker/dist/chat/voice-chat-context.js'),
  import('../../apps/worker/dist/chat/interaction-state.js'),
  import('../../apps/worker/dist/providers/structured-json.js')
])
const { compileVoiceChatMessages } = contextModule
const { CHARACTER_TURN_JSON_SCHEMA, parseCharacterTurnGeneration } = stateModule
const { parseStrictStructuredJson } = jsonModule

const userTurns = [
  '我今晚会晚一个小时到，刚才忙忘了跟你说。',
  '你别一上来就不高兴，我又不是故意的。',
  '确实是我没提前说，害你等了这么久，怪我。',
  '我现在出发，到了以后你想怎么安排？',
  '到了先抱一下，别还板着脸了。'
]
const profile = {
  voiceName: '小宁', ageYears: 24, gender: 'FEMALE' as const,
  userAgeYears: 26, relationshipType: 'PARTNER' as const, relationshipLabel: '', userAddress: '阿哲',
  background: '和男朋友在同一座城市生活。',
  relationshipNote: '两人是平等亲密关系，可以直接表达不满、需要和不同意见。解释、道歉和实际行动会影响情绪变化，但任何一方都不需要无条件服从或包办。',
  speechHabitNote: '说话口语化，通常一到三句，不使用心理分析、关系总结或客服式完整回答；有情绪时说具体事情，缓和时通过短句、行动需要、吐槽或恢复普通语气表现。',
  personalityNote: serializePersonalityNote({ selectedTagIds: ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'] })
}

type HistoryTurn = { messageId: string; mode: 'CHAT'; inputText: string; outputText: string; interactionState: unknown }
const history: HistoryTurn[] = []
const turns: Array<Record<string, unknown>> = []
for (let index = 0; index < userTurns.length; index += 1) {
  const context = compileVoiceChatMessages({
    structuredOutput: true,
    currentMessageId: `cost-probe-${index + 1}`,
    ...profile,
    history,
    currentInput: userTurns[index]
  })
  const startedAt = Date.now()
  const response = await fetch(`${apiHost}/compatible-mode/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: context.messages,
      enable_thinking: false,
      preserve_thinking: false,
      temperature: 0.65,
      response_format: { type: 'json_schema', json_schema: CHARACTER_TURN_JSON_SCHEMA }
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok) throw new Error(`cost probe failed: ${(await response.text()).slice(0, 800)}`)
  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string | Record<string, unknown> } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number; total_tokens?: number }
  }
  const raw = result.choices?.[0]?.message?.content
  if (!raw) throw new Error('cost probe returned no structured output')
  const generation = parseCharacterTurnGeneration(typeof raw === 'string' ? parseStrictStructuredJson(raw) : raw)
  const inputTokens = Number(result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? 0)
  const outputTokens = Number(result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0)
  const replyCharacters = Array.from(generation.reply).length
  turns.push({
    turn: index + 1,
    inputTokens,
    outputTokens,
    totalTokens: Number(result.usage?.total_tokens || inputTokens + outputTokens),
    replyCharacters,
    textCostRmb: Number((inputTokens * 12 / 1_000_000 + outputTokens * 36 / 1_000_000).toFixed(6)),
    voiceCostRmb: Number((replyCharacters * 0.8 / 10_000).toFixed(6)),
    elapsedMs: Date.now() - startedAt,
    reply: generation.reply
  })
  history.push({
    messageId: `cost-probe-${index + 1}`,
    mode: 'CHAT',
    inputText: userTurns[index],
    outputText: generation.reply,
    interactionState: generation.interactionState
  })
}

const sum = (field: string) => turns.reduce((total, turn) => total + Number(turn[field] || 0), 0)
const report = {
  generatedAt: new Date().toISOString(),
  model,
  pricing: {
    textInputRmbPerMillionTokens: 12,
    textOutputRmbPerMillionTokens: 36,
    cosyvoiceRmbPerTenThousandCharacters: 0.8,
    packageRevenueRmb: 9.9,
    packageGenerations: 50,
    grossRevenuePerGenerationRmb: 0.198
  },
  totals: {
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    replyCharacters: sum('replyCharacters'),
    textCostRmb: Number(sum('textCostRmb').toFixed(6)),
    voiceCostRmb: Number(sum('voiceCostRmb').toFixed(6))
  },
  averages: {
    inputTokens: Math.round(sum('inputTokens') / turns.length),
    outputTokens: Math.round(sum('outputTokens') / turns.length),
    replyCharacters: Number((sum('replyCharacters') / turns.length).toFixed(1)),
    textCostRmb: Number((sum('textCostRmb') / turns.length).toFixed(6)),
    voiceCostRmb: Number((sum('voiceCostRmb') / turns.length).toFixed(6)),
    modelAndVoiceCostRmb: Number(((sum('textCostRmb') + sum('voiceCostRmb')) / turns.length).toFixed(6))
  },
  turns
}
const outputRoot = path.join(projectRoot, 'work/acceptance/generation-unit-economics')
await fsp.mkdir(outputRoot, { recursive: true })
await fsp.writeFile(path.join(outputRoot, 'qwen3.8-max.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
