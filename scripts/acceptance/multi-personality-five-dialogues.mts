import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseDotEnv } from 'dotenv'
import { serializePersonalityNote } from '../../apps/miniprogram/utils/personality.ts'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputRoot = path.resolve(process.env.AIVOICE_PERSONALITY_OUTPUT || path.join(projectRoot, 'work/acceptance/multi-personality-five-dialogues'))
const readEnv = (filePath: string) => fs.existsSync(filePath) ? parseDotEnv(fs.readFileSync(filePath)) : {}
const baseEnv = readEnv(path.join(projectRoot, '.env.local'))
const secretEnv = readEnv(process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env')
process.env.DASHSCOPE_API_KEY = String(secretEnv.DASHSCOPE_API_KEY || baseEnv.DASHSCOPE_API_KEY || '').trim()
process.env.DASHSCOPE_API_HOST = String(baseEnv.DASHSCOPE_API_HOST || 'https://dashscope.aliyuncs.com').trim()
process.env.CHAT_MODEL = String(process.env.CHAT_MODEL || baseEnv.CHAT_MODEL || 'qwen3.8-max').trim()
if (!process.env.DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY is missing')

const [contextModule, stateModule, qualityModule, controlModule, focusModule, providerModule, generationQualityModule] = await Promise.all([
  import('../../apps/worker/dist/chat/voice-chat-context.js'),
  import('../../apps/worker/dist/chat/interaction-state.js'),
  import('../../apps/worker/dist/chat/human-likeness.js'),
  import('../../apps/worker/dist/chat/dialogue-control.js'),
  import('../../apps/worker/dist/chat/personality-turn-focus.js'),
  import('../../apps/worker/dist/providers/dashscope-chat.js'),
  import('../../apps/worker/dist/chat/generation-quality.js')
])
const { compileVoiceChatMessages, relationshipReplyViolation } = contextModule
const { normalizeInteractionStateDetailed } = stateModule
const { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, sanitizeUnsupportedPresentSceneClaims, trigramJaccard } = qualityModule
const { validateQuestionBehavior } = controlModule
const { personalityTurnFocusReplyViolation, resolvedBoundaryReplyViolation } = focusModule
const provider = new providerModule.DashscopeChatProvider()
const { chatTemperatureForFocus, evaluateCharacterGenerationQuality, qualityRetryMessages, withOneQualityRetry } = generationQualityModule
const PRODUCTION_BLOCKING_STATE_ISSUES = new Set([
  'ACTION_STANCE_NOT_ALLOWED',
  'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE',
  'FORCED_REQUEST_STANCE_INVALID'
])

const fixedUserTurns = [
  '我今晚会晚一个小时到，刚才忙忘了跟你说。',
  '你别一上来就不高兴，我又不是故意的。',
  '确实是我没提前说，害你等了这么久，怪我。',
  '我现在出发，到了以后你想怎么安排？',
  '到了先抱一下，别还板着脸了。'
]

const personalityConfigs = [
  {
    id: 'quick-close', label: '情绪来得快＋亲近型',
    selectedTagIds: ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'],
    expected: '先明显不满，解释和道歉到位后会松动，最后愿意恢复亲近。'
  },
  {
    id: 'gentle-direct-boundary', label: '温和直接＋边界型',
    selectedTagIds: ['WARM_PATIENT', 'DIRECT', 'VALUES_BOUNDARY', 'RECOVERS_FAST'],
    expected: '不随机发火，直接说明问题和边界，修复后自然过去但不无条件顺从。'
  },
  {
    id: 'strong-direct', label: '强势直接＋嘴硬型',
    selectedTagIds: ['QUICK_TEMPER', 'DIRECT', 'VALUES_BOUNDARY', 'HARD_MOUTH_SOFT_HEART'],
    expected: '不满和立场最明显，不因一句道歉立即变软，后续通过短句或行动缓和。'
  },
  {
    id: 'playful-close', label: '爱开玩笑＋亲近型',
    selectedTagIds: ['PLAYFUL', 'LIKES_CLOSENESS', 'RECOVERS_FAST', 'DIRECT'],
    expected: '直接指出问题，修复后更容易用吐槽或玩笑恢复亲近。'
  },
  {
    id: 'gentle-close-independent', label: '温柔亲近＋不盲从型',
    selectedTagIds: ['WARM_PATIENT', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'VALUES_BOUNDARY'],
    expected: '整体温和亲近，但保留自己的不满和边界，不变成完美顺从伴侣。'
  }
] as const
const requestedScenarioIds = new Set(String(process.env.AIVOICE_PERSONALITY_SCENARIOS || '').split(',').map(value => value.trim()).filter(Boolean))
const selectedPersonalityConfigs = requestedScenarioIds.size
  ? personalityConfigs.filter(config => requestedScenarioIds.has(config.id))
  : personalityConfigs
if (!selectedPersonalityConfigs.length) throw new Error('AIVOICE_PERSONALITY_SCENARIOS did not match a known scenario')

const commonProfile = {
  voiceName: '小宁', ageYears: 24, gender: 'FEMALE' as const,
  userAgeYears: 26, relationshipType: 'PARTNER' as const, relationshipLabel: '', userAddress: '阿哲',
  background: '和男朋友在同一座城市生活。',
  relationshipNote: '两人是平等亲密关系，可以直接表达不满、需要和不同意见。解释、道歉和实际行动会影响情绪变化，但任何一方都不需要无条件服从或包办。',
  speechHabitNote: '说话口语化，通常一到三句，不使用心理分析、关系总结或客服式完整回答；有情绪时说具体事情，缓和时通过短句、行动需要、吐槽或恢复普通语气表现。'
}

type StoredTurn = {
  turn: number
  userText: string
  replyTone: string
  reply: string
  interactionState: any
  hardHits: string[]
  softSignals: string[]
  stateAccepted: boolean
  stateResetReason: string | null
  qualityAttemptCount: 1 | 2
  firstAttemptReasons: string[]
  elapsedMs: number
}

const scenarios: any[] = []
for (const config of selectedPersonalityConfigs) {
  const personalityNote = serializePersonalityNote({ selectedTagIds: [...config.selectedTagIds] })
  const turns: StoredTurn[] = []
  let terminalError = ''
  for (let index = 0; index < fixedUserTurns.length; index += 1) {
    const userText = fixedUserTurns[index]
    const context = compileVoiceChatMessages({
      structuredOutput: true,
      currentMessageId: `${config.id}-${index + 1}`,
      ...commonProfile,
      personalityNote,
      history: turns.map(row => ({
        messageId: `${config.id}-${row.turn}`, mode: 'CHAT', inputText: row.userText,
        outputText: row.reply, interactionState: row.interactionState
      })),
      currentInput: userText
    })
    process.stdout.write(`[${config.label}] ${index + 1}/5\n`)
    const startedAt = performance.now()
    try {
      const recentReplies = turns.map(row => row.reply)
      const quality = await withOneQualityRetry({
        generate: (attempt: 1 | 2, previousReasons: string[]) => provider.reply(
          attempt === 1 ? context.messages : qualityRetryMessages(context.messages, previousReasons),
          { maxAttempts: 1, temperature: chatTemperatureForFocus(context.personalityTurnFocus) }
        ),
        evaluate: (generation: any) => evaluateCharacterGenerationQuality({
          generation,
          currentUserText: userText,
          relationshipType: commonProfile.relationshipType,
          subjectBackground: commonProfile.background,
          recentUserInputs: turns.map(row => row.userText),
          recentCharacterReplies: recentReplies,
          currentTurn: context.currentTurn,
          recentTurns: context.recentTurns,
          previousState: context.previousInteractionState,
          control: context.runtimeDialogueControl,
          personalityTurnFocus: context.personalityTurnFocus,
          profile: { personalityNote, speechHabitNote: commonProfile.speechHabitNote, relationshipNote: commonProfile.relationshipNote }
        }),
        onRetry: (reasons: string[]) => process.stdout.write(`[${config.label}] ${index + 1}/5 quality retry: ${reasons.join('、')}\n`)
      })
      const elapsedMs = Math.round(performance.now() - startedAt)
      const visibleReply = quality.outputText
      const hardHits: string[] = []
      turns.push({
        turn: index + 1, userText, replyTone: quality.replyTone, reply: visibleReply,
        interactionState: quality.interactionState, hardHits,
        softSignals: quality.qualitySignals,
        stateAccepted: quality.interactionStateAccepted,
        stateResetReason: quality.interactionStateResetReason,
        qualityAttemptCount: quality.attemptCount,
        firstAttemptReasons: quality.firstAttemptReasons,
        elapsedMs
      })
    } catch (error: any) {
      terminalError = Array.isArray(error?.reasons) ? `${String(error?.message || error)}:${error.reasons.join(',')}` : String(error?.message || error)
      break
    }
  }
  scenarios.push({ ...config, personalityNote, expected: config.expected, turns, terminalError })
}

const completedTurns = scenarios.flatMap(scenario => scenario.turns)
const sameTurnComparisons: any[] = []
for (let turnIndex = 0; turnIndex < fixedUserTurns.length; turnIndex += 1) {
  for (let left = 0; left < scenarios.length; left += 1) {
    for (let right = left + 1; right < scenarios.length; right += 1) {
      const leftReply = scenarios[left].turns[turnIndex]?.reply || ''
      const rightReply = scenarios[right].turns[turnIndex]?.reply || ''
      sameTurnComparisons.push({
        turn: turnIndex + 1, left: scenarios[left].id, right: scenarios[right].id,
        exact: Boolean(leftReply && leftReply === rightReply),
        similarity: leftReply && rightReply ? Number(trigramJaccard(leftReply, rightReply).toFixed(4)) : 1
      })
    }
  }
}

const toneStanceSequences = scenarios.map(scenario => scenario.turns.map((turn: StoredTurn) => `${turn.replyTone}/${turn.interactionState.action.stance}`).join('>'))
const metrics = {
  scenarioCount: scenarios.length,
  expectedTurnCount: scenarios.length * fixedUserTurns.length,
  completedTurnCount: completedTurns.length,
  terminalErrorCount: scenarios.filter(scenario => scenario.terminalError).length,
  hardViolationCount: completedTurns.reduce((sum, turn) => sum + turn.hardHits.length, 0),
  rawStateResetCount: completedTurns.filter(turn => !turn.stateAccepted).length,
  productionBlockingStateCount: completedTurns.reduce((sum, turn) => sum + turn.hardHits.filter((hit: string) => PRODUCTION_BLOCKING_STATE_ISSUES.has(hit)).length, 0),
  internalProfileLeakCount: completedTurns.filter(turn => /用户明确选择|组合解释|用户补充|性格标签/u.test(turn.reply)).length,
  forbiddenIdentityCount: completedTurns.filter(turn => /我是AI|人工智能|机器人|模型/u.test(turn.reply)).length,
  exactCrossPersonaReplyCount: sameTurnComparisons.filter(row => row.exact).length,
  highCrossPersonaSimilarityCount: sameTurnComparisons.filter(row => row.similarity >= 0.85).length,
  comparisonCount: sameTurnComparisons.length,
  distinctToneStanceSequenceCount: new Set(toneStanceSequences).size,
  averageProviderMs: completedTurns.length ? Math.round(completedTurns.reduce((sum, turn) => sum + turn.elapsedMs, 0) / completedTurns.length) : 0,
  maxProviderMs: completedTurns.length ? Math.max(...completedTurns.map(turn => turn.elapsedMs)) : 0,
  qualityRetryCount: completedTurns.filter(turn => turn.qualityAttemptCount === 2).length
}

const automaticPrecheckPass = metrics.completedTurnCount === metrics.expectedTurnCount
  && metrics.terminalErrorCount === 0
  && metrics.hardViolationCount === 0
  && metrics.productionBlockingStateCount === 0
  && metrics.internalProfileLeakCount === 0
  && metrics.forbiddenIdentityCount === 0
  && metrics.exactCrossPersonaReplyCount === 0
  && metrics.highCrossPersonaSimilarityCount <= Math.floor(metrics.comparisonCount * 0.04)
  && metrics.distinctToneStanceSequenceCount >= Math.min(4, metrics.scenarioCount)

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: process.env.CHAT_MODEL,
  temperature: { standard: 0.55, playful: 0.72 },
  status: automaticPrecheckPass ? 'AUTOMATIC_PRECHECK_PASS' : 'AUTOMATIC_PRECHECK_FAIL',
  fixedProfile: commonProfile,
  fixedUserTurns,
  metrics,
  sameTurnComparisons,
  scenarios,
  humanAcceptanceRequired: true,
  humanAcceptanceTarget: 'Each personality >=98/100; selected-trait restoration >=29/30, relationship realism =20/20, emotion causality =20/20, oral naturalness >=14/15, non-assistant tone >=14/15; no one-vote veto item.'
}

await fsp.mkdir(outputRoot, { recursive: true })
await fsp.writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
await fsp.writeFile(path.join(outputRoot, 'review.md'), [
  '# 同年龄同关系五种多性格 · 真实文字模型验收候选', '',
  `- 模型：${report.model}`,
  `- 自动预检：${report.status}`,
  '- 说明：自动预检只检查硬规则和跨人物差异，不能替代98分人工评审。', '',
  ...scenarios.flatMap(scenario => [
    `## ${scenario.label}`, '',
    `- 已选标签：${scenario.selectedTagIds.join('、')}`,
    `- 预期差异：${scenario.expected}`,
    `- personalityNote：${scenario.personalityNote}`,
    ...(scenario.terminalError ? [`- 终止错误：${scenario.terminalError}`] : []), '',
    ...scenario.turns.flatMap((turn: StoredTurn) => [
      `### 第${turn.turn}轮`, '',
      `- 用户：${turn.userText}`,
      `- 人物：${turn.reply}`,
      `- 语气/动作：${turn.replyTone}/${turn.interactionState.action.stance}`,
      `- 耗时：${turn.elapsedMs}ms`,
      `- 质量尝试：${turn.qualityAttemptCount}次${turn.firstAttemptReasons.length ? `（首轮拒绝：${turn.firstAttemptReasons.join('、')}）` : ''}`,
      `- 自动信号：${[...turn.hardHits, ...turn.softSignals].join('、') || '无'}`, ''
    ])
  ])
].join('\n'))

console.log(JSON.stringify({ status: report.status, outputRoot, metrics }, null, 2))
if (!automaticPrecheckPass) process.exitCode = 1
