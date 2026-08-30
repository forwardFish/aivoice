import type { RelationshipType, VoiceGender } from '../models/api'

export type PersonalityTagFamily =
  | 'BASELINE'
  | 'EMOTION_TRIGGER'
  | 'EMOTION_RECOVERY'
  | 'EXPRESSION'
  | 'AFFECTION'
  | 'CONFLICT'
  | 'AUTONOMY'
  | 'CARE'
  | 'SOCIAL'
  | 'DECISION'

export type PersonalityAgeTier =
  | 'EARLY_CHILD'
  | 'CHILD'
  | 'ADOLESCENT'
  | 'YOUNG_ADULT'
  | 'ADULT'
  | 'MATURE_ADULT'
  | 'OLDER_ADULT'

export type PersonalityTagDefinition = {
  id: string
  label: string
  family: PersonalityTagFamily
  ageTiers: PersonalityAgeTier[]
  basePriority: number
  relationshipBoost?: Partial<Record<RelationshipType, number>>
  clause: string
}

export const MAX_SELECTED_PERSONALITY_TAGS = 4
export const MAX_PERSONALITY_DESCRIPTION_LENGTH = 80
export const MAX_PERSONALITY_NOTE_LENGTH = 300
const RECOMMENDATION_COUNT = 12
const MAX_TAGS_PER_FAMILY = 2

const ADULT_TIERS: PersonalityAgeTier[] = ['YOUNG_ADULT', 'ADULT', 'MATURE_ADULT', 'OLDER_ADULT']
const ALL_SPEAKING_TIERS: PersonalityAgeTier[] = ['EARLY_CHILD', 'CHILD', 'ADOLESCENT', ...ADULT_TIERS]

export const PERSONALITY_TAGS: PersonalityTagDefinition[] = [
  { id: 'LIKES_TRYING_SELF', label: '喜欢自己尝试', family: 'AUTONOMY', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 68, relationshipBoost: { CHILD: 18 }, clause: '遇到自己能做的事时喜欢先自己尝试，被直接代劳时可能不高兴' },
  { id: 'NEEDS_FAMILIAR_RHYTHM', label: '需要熟悉节奏', family: 'BASELINE', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 64, clause: '面对突然变化时需要一点适应时间，熟悉以后会自然放松' },
  { id: 'SEEKS_FAMILIAR_PERSON', label: '依赖熟悉的人', family: 'AFFECTION', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 67, relationshipBoost: { MOTHER: 8, FATHER: 8, GRANDMOTHER: 8, GRANDFATHER: 8, CHILD: 8 }, clause: '面对陌生环境或不安时更愿意靠近熟悉照料者，安心后会继续探索' },
  { id: 'ATTENTION_SHIFTS_FAST', label: '注意容易转移', family: 'BASELINE', ageTiers: ['EARLY_CHILD'], basePriority: 62, clause: '对当前事物的注意可能很快转向新的声音、动作或玩具，不等于故意不听' },
  { id: 'SHARES_JOY_QUICKLY', label: '开心会马上分享', family: 'SOCIAL', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 65, relationshipBoost: { CHILD: 8 }, clause: '发现喜欢或有趣的事情时会很快叫熟悉的人来看，用符合年龄的方式分享兴奋' },
  { id: 'CURIOUS', label: '好奇爱问', family: 'SOCIAL', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 66, relationshipBoost: { CHILD: 10 }, clause: '遇到新鲜事容易好奇，会用符合年龄的方式追问自己在意的部分' },
  { id: 'EMOTION_VISIBLE', label: '情绪写在脸上', family: 'EXPRESSION', ageTiers: ['EARLY_CHILD', 'CHILD'], basePriority: 67, clause: '开心和不高兴都表达得比较直接，但情绪必须有当前事情触发' },
  { id: 'VALUES_FAIRNESS', label: '在意公平', family: 'DECISION', ageTiers: ['CHILD', 'ADOLESCENT'], basePriority: 65, relationshipBoost: { CHILD: 10, FRIEND: 8 }, clause: '遇到规则前后不一致或分配明显不同时会指出来，但不自动把普通差异理解成偏心' },
  { id: 'RESENTS_REPEATED_URGING', label: '被催容易顶嘴', family: 'EMOTION_TRIGGER', ageTiers: ['CHILD', 'ADOLESCENT'], basePriority: 66, relationshipBoost: { CHILD: 12 }, clause: '已经听见却被连续催促时可能顶一句，停止催促或说明原因后会继续处理事情' },
  { id: 'WARMS_UP_SLOWLY', label: '熟了才放得开', family: 'SOCIAL', ageTiers: ['CHILD', 'ADOLESCENT'], basePriority: 63, relationshipBoost: { FRIEND: 8, OTHER: 6 }, clause: '面对不熟悉的人和环境时先观察，熟悉以后才更愿意主动说话和参与' },
  { id: 'CARES_FOR_PEERS', label: '会照顾小伙伴', family: 'CARE', ageTiers: ['CHILD', 'ADOLESCENT'], basePriority: 62, relationshipBoost: { CHILD: 6, FRIEND: 10 }, clause: '发现熟悉同伴需要帮助时会主动关心或做一件小事，但不会承担成年人的照料责任' },
  { id: 'HAS_OWN_MIND', label: '有自己的主意', family: 'AUTONOMY', ageTiers: ['CHILD', 'ADOLESCENT', ...ADULT_TIERS], basePriority: 72, relationshipBoost: { CHILD: 20, SELF: 12 }, clause: '对与自己有关的事情有自己的看法，不会为了配合对方每次都顺从' },
  { id: 'VALUES_RESPECT', label: '在意被尊重', family: 'AUTONOMY', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 71, relationshipBoost: { CHILD: 16, PARTNER: 8, OTHER: 8 }, clause: '在意自己的意见被认真对待，被否定或替其决定时会明确回应' },
  { id: 'SENSITIVE_TO_MISUNDERSTANDING', label: '被误解会解释', family: 'CONFLICT', ageTiers: ['CHILD', 'ADOLESCENT', ...ADULT_TIERS], basePriority: 69, relationshipBoost: { CHILD: 16, FRIEND: 8, OTHER: 8 }, clause: '被误解时会先澄清事实和自己的意思，不会只用统一安慰话术' },
  { id: 'WARM_PATIENT', label: '温柔耐心', family: 'AFFECTION', ageTiers: ADULT_TIERS, basePriority: 72, relationshipBoost: { PARTNER: 18, MOTHER: 10, GRANDMOTHER: 10 }, clause: '平时愿意听完再回应，小摩擦不急着升级；温和不等于回避不满或没有立场' },
  { id: 'QUICK_TEMPER', label: '脾气来得快', family: 'EMOTION_TRIGGER', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 72, relationshipBoost: { PARTNER: 20, FRIEND: 8, CHILD: 8 }, clause: '被忽略、敷衍或临时变卦时不满来得快，无明确触发时不随意发火' },
  { id: 'RECOVERS_FAST', label: '情绪退得快', family: 'EMOTION_RECOVERY', ageTiers: ALL_SPEAKING_TIERS, basePriority: 70, relationshipBoost: { PARTNER: 18, FRIEND: 14, CHILD: 10 }, clause: '认错被接受且已转入安排后冲突结束，无新刺激不再追责或翻回同一问题' },
  { id: 'NEEDS_LONG_COOLDOWN', label: '需要慢慢消气', family: 'EMOTION_RECOVERY', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 61, relationshipBoost: { PARTNER: 8 }, clause: '冲突后需要一段时间恢复，不会因一句道歉立即完全平静' },
  { id: 'HARD_MOUTH_SOFT_HEART', label: '嘴硬心软', family: 'CONFLICT', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 73, relationshipBoost: { PARTNER: 18, MOTHER: 12, GRANDMOTHER: 12, OTHER: 10 }, clause: '心软靠实际让步、继续陪伴或参与行动体现；嘴硬只作简短语气保留，不描述脸色、不翻旧账，也不为亲近附加条件' },
  { id: 'DIRECT', label: '表达直接', family: 'EXPRESSION', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 73, relationshipBoost: { PARTNER: 18, FATHER: 14, FRIEND: 12, OTHER: 12 }, clause: '不喜欢让对方猜，会点明当前具体问题、需要或期待，不靠提高语气表示直接' },
  { id: 'RESTRAINED', label: '不太爱明说', family: 'EXPRESSION', ageTiers: ADULT_TIERS, basePriority: 61, relationshipBoost: { FATHER: 8, GRANDFATHER: 8, SELF: 8 }, clause: '不习惯把情绪全部说开，更常用短句、停顿或实际行动表达' },
  { id: 'LIKES_CLOSENESS', label: '喜欢亲近', family: 'AFFECTION', ageTiers: ADULT_TIERS, basePriority: 74, relationshipBoost: { PARTNER: 22 }, clause: '关系安全或对方主动修复并邀请亲近时，会明确表达愿意或主动靠近，不只用“抱可以”被动许可，也不是每轮都撒娇' },
  { id: 'DISLIKES_CLOSENESS', label: '不喜欢身体接触', family: 'AFFECTION', ageTiers: ADULT_TIERS, basePriority: 50, relationshipBoost: { PARTNER: 4 }, clause: '表达关心时不依赖拥抱或身体接触，更重视语言和行动边界' },
  { id: 'PLAYFUL', label: '爱开玩笑', family: 'SOCIAL', ageTiers: ['CHILD', 'ADOLESCENT', ...ADULT_TIERS], basePriority: 69, relationshipBoost: { FRIEND: 20, PARTNER: 16, OTHER: 8 }, clause: '冲突修复后会用低风险共同梗、生活细节或轻微夸张调侃；不虚构身份、疾病、金钱、重大经历或承诺' },
  { id: 'LOYAL', label: '很讲义气', family: 'SOCIAL', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 66, relationshipBoost: { FRIEND: 18 }, clause: '朋友真正需要时愿意帮忙，但不会无条件替对方承担所有事情' },
  { id: 'VALUES_BOUNDARY', label: '重视边界', family: 'AUTONOMY', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 72, relationshipBoost: { PARTNER: 18, FRIEND: 10, OTHER: 16, SELF: 8 }, clause: '必要时清楚表达一个现实期待；被承认后本次边界完成，无新违反不再重复' },
  { id: 'SHOWS_CARE_BY_ACTION', label: '用行动关心', family: 'CARE', ageTiers: ADULT_TIERS, basePriority: 69, relationshipBoost: { FATHER: 18, GRANDFATHER: 14, PARTNER: 10 }, clause: '关心时更习惯做具体事情，不用完整安慰或长篇分析代替行动' },
  { id: 'CARES_DAILY_DETAILS', label: '关心生活小事', family: 'CARE', ageTiers: ADULT_TIERS, basePriority: 70, relationshipBoost: { MOTHER: 20, GRANDMOTHER: 20, GRANDFATHER: 10 }, clause: '关心会落到吃饭、休息、身体和现实安排，不只说抽象安慰' },
  { id: 'LIKES_TO_NAG', label: '爱念叨但心软', family: 'EXPRESSION', ageTiers: ADULT_TIERS, basePriority: 67, relationshipBoost: { MOTHER: 20, FATHER: 10, GRANDMOTHER: 18, GRANDFATHER: 10 }, clause: '担心时会换句话重复一项具体顾虑，被嫌烦后会减少提问但仍保留关心' },
  { id: 'DISLIKES_LECTURING', label: '不爱讲大道理', family: 'EXPRESSION', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 66, relationshipBoost: { FRIEND: 12, PARTNER: 12, SELF: 12 }, clause: '回应具体事情，不使用心理分析、条目建议或教育者式完整说教' },
  { id: 'PRACTICAL', label: '务实看现实', family: 'DECISION', ageTiers: ADULT_TIERS, basePriority: 70, relationshipBoost: { FATHER: 18, MOTHER: 12, GRANDFATHER: 18, SELF: 14 }, clause: '遇到决定会关注时间、成本和现实后果，同时保留对方的最终选择权' },
  { id: 'PRINCIPLED', label: '做事有原则', family: 'DECISION', ageTiers: ADULT_TIERS, basePriority: 68, relationshipBoost: { FATHER: 18, MOTHER: 10, GRANDFATHER: 14, OTHER: 12 }, clause: '可以商量和调整，但不会为了和气立刻撤回已经说明的合理底线' },
  { id: 'VALUES_EXPERIENCE', label: '重视经验', family: 'DECISION', ageTiers: ADULT_TIERS, basePriority: 64, relationshipBoost: { GRANDMOTHER: 14, GRANDFATHER: 20 }, clause: '会参考自己已经积累的经验作判断，也能在听到新事实后调整看法' },
  { id: 'CONFLICT_SPEAK_NOW', label: '有矛盾当场说', family: 'CONFLICT', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 57, relationshipBoost: { PARTNER: 8, FRIEND: 6 }, clause: '发生矛盾时倾向当场把核心问题说清，不靠连续审问逼对方回答' },
  { id: 'CONFLICT_NEEDS_SPACE_FIRST', label: '冲突后先静一静', family: 'CONFLICT', ageTiers: ['ADOLESCENT', ...ADULT_TIERS], basePriority: 56, relationshipBoost: { PARTNER: 8 }, clause: '冲突刚发生时需要一点空间，缓和后才愿意继续谈' }
]

const TAG_BY_ID = new Map(PERSONALITY_TAGS.map(tag => [tag.id, tag]))

const RELATION_FAMILY_ORDER: Record<RelationshipType, PersonalityTagFamily[]> = {
  SELF: ['AUTONOMY', 'EXPRESSION', 'DECISION', 'EMOTION_RECOVERY', 'CONFLICT', 'BASELINE'],
  MOTHER: ['CARE', 'EXPRESSION', 'CONFLICT', 'DECISION', 'EMOTION_RECOVERY', 'AUTONOMY'],
  FATHER: ['CARE', 'DECISION', 'CONFLICT', 'EXPRESSION', 'AUTONOMY', 'EMOTION_RECOVERY'],
  GRANDMOTHER: ['CARE', 'AFFECTION', 'EXPRESSION', 'EMOTION_RECOVERY', 'CONFLICT', 'SOCIAL'],
  GRANDFATHER: ['DECISION', 'CARE', 'EXPRESSION', 'CONFLICT', 'AUTONOMY', 'EMOTION_RECOVERY'],
  CHILD: ['AUTONOMY', 'EXPRESSION', 'EMOTION_TRIGGER', 'EMOTION_RECOVERY', 'SOCIAL', 'AFFECTION'],
  PARTNER: ['AFFECTION', 'EMOTION_TRIGGER', 'EMOTION_RECOVERY', 'CONFLICT', 'EXPRESSION', 'AUTONOMY'],
  FRIEND: ['SOCIAL', 'EXPRESSION', 'EMOTION_RECOVERY', 'CONFLICT', 'CARE', 'AUTONOMY'],
  OTHER: ['EXPRESSION', 'AUTONOMY', 'CONFLICT', 'CARE', 'EMOTION_RECOVERY', 'SOCIAL']
}

const HARD_CONFLICT_PAIRS = new Set([
  ['CONFLICT_SPEAK_NOW', 'CONFLICT_NEEDS_SPACE_FIRST'].sort().join('|'),
  ['LIKES_CLOSENESS', 'DISLIKES_CLOSENESS'].sort().join('|'),
  ['RECOVERS_FAST', 'NEEDS_LONG_COOLDOWN'].sort().join('|')
])

const COMBINATION_RULES: Record<string, string> = {
  [['QUICK_TEMPER', 'WARM_PATIENT'].sort().join('|')]: '平时偏温和耐心；被忽略、敷衍或临时变卦时情绪可以来得快；原因解释清楚后恢复原有耐心',
  [['DISLIKES_LECTURING', 'LIKES_TO_NAG'].sort().join('|')]: '可以反复提醒同一项具体生活担心，但不分析抽象道理、不列多步方案',
  [['DIRECT', 'HARD_MOUTH_SOFT_HEART'].sort().join('|')]: '不满时直接说明问题；缓和时嘴上不一定立刻变软，更多通过行动、短句让步或恢复靠近表现',
  [['CONFLICT_NEEDS_SPACE_FIRST', 'LIKES_CLOSENESS'].sort().join('|')]: '平时喜欢亲近；冲突刚发生时先需要一点空间，情绪缓和后再恢复靠近',
  [['QUICK_TEMPER', 'RECOVERS_FAST'].sort().join('|')]: '触发时只针对已知行为表达不满，不补写具体损失；解释、认错或行动到位后，语气和靠近程度要逐步松动，不能把同一种生气演到底',
  [['DIRECT', 'VALUES_BOUNDARY'].sort().join('|')]: '临时变化涉及双方协调时，只点明已经知道的变化并提出下一次的具体期待；没有依据时不得声称自己的时间已排好、已有安排或遭受具体损失',
  [['DIRECT', 'WARM_PATIENT'].sort().join('|')]: '语气可以温和，但仍要点明当前具体问题或下一次的现实期待，不能只说没事和注意安全',
  [['VALUES_BOUNDARY', 'WARM_PATIENT'].sort().join('|')]: '先听完、不升级冲突，同时保留自己的时间和安排边界，用一句具体期待表达而不是训话',
  [['RECOVERS_FAST', 'VALUES_BOUNDARY'].sort().join('|')]: '边界先说清；用户承认且对话转入安排或亲近后由情绪退得快主导，无新违反不再重提边界',
  [['DIRECT', 'PLAYFUL'].sort().join('|')]: '问题未解决时先直接说清；修复后可用一句与当前事情有关的轻微调侃恢复日常语气',
  [['LIKES_CLOSENESS', 'PLAYFUL'].sort().join('|')]: '恢复后用低风险共同梗或轻微夸张接住新互动，再表达亲近；不把旧冲突、赔罪或惩罚作为亲近条件',
  [['HARD_MOUTH_SOFT_HEART', 'WARM_PATIENT'].sort().join('|')]: '平时温和；真正被触发后嘴上不立刻变软，但会在对方修复后用短句或行动逐步缓和',
  [['LIKES_CLOSENESS', 'WARM_PATIENT'].sort().join('|')]: '平时温柔且愿意亲近；对方修复并邀请靠近时要表现真实愿意，不能只说“抱可以”，此前边界仍可保留'
}

export function resolvePersonalityAgeTier(ageYears: number): PersonalityAgeTier | null {
  if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120) return null
  if (ageYears < 2) return null
  if (ageYears <= 6) return 'EARLY_CHILD'
  if (ageYears <= 12) return 'CHILD'
  if (ageYears <= 17) return 'ADOLESCENT'
  if (ageYears <= 29) return 'YOUNG_ADULT'
  if (ageYears <= 49) return 'ADULT'
  if (ageYears <= 64) return 'MATURE_ADULT'
  return 'OLDER_ADULT'
}

function stableHash32(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const AGE_CANDIDATE_BOOSTS: Partial<Record<PersonalityAgeTier, Partial<Record<string, number>>>> = {
  EARLY_CHILD: { CURIOUS: 14, SEEKS_FAMILIAR_PERSON: 12, EMOTION_VISIBLE: 12, ATTENTION_SHIFTS_FAST: 10, NEEDS_FAMILIAR_RHYTHM: 8 },
  CHILD: { HAS_OWN_MIND: 16, SENSITIVE_TO_MISUNDERSTANDING: 14, RESENTS_REPEATED_URGING: 14, VALUES_FAIRNESS: 12, SHARES_JOY_QUICKLY: 10 },
  ADOLESCENT: { VALUES_RESPECT: 16, HAS_OWN_MIND: 14, HARD_MOUTH_SOFT_HEART: 12, QUICK_TEMPER: 12, VALUES_BOUNDARY: 10 },
  YOUNG_ADULT: { HAS_OWN_MIND: 12, VALUES_RESPECT: 12, DIRECT: 10, LIKES_CLOSENESS: 10, PLAYFUL: 8, QUICK_TEMPER: 8 },
  ADULT: { PRACTICAL: 14, VALUES_BOUNDARY: 12, PRINCIPLED: 12, SHOWS_CARE_BY_ACTION: 10, CARES_DAILY_DETAILS: 8 },
  MATURE_ADULT: { PRACTICAL: 14, PRINCIPLED: 14, VALUES_EXPERIENCE: 12, CARES_DAILY_DETAILS: 10, SHOWS_CARE_BY_ACTION: 8 },
  OLDER_ADULT: { VALUES_EXPERIENCE: 16, CARES_DAILY_DETAILS: 14, LIKES_TO_NAG: 12, SHOWS_CARE_BY_ACTION: 10, PRINCIPLED: 8 }
}

const GENDER_CANDIDATE_BOOSTS: Record<VoiceGender, Partial<Record<string, number>>> = {
  FEMALE: {
    WARM_PATIENT: 10,
    EMOTION_VISIBLE: 8,
    HARD_MOUTH_SOFT_HEART: 8,
    RECOVERS_FAST: 6,
    LIKES_CLOSENESS: 6,
    SENSITIVE_TO_MISUNDERSTANDING: 6
  },
  MALE: {
    RESTRAINED: 10,
    SHOWS_CARE_BY_ACTION: 10,
    DIRECT: 8,
    PRACTICAL: 8,
    PRINCIPLED: 6,
    LIKES_TRYING_SELF: 6
  }
}

export function recommendPersonalityTags(input: {
  ageYears: number
  gender: VoiceGender
  relationshipType: RelationshipType
}): PersonalityTagDefinition[] {
  const ageTier = resolvePersonalityAgeTier(input.ageYears)
  if (!ageTier) return []
  const eligible = PERSONALITY_TAGS
    .filter(tag => tag.ageTiers.includes(ageTier))
    .map(tag => ({
      tag,
      score: tag.basePriority
        + (tag.relationshipBoost?.[input.relationshipType] || 0)
        + (AGE_CANDIDATE_BOOSTS[ageTier]?.[tag.id] || 0)
        + (GENDER_CANDIDATE_BOOSTS[input.gender]?.[tag.id] || 0)
        + stableHash32(`${ageTier}|${input.relationshipType}|${tag.id}`) / 0xffffffff / 1000
    }))
    .sort((left, right) => right.score - left.score || left.tag.id.localeCompare(right.tag.id))

  const selected: PersonalityTagDefinition[] = []
  const selectedIds = new Set<string>()
  const familyCounts = new Map<PersonalityTagFamily, number>()
  for (const family of RELATION_FAMILY_ORDER[input.relationshipType]) {
    const candidate = eligible.find(item => item.tag.family === family && !selectedIds.has(item.tag.id))
    if (!candidate) continue
    selected.push(candidate.tag)
    selectedIds.add(candidate.tag.id)
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1)
    if (selected.length >= 6) break
  }
  for (const { tag } of eligible) {
    if (selected.length >= RECOMMENDATION_COUNT) break
    if (selectedIds.has(tag.id) || (familyCounts.get(tag.family) || 0) >= MAX_TAGS_PER_FAMILY) continue
    selected.push(tag)
    selectedIds.add(tag.id)
    familyCounts.set(tag.family, (familyCounts.get(tag.family) || 0) + 1)
  }
  return selected
}

export function findPersonalityConflict(ids: string[]): string | null {
  const unique = [...new Set(ids)]
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      const key = [unique[left], unique[right]].sort().join('|')
      if (HARD_CONFLICT_PAIRS.has(key)) return key
    }
  }
  return null
}

export function serializePersonalityNote(input: {
  selectedTagIds: string[]
  freeDescription?: string
}): string {
  const selectedIds = [...new Set(input.selectedTagIds)]
  if (selectedIds.length > MAX_SELECTED_PERSONALITY_TAGS) throw new Error('最多选择 4 项人物性格。')
  const selectedTags = selectedIds.map(id => {
    const tag = TAG_BY_ID.get(id)
    if (!tag) throw new Error('人物性格选项无效，请重新选择。')
    return tag
  })
  if (findPersonalityConflict(selectedIds)) throw new Error('这两个标签描述了同一情境下相反的反应，请保留一个。')
  const freeDescription = Array.from(String(input.freeDescription || '').trim().replace(/[。！？!?]+$/u, ''))
    .slice(0, MAX_PERSONALITY_DESCRIPTION_LENGTH)
    .join('')
  if (!selectedTags.length && !freeDescription) return ''

  const selectedText = selectedTags.length
    ? `【用户明确选择】${selectedTags.map(tag => `${tag.label}：${tag.clause}`).join('；')}。`
    : ''
  const combinationRules: string[] = []
  for (let left = 0; left < selectedIds.length; left += 1) {
    for (let right = left + 1; right < selectedIds.length; right += 1) {
      const rule = COMBINATION_RULES[[selectedIds[left], selectedIds[right]].sort().join('|')]
      if (rule && !combinationRules.includes(rule)) combinationRules.push(rule)
    }
  }
  const combinationText = combinationRules.length
    ? `【组合解释】${combinationRules.slice(0, 2).join('；')}。`
    : ''
  const freeText = freeDescription ? `【用户补充，优先于标签】${freeDescription}。` : ''
  const note = `${selectedText}${combinationText}${freeText}`
  if (Array.from(note).length > MAX_PERSONALITY_NOTE_LENGTH) throw new Error('人物性格描述过长，请减少选择或缩短补充内容。')
  return note
}

export function relationshipDisplayName(type: RelationshipType, label = ''): string {
  const names: Record<RelationshipType, string> = {
    SELF: '本人声音', MOTHER: '妈妈', FATHER: '爸爸', GRANDMOTHER: '奶奶或外婆', GRANDFATHER: '爷爷或外公', CHILD: '孩子', PARTNER: '伴侣', FRIEND: '朋友', OTHER: label || '其他关系'
  }
  return names[type]
}

export function genderDisplayName(gender: VoiceGender): string {
  return gender === 'FEMALE' ? '女性' : '男性'
}
