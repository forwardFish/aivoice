import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'
import { serializePersonalityNote } from '../../apps/miniprogram/utils/personality.ts'
import { compileVoiceChatMessages as compileBefore } from '../../apps/worker/dist/chat/voice-chat-context.js'
import { compileVoiceChatMessages as compileAfter } from '../../apps/worker/src/chat/voice-chat-context.ts'
import { evaluateCharacterGenerationQuality, qualityRetryMessages } from '../../apps/worker/src/chat/generation-quality.ts'
import { parseMinimalCharacterTurnGeneration } from '../../apps/worker/src/chat/interaction-state.ts'
import { parseFirstStructuredJson } from '../../apps/worker/src/providers/structured-json.ts'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(projectRoot, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
const apiKey = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
const apiHost = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim().replace(/\/$/u, '')
const model = String(process.env.CHAT_MODEL || baseEnv.CHAT_MODEL || 'qwen3.8-max').trim()
const explicitPromptCache = process.env.AIVOICE_QWEN_EXPLICIT_PROMPT_CACHE === 'true'
if (!apiKey) throw new Error('DASHSCOPE_API_KEY is missing')

const userTurns = [
  '我今晚会晚一个小时到，刚才忙忘了跟你说。',
  '你别一上来就不高兴，我又不是故意的。',
  '确实是我没提前说，害你等了这么久，怪我。',
  '我现在出发，到了以后你想怎么安排？',
  '到了先抱一下，别还板着脸了。',
]
const profile = {
  voiceName: '小宁', ageYears: 24, gender: 'FEMALE' as const,
  userAgeYears: 26, relationshipType: 'PARTNER' as const, relationshipLabel: '', userAddress: '阿哲',
  background: '和男朋友在同一座城市生活。',
  relationshipNote: '两人是平等亲密关系，可以直接表达不满、需要和不同意见。解释、道歉和实际行动会影响情绪变化，但任何一方都不需要无条件服从或包办。',
  speechHabitNote: '说话口语化，通常一到三句，不使用心理分析、关系总结或客服式完整回答；有情绪时说具体事情，缓和时通过短句、行动需要、吐槽或恢复普通语气表现。',
  personalityNote: serializePersonalityNote({ selectedTagIds: ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'] }),
}

type HistoryTurn = {
  messageId: string
  mode: 'CHAT'
  inputText: string
  outputText: string
  interactionState: unknown
}
type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number; cache_creation_input_tokens?: number }
}
type Compiler = typeof compileAfter

function withExplicitCache(messages: Array<{ role: string; content: string; cacheControlAt?: number }>): Array<Record<string, unknown>> {
  return messages.map((message, index) => {
    const cacheControlAt = Number(message.cacheControlAt || 0)
    if (index !== 0 || cacheControlAt <= 0 || cacheControlAt > message.content.length) {
      return { role: message.role, content: message.content }
    }
    const dynamicSuffix = message.content.slice(cacheControlAt)
    return {
      role: message.role,
      content: [
        { type: 'text', text: message.content.slice(0, cacheControlAt), cache_control: { type: 'ephemeral' } },
        ...(dynamicSuffix ? [{ type: 'text', text: dynamicSuffix }] : []),
      ],
    }
  })
}

async function runLane(lane: 'before' | 'after', compile: Compiler) {
  const history: HistoryTurn[] = []
  const turns: Array<Record<string, unknown>> = []
  for (let index = 0; index < userTurns.length; index += 1) {
    const context = compile({
      structuredOutput: true,
      currentMessageId: `cache-ab-${lane}-${index + 1}`,
      ...profile,
      history,
      currentInput: userTurns[index],
    })
    const startedAt = Date.now()
    const attempts: Array<Record<string, unknown>> = []
    let finalQuality: ReturnType<typeof evaluateCharacterGenerationQuality> | null = null
    let retryReasons: string[] = []
    for (const attempt of [1, 2] as const) {
      const sourceMessages = attempt === 1 ? context.messages : qualityRetryMessages(context.messages, retryReasons)
      const requestMessages = lane === 'after' && explicitPromptCache ? withExplicitCache(sourceMessages) : sourceMessages
      const response = await fetch(`${apiHost}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          enable_thinking: false,
          preserve_thinking: false,
          temperature: 0.65,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`${lane} turn ${index + 1} attempt ${attempt} failed: ${(await response.text()).slice(0, 800)}`)
      const result = await response.json() as {
        choices?: Array<{ message?: { content?: string | Record<string, unknown> } }>
        usage?: Usage
      }
      const raw = result.choices?.[0]?.message?.content
      if (!raw) throw new Error(`${lane} turn ${index + 1} attempt ${attempt} returned no structured output`)
      const generation = parseMinimalCharacterTurnGeneration(typeof raw === 'string' ? parseFirstStructuredJson(raw) : raw)
      finalQuality = evaluateCharacterGenerationQuality({
        generation,
        currentUserText: userTurns[index],
        relationshipType: profile.relationshipType,
        subjectBackground: profile.background,
        recentUserInputs: history.map((turn) => turn.inputText),
        recentCharacterReplies: history.map((turn) => turn.outputText),
        currentTurn: context.currentTurn,
        recentTurns: context.recentTurns,
        previousState: context.previousInteractionState,
        control: context.runtimeDialogueControl,
        personalityTurnFocus: context.personalityTurnFocus,
        profile: {
          personalityNote: profile.personalityNote,
          speechHabitNote: profile.speechHabitNote,
          relationshipNote: profile.relationshipNote,
        },
      })
      const promptTokens = Number(result.usage?.prompt_tokens || 0)
      const cachedTokens = Math.min(promptTokens, Number(result.usage?.prompt_tokens_details?.cached_tokens || 0))
      const cacheCreationTokens = Math.min(
        Math.max(0, promptTokens - cachedTokens),
        Number(result.usage?.prompt_tokens_details?.cache_creation_input_tokens || 0),
      )
      const ordinaryTokens = Math.max(0, promptTokens - cachedTokens - cacheCreationTokens)
      attempts.push({
        attempt,
        promptTokens,
        cachedTokens,
        cacheCreationTokens,
        cacheHitRatio: promptTokens > 0 ? Number((cachedTokens / promptTokens).toFixed(4)) : 0,
        completionTokens: Number(result.usage?.completion_tokens || 0),
        effectiveInputCostRmb: Number(((ordinaryTokens * 12 + cachedTokens * 1.5 + cacheCreationTokens * 15) / 1_000_000).toFixed(6)),
        uncachedInputCostRmb: Number((promptTokens * 12 / 1_000_000).toFixed(6)),
        reply: finalQuality.outputText,
        qualitySignals: finalQuality.qualitySignals,
        retryReasons: finalQuality.retryReasons,
      })
      retryReasons = finalQuality.retryReasons
      if (!retryReasons.length) break
    }
    if (!finalQuality) throw new Error(`${lane} turn ${index + 1} produced no evaluated result`)
    const sumAttempt = (field: string) => attempts.reduce((total, attempt) => total + Number(attempt[field] || 0), 0)
    const promptTokens = sumAttempt('promptTokens')
    const cachedTokens = sumAttempt('cachedTokens')
    turns.push({
      turn: index + 1,
      elapsedMs: Date.now() - startedAt,
      promptTokens,
      cachedTokens,
      cacheHitRatio: promptTokens > 0 ? Number((cachedTokens / promptTokens).toFixed(4)) : 0,
      completionTokens: sumAttempt('completionTokens'),
      effectiveInputCostRmb: Number(sumAttempt('effectiveInputCostRmb').toFixed(6)),
      uncachedInputCostRmb: Number(sumAttempt('uncachedInputCostRmb').toFixed(6)),
      systemMessageCount: context.messages.filter((message) => message.role === 'system').length,
      attemptCount: attempts.length,
      attempts,
      reply: finalQuality.outputText,
      replyTone: finalQuality.replyTone,
      actionStance: finalQuality.interactionState.action.stance,
      personalityPhase: context.personalityTurnFocus?.phase || null,
      qualitySignals: finalQuality.qualitySignals,
      retryReasons: finalQuality.retryReasons,
    })
    history.push({
      messageId: `cache-ab-${lane}-${index + 1}`,
      mode: 'CHAT',
      inputText: userTurns[index],
      outputText: finalQuality.outputText,
      interactionState: finalQuality.interactionState,
    })
  }
  const sum = (field: string) => turns.reduce((total, turn) => total + Number(turn[field] || 0), 0)
  const warmTurns = turns.slice(1)
  const warmPromptTokens = warmTurns.reduce((total, turn) => total + Number(turn.promptTokens || 0), 0)
  const warmCachedTokens = warmTurns.reduce((total, turn) => total + Number(turn.cachedTokens || 0), 0)
  return {
    lane,
    totals: {
      promptTokens: sum('promptTokens'),
      cachedTokens: sum('cachedTokens'),
      effectiveInputCostRmb: Number(sum('effectiveInputCostRmb').toFixed(6)),
      uncachedInputCostRmb: Number(sum('uncachedInputCostRmb').toFixed(6)),
      qualityRetryReasonCount: turns.reduce((total, turn) => total + (turn.retryReasons as string[]).length, 0),
    },
    warmCacheHitRatio: warmPromptTokens > 0 ? Number((warmCachedTokens / warmPromptTokens).toFixed(4)) : 0,
    turns,
  }
}

const before = await runLane('before', compileBefore as Compiler)
const after = await runLane('after', compileAfter)
const costReductionRatio = after.totals.uncachedInputCostRmb > 0
  ? Number((1 - after.totals.effectiveInputCostRmb / after.totals.uncachedInputCostRmb).toFixed(4))
  : 0
const report = {
  generatedAt: new Date().toISOString(),
  model,
  cacheMode: explicitPromptCache ? 'explicit' : 'implicit',
  invariant: 'Prompt wording is unchanged; only the early server-generated runtime-control cluster moves behind the stable rules so the stable prefix can be cached.',
  pricing: { normalInputRmbPerMillionTokens: 12, cachedInputRmbPerMillionTokens: 1.5 },
  before,
  after,
  comparison: {
    beforeQualityRetryReasonCount: before.totals.qualityRetryReasonCount,
    afterQualityRetryReasonCount: after.totals.qualityRetryReasonCount,
    afterNotWorseByDeterministicGate: after.totals.qualityRetryReasonCount <= before.totals.qualityRetryReasonCount,
    afterWarmCacheHitRatio: after.warmCacheHitRatio,
    inputCostReductionRatio: costReductionRatio,
    qualityGatePassed: after.totals.qualityRetryReasonCount === 0
      && after.totals.qualityRetryReasonCount <= before.totals.qualityRetryReasonCount,
    safeCostReductionObserved: costReductionRatio > 0,
    cacheAcceptancePassed: after.warmCacheHitRatio >= 0.6 && costReductionRatio >= 0.5,
  },
}
const outputRoot = path.join(projectRoot, 'work/acceptance/qwen-context-cache-ab')
await fsp.mkdir(outputRoot, { recursive: true })
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
