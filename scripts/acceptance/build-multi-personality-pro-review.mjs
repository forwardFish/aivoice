import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const resultPath = path.resolve(process.env.AIVOICE_PERSONALITY_RESULT
  || path.join(projectRoot, 'work/acceptance/multi-personality-five-dialogues/results.json'))
const outputPath = path.resolve(process.env.AIVOICE_PERSONALITY_PRO_REVIEW
  || path.join(path.dirname(resultPath), 'chatgpt-pro-review.md'))
const report = JSON.parse(await fs.readFile(resultPath, 'utf8'))

const lines = [
  '# 请严格评审：同年龄、同性别、同关系的五种多性格对话', '',
  '你是“那年的TA”微信小程序真人感验收人。下面是同一个24岁女性伴侣、面对同一个26岁男性伴侣、使用完全相同五轮用户输入的五组真实Qwen输出。唯一变化是用户多选的四个性格标签。', '',
  '当前约束：MVP；现有单次Qwen调用；只能修改现有标签行为定义、组合解释或现有Prompt；不得增加新页面、数据库、长期记忆、第二次模型调用、候选重排模型或复杂规则引擎。', '',
  '请不要因为自动预检、结构正确或五组不同就给高分。只评用户真正看到的25条回复。', '',
  '## 评分标准', '',
  '- 每组独立满分100：已选性格还原30、伴侣关系真实性20、情绪因果20、口语自然15、非助手化15。',
  '- 每组必须达到97分才算通过，不能用平均分掩盖任何一组。',
  '- 至少3个已选特点应在五轮内自然可感知；每轮最多表现2个特点。',
  '- 严查：编造当前场景事实、模板女朋友、过度顺从、随机发火、情绪恢复不符合标签、标签只写在Prompt但没有进入台词、不同人格最后说成同一种话。', '',
  '## 你必须返回', '',
  '1. 五组逐项评分及总分。',
  '2. 每组逐轮指出最明显的自然与不自然之处，引用具体回复。',
  '3. 判断每个已选标签是否真正被还原；没有触发机会时明确说明，不得硬凑。',
  '4. 跨组比较：哪些差异确实来自性格，哪些只是随机措辞。',
  '5. 列出所有编造事实和隐含共同经历。',
  '6. 只给最小修复：分别写出应修改的“标签行为定义”“组合解释”“通用Prompt句子”，说明改动作用；不得写测试场景专用台词。',
  '7. 给出下一轮仍然使用这五句输入时，严格可判定的通过条件。',
  '8. 最后明确回答：当前是否已有任何一组达到97分，整体是否可以进入MVP。', '',
  '## 本轮人工已发现但不要受其限制的问题', '',
  '- “我这边时间就空悬了”不像自然口语。',
  '- “脸还没完全好呢”像为了表演嘴硬而拼出来的句子。',
  '- 温和型容易正确但平，性格只剩礼貌和边界说明。',
  '- 多组在修复后都落到吃饭、抱一下等相似动作，需判断是合理共同场景还是人格差异不足。',
  '- 请继续寻找我们没有列出的缺陷，不要只复述以上四点。', '',
  '## 固定五轮用户输入', '',
  ...report.fixedUserTurns.map((turn, index) => `${index + 1}. ${turn}`), '',
  `## 自动统计（不能作为真人感加分）`, '',
  '```json', JSON.stringify(report.metrics, null, 2), '```', '',
  ...report.scenarios.flatMap((scenario) => [
    `## ${scenario.label}`, '',
    `- 已选标签：${scenario.selectedTagIds.join('、')}`,
    `- 预期差异：${scenario.expected}`,
    `- personalityNote：${scenario.personalityNote}`, '',
    ...scenario.turns.flatMap((turn) => [
      `### 第${turn.turn}轮`, '',
      `- 用户：${turn.userText}`,
      `- 人物：${turn.reply}`,
      `- 语气/动作：${turn.replyTone}/${turn.interactionState.action.stance}`,
      `- 自动信号：${[...turn.hardHits, ...turn.softSignals].join('、') || '无'}`, ''
    ])
  ])
]

await fs.writeFile(outputPath, `${lines.join('\n')}\n`)
console.log(outputPath)
