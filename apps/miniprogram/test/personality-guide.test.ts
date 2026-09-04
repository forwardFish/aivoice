import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { findPersonalityConflict, PERSONALITY_TAGS, recommendPersonalityTags, serializePersonalityNote } from '../utils/personality'

const partnerExpected = [
  'LIKES_CLOSENESS', 'QUICK_TEMPER', 'RECOVERS_FAST', 'HARD_MOUTH_SOFT_HEART',
  'DIRECT', 'VALUES_RESPECT', 'WARM_PATIENT', 'PLAYFUL',
  'VALUES_BOUNDARY', 'SHOWS_CARE_BY_ACTION', 'DISLIKES_LECTURING', 'SENSITIVE_TO_MISUNDERSTANDING'
]

test('24-year-old partner recommendations vary by gender without auto-selecting traits', () => {
  const female = recommendPersonalityTags({ ageYears: 24, gender: 'FEMALE', relationshipType: 'PARTNER' }).map(tag => tag.id)
  const male = recommendPersonalityTags({ ageYears: 24, gender: 'MALE', relationshipType: 'PARTNER' }).map(tag => tag.id)
  assert.deepEqual(female, partnerExpected)
  assert.notDeepEqual(female, male)
  assert.notDeepEqual(
    female,
    recommendPersonalityTags({ ageYears: 70, gender: 'FEMALE', relationshipType: 'MOTHER' }).map(tag => tag.id)
  )
  assert.deepEqual(recommendPersonalityTags({ ageYears: 1, gender: 'FEMALE', relationshipType: 'CHILD' }), [])
})

test('speaking age bands and nine relationships expose 8 early-child or 12 older candidates', () => {
  const representativeAges = [2, 6, 7, 12, 13, 17, 18, 29, 30, 49, 50, 64, 65, 120]
  const relationships = ['SELF', 'MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'CHILD', 'PARTNER', 'FRIEND', 'OTHER'] as const
  for (const ageYears of representativeAges) {
    for (const relationshipType of relationships) {
      const female = recommendPersonalityTags({ ageYears, gender: 'FEMALE', relationshipType })
      const male = recommendPersonalityTags({ ageYears, gender: 'MALE', relationshipType })
      const expectedCount = ageYears <= 6 ? 8 : 12
      assert.equal(female.length, expectedCount, `${ageYears}/${relationshipType}/FEMALE`)
      assert.equal(male.length, expectedCount, `${ageYears}/${relationshipType}/MALE`)
      assert.equal(new Set(female.map(tag => tag.id)).size, expectedCount)
      const familyCounts = female.reduce((counts, tag) => counts.set(tag.family, (counts.get(tag.family) || 0) + 1), new Map<string, number>())
      assert.ok([...familyCounts.values()].every(count => count <= 2))
    }
  }
  assert.notDeepEqual(
    recommendPersonalityTags({ ageYears: 18, gender: 'FEMALE', relationshipType: 'FRIEND' }).map(tag => tag.id),
    recommendPersonalityTags({ ageYears: 90, gender: 'FEMALE', relationshipType: 'FRIEND' }).map(tag => tag.id),
    'different adult age stages should rank different UI candidates'
  )
  assert.ok(PERSONALITY_TAGS.every(tag => !('genderBoost' in tag)))
})

test('personality selection rejects hard conflicts and serializes only explicit choices', () => {
  assert.ok(findPersonalityConflict(['RECOVERS_FAST', 'NEEDS_LONG_COOLDOWN']))
  assert.equal(findPersonalityConflict(['QUICK_TEMPER', 'RECOVERS_FAST']), null)
  const note = serializePersonalityNote({
    selectedTagIds: ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'],
    freeDescription: '生气时会先怼一句，过一会儿又会来关心你。'
  })
  assert.match(note, /【用户明确选择】/)
  assert.match(note, /脾气来得快/)
  assert.match(note, /嘴硬心软/)
  assert.match(note, /喜欢亲近/)
  assert.match(note, /情绪退得快/)
  assert.match(note, /【用户补充，优先于标签】生气时会先怼一句，过一会儿又会来关心你。/)
  assert.doesNotMatch(note, /温柔耐心/)
  assert.ok(Array.from(note).length <= 300)
  assert.throws(() => serializePersonalityNote({ selectedTagIds: ['WARM_PATIENT', 'DIRECT', 'VALUES_BOUNDARY', 'RECOVERS_FAST', 'PLAYFUL'] }), /最多选择 4 项/)
  assert.throws(() => serializePersonalityNote({ selectedTagIds: ['UNKNOWN_TAG'] }), /人物性格选项无效/)
  assert.equal(note, serializePersonalityNote({
    selectedTagIds: ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST'],
    freeDescription: '生气时会先怼一句，过一会儿又会来关心你。'
  }))
})

test('multi-trait serialization explains distinct partner combinations without exceeding the stored field', () => {
  const gentle = serializePersonalityNote({ selectedTagIds: ['WARM_PATIENT', 'DIRECT', 'VALUES_BOUNDARY', 'RECOVERS_FAST'] })
  const playful = serializePersonalityNote({ selectedTagIds: ['PLAYFUL', 'LIKES_CLOSENESS', 'RECOVERS_FAST', 'DIRECT'] })
  const strong = serializePersonalityNote({ selectedTagIds: ['QUICK_TEMPER', 'DIRECT', 'VALUES_BOUNDARY', 'HARD_MOUTH_SOFT_HEART'] })
  const warmClose = serializePersonalityNote({ selectedTagIds: ['WARM_PATIENT', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'VALUES_BOUNDARY'] })
  assert.match(gentle, /语气可以温和，但仍要点明当前具体问题/)
  assert.match(playful, /低风险共同梗、生活细节或轻微夸张/)
  assert.match(strong, /不得声称自己的时间已排好/)
  assert.match(warmClose, /不能只说“抱可以”/)
  assert.ok(Array.from(gentle).length <= 300)
  assert.ok(Array.from(playful).length <= 300)
  assert.ok(Array.from(strong).length <= 300)
  assert.ok(Array.from(warmClose).length <= 300)
})

async function createPageHarness(caseName: string, harnessOptions: { mode?: string; personalityNote?: string } = {}) {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let saveCount = 0
  let savedBody: any
  let redirectUrl = ''
  let navigateBackCount = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key), setStorageSync: () => undefined, removeStorageSync: () => undefined,
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.endsWith('/voices/voice-1') && options.method === 'GET') {
        queueMicrotask(() => options.success({ statusCode: 200, data: {
          id: 'voice-1', name: '小雨', status: 'READY', points: { availablePoints: 1 }, quota: { availablePoints: 1 },
          permissionType: 'OTHER', relationshipType: 'PARTNER', ageYears: 24, gender: 'FEMALE', userAgeYears: 24,
          userLifeStage: 'ADULT', background: '', relationshipNote: '', personalityNote: harnessOptions.personalityNote || '', speechHabitNote: ''
        } }))
        return {}
      }
      if (url.endsWith('/voices/voice-1/profile') && options.method === 'PUT') {
        saveCount += 1
        savedBody = options.data
        queueMicrotask(() => options.success({ statusCode: 200, data: { id: 'voice-1', status: 'READY' } }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    redirectTo: ({ url }: { url: string }) => { redirectUrl = url },
    navigateBack: () => { navigateBackCount += 1 },
    showToast: () => undefined
  }
  await import(`../pages/create/personality-guide?case=${caseName}`)
  assert.ok(pageDefinition)
  const instance: any = { ...pageDefinition, data: structuredClone(pageDefinition.data), setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) } }
  instance.onLoad({ voiceId: 'voice-1', ...(harnessOptions.mode ? { mode: harnessOptions.mode } : {}) })
  await new Promise(resolve => setImmediate(resolve))
  return {
    instance,
    get saveCount() { return saveCount },
    get savedBody() { return savedBody },
    get redirectUrl() { return redirectUrl },
    get navigateBackCount() { return navigateBackCount }
  }
}

test('guide defaults to no traits, saves explicit multi-selection, and redirects', async () => {
  const harness = await createPageHarness('save')
  assert.equal(harness.instance.data.traitOptions.length, 12)
  assert.equal(harness.instance.data.selectedTagIds.length, 0)
  for (const id of ['QUICK_TEMPER', 'HARD_MOUTH_SOFT_HEART', 'LIKES_CLOSENESS', 'RECOVERS_FAST']) {
    harness.instance.toggleTrait({ currentTarget: { dataset: { id } } })
  }
  harness.instance.onDescriptionInput({ detail: { value: '嘴上不说，但会等你先来哄。' } })
  await harness.instance.saveAndContinue()
  assert.equal(harness.saveCount, 1)
  assert.match(harness.savedBody.personalityNote, /【用户明确选择】/)
  assert.match(harness.savedBody.personalityNote, /【用户补充，优先于标签】/)
  assert.equal(harness.redirectUrl, '/pages/voice/workbench?voiceId=voice-1&mode=chat')
})

test('guide skip is silent and does not persist a personality', async () => {
  const harness = await createPageHarness('skip')
  harness.instance.skipGuide()
  assert.equal(harness.saveCount, 0)
  assert.equal(harness.redirectUrl, '/pages/voice/workbench?voiceId=voice-1&mode=chat')
})

test('saving an empty guide behaves like skip and preserves the existing profile', async () => {
  const harness = await createPageHarness('empty-save')
  await harness.instance.saveAndContinue()
  assert.equal(harness.saveCount, 0)
  assert.equal(harness.redirectUrl, '/pages/voice/workbench?voiceId=voice-1&mode=chat')
})

test('edit mode restores an existing non-recommended tag and allows clearing personality', async () => {
  const existingNote = serializePersonalityNote({ selectedTagIds: ['NEEDS_LONG_COOLDOWN'] })
  const harness = await createPageHarness('edit-clear', { mode: 'edit', personalityNote: existingNote })
  assert.equal(harness.instance.data.editMode, true)
  assert.ok(harness.instance.data.traitOptions.some((item: any) => item.id === 'NEEDS_LONG_COOLDOWN' && item.selected))
  harness.instance.setData({
    selectedTagIds: [],
    traitOptions: harness.instance.data.traitOptions.map((item: any) => ({ ...item, selected: false })),
    description: ''
  })
  await harness.instance.saveAndContinue()
  assert.equal(harness.saveCount, 1)
  assert.equal(harness.savedBody.personalityNote, '')
  assert.equal(harness.navigateBackCount, 1)
  assert.equal(harness.redirectUrl, '')
})

test('guide page is registered, hidden from tab bar, and binds all actions', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
  const wxml = readFileSync(new URL('../pages/create/personality-guide.wxml', import.meta.url), 'utf8')
  assert.ok(app.pages.includes('pages/create/personality-guide'))
  assert.ok(!app.tabBar.list.some((item: any) => item.pagePath === 'pages/create/personality-guide'))
  for (const event of ['toggleTrait', 'onDescriptionInput', 'saveAndContinue', 'skipGuide']) assert.match(wxml, new RegExp(`bind(?:tap|input)="${event}"`))
  assert.match(wxml, /仅供选择，不会自动认定/)
  assert.match(wxml, /只保存你主动选择的特点，最多 4 项/)
  assert.match(wxml, /该年龄暂不推荐对话型性格标签/)
  assert.doesNotMatch(wxml, /context-pill|根据 \{\{contextLabel\}\} 推荐/)
  assert.match(wxml, /wx:elif="\{\{editMode\}\}">保存修改/)
  assert.match(wxml, /wx:if="\{\{!editMode\}\}"/)
})

test('voice settings exposes one personality editor entry and no raw personality textarea', () => {
  const wxml = readFileSync(new URL('../pages/voice/settings.wxml', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/voice/settings.ts', import.meta.url), 'utf8')
  assert.match(wxml, /bindtap="openPersonality"/)
  assert.match(wxml, /personalityConfigured \? '已设置' : '未设置'/)
  assert.doesNotMatch(wxml, /bindinput="onPersonalityNoteInput"/)
  assert.match(source, /pages\/create\/personality-guide\?voiceId=.*&mode=edit/)
})

test('personality guide typography keeps unselected options and secondary actions out of black heavy text', () => {
  const style = readFileSync(new URL('../pages/create/personality-guide.wxss', import.meta.url), 'utf8')
  assert.match(style, /\.guide-title\s*\{[^}]*color:\s*#24314d[^}]*font-weight:\s*680/s)
  assert.match(style, /\.guide-subtitle\s*\{[^}]*color:\s*#7b849e/s)
  assert.match(style, /\.section-title\s*\{[^}]*color:\s*#33405c[^}]*font-weight:\s*620/s)
  assert.match(style, /\.section-caption\s*\{[^}]*color:\s*#8b93ab[^}]*font-weight:\s*560/s)
  assert.match(style, /\.trait-label\s*\{[^}]*color:\s*#5f6f8d[^}]*font-weight:\s*560/s)
  assert.match(style, /\.trait-chip\.is-selected \.trait-label\s*\{[^}]*color:\s*#5f50e6[^}]*font-weight:\s*650/s)
  assert.match(style, /\.description-label\s*\{[^}]*color:\s*#33405c[^}]*font-weight:\s*620/s)
  assert.match(style, /\.action-skip\s*\{[^}]*color:\s*#7c79a8[^}]*font-weight:\s*620/s)
  assert.match(style, /\.action-save\s*\{[^}]*color:\s*#ffffff/s)
})
