import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourcePath = path.join(projectRoot, 'work/acceptance/multi-personality-five-dialogues/results.json')
const outputDir = path.dirname(sourcePath)
const report = JSON.parse(await fs.readFile(sourcePath, 'utf8'))

const cardOrder = [3, 0, 4, 1, 2]
const dialogueOrder = [4, 2, 0, 3, 1]
const cardNames = ['性格卡1', '性格卡2', '性格卡3', '性格卡4', '性格卡5']
const dialogueNames = ['对话A', '对话B', '对话C', '对话D', '对话E']
const tagLabel = {
  QUICK_TEMPER: '脾气来得快', HARD_MOUTH_SOFT_HEART: '嘴硬心软', LIKES_CLOSENESS: '喜欢亲近', RECOVERS_FAST: '情绪退得快',
  WARM_PATIENT: '温柔耐心', DIRECT: '表达直接', VALUES_BOUNDARY: '重视边界', PLAYFUL: '爱开玩笑'
}

const packLines = [
  '# 同年龄同关系五种多性格盲测', '',
  '测试者不知道原始Prompt和答案。人物条件全部相同：24岁女性，与26岁男性是平等亲密伴侣。', '',
  '## 测试方法', '',
  '1. 先阅读五张性格卡。',
  '2. 再阅读五段完整对话。',
  '3. 将每段对话与一张性格卡一一匹配，每张卡只能使用一次。',
  '4. 不要根据固定口头禅匹配，要根据情绪触发、表达方式、恢复速度、亲近和边界判断。',
  '5. 完成匹配后，再给每段对话的真人感打0—100分，并写一句最不像真人的地方。', '',
  '## 五张性格卡', '',
  ...cardOrder.flatMap((scenarioIndex, cardIndex) => {
    const scenario = report.scenarios[scenarioIndex]
    return [
      `### ${cardNames[cardIndex]}`, '',
      ...scenario.selectedTagIds.map((id) => `- ${tagLabel[id] || id}`), ''
    ]
  }),
  '## 五段匿名对话', '',
  ...dialogueOrder.flatMap((scenarioIndex, dialogueIndex) => {
    const scenario = report.scenarios[scenarioIndex]
    return [
      `### ${dialogueNames[dialogueIndex]}`, '',
      ...scenario.turns.flatMap((turn) => [`- 用户：${turn.userText}`, `- 人物：${turn.reply}`, '']),
    ]
  }),
  '## 请填写', '',
  '| 对话 | 匹配的性格卡 | 真人感0—100 | 最不像真人的一句话或原因 |',
  '|---|---|---:|---|',
  ...dialogueNames.map((name) => `| ${name} |  |  |  |`), '',
  '测试者姓名或编号：__________', ''
]

const answers = Object.fromEntries(dialogueOrder.map((scenarioIndex, dialogueIndex) => {
  const cardIndex = cardOrder.indexOf(scenarioIndex)
  return [dialogueNames[dialogueIndex], {
    expectedCard: cardNames[cardIndex],
    scenarioId: report.scenarios[scenarioIndex].id,
    scenarioLabel: report.scenarios[scenarioIndex].label
  }]
}))

const scoreLines = [
  '# 三人盲测汇总表', '',
  '| 测试者 | A匹配 | B匹配 | C匹配 | D匹配 | E匹配 | 正确数/5 | 平均真人感 |',
  '|---|---|---|---|---|---|---:|---:|',
  '| 测试者1 |  |  |  |  |  |  |  |',
  '| 测试者2 |  |  |  |  |  |  |  |',
  '| 测试者3 |  |  |  |  |  |  |  |', '',
  '通过条件：总体匹配正确率≥90%；每种人物至少2/3测试者匹配正确；每组真人感评分均≥97，且五组平均≥97。', ''
]

await Promise.all([
  fs.writeFile(path.join(outputDir, 'blind-test-pack.md'), `${packLines.join('\n')}\n`),
  fs.writeFile(path.join(outputDir, 'blind-answer-key.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), answers }, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, 'blind-score-sheet.md'), `${scoreLines.join('\n')}\n`)
])

console.log(JSON.stringify({
  pack: path.join(outputDir, 'blind-test-pack.md'),
  answerKey: path.join(outputDir, 'blind-answer-key.json'),
  scoreSheet: path.join(outputDir, 'blind-score-sheet.md')
}, null, 2))
