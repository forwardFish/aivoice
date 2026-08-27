import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('voice settings contains no account balance or account points navigation', () => {
  const wxml = readFileSync(new URL('../pages/voice/settings.wxml', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/voice/settings.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(wxml, /账户积分|剩余\s*\{\{availablePoints\}\}\s*积分|可用积分|订单与积分记录|积分流水/)
  assert.doesNotMatch(source, /\bgetPoints\b|\bavailablePoints\b|\bopenPurchasePage\b/)
})

test('account profile resolves and retries persistence for the selected WeChat avatar', () => {
  const markup = readFileSync(new URL('../pages/account/index.wxml', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/account/index.ts', import.meta.url), 'utf8')

  assert.match(markup, /wx:if="\{\{avatarDisplayUrl\}\}"/)
  assert.match(markup, /src="\{\{avatarDisplayUrl\}\}"/)
  assert.match(markup, /binderror="onAvatarLoadError"/)
  assert.match(markup, /bindtap="editAvatar"/)
  assert.match(markup, /bindtap="editProfile"/)
  assert.match(source, /const localUser = getUser\(\)/)
  assert.match(source, /persistProfileAvatar\(source\)/)
  assert.match(source, /updateMeProfile\(\{ avatarUrl \}\)/)
  assert.match(source, /resolveProfileAvatarSource\(source\)/)
  assert.match(source, /itemList:\s*\['更换头像', '修改昵称'\]/)
  assert.match(source, /const localAvatarUrl = await chooseFallbackAvatar\(\)/)
})

test('voice profile submit posts the server canonical consent text returned by profile save', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let profileRequestBody: any
  let consentRequestBody: any
  let redirectUrl = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.endsWith('/voices/voice-1/profile') && options.method === 'PUT') {
        profileRequestBody = options.data
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'voice-1',
            name: '家人的声音',
            permissionType: 'OTHER',
            relationshipType: 'MOTHER',
            consentVersion: 'voice-consent-v-test',
            consentText: 'SERVER CANONICAL OTHER',
            status: 'DRAFT'
          }
        }))
        return {}
      }
      if (url.endsWith('/voices/voice-1/consents') && options.method === 'POST') {
        consentRequestBody = options.data
        queueMicrotask(() => options.success({ statusCode: 201, data: { id: 'consent-1' } }))
        return {}
      }
      if (url.endsWith('/voices/voice-1/process') && options.method === 'POST') {
        queueMicrotask(() => options.success({ statusCode: 201, data: { id: 'voice-1', status: 'PROCESSING' } }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    redirectTo: ({ url }: { url: string }) => { redirectUrl = url },
    showModal: () => undefined
  }

  await import('../pages/create/voice-profile?case=canonical-consent-submit')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      name: '家人的声音',
      permissionType: 'OTHER',
      relationshipType: 'MOTHER',
      relationshipOther: '',
      userAddress: '小林',
      ageYears: '70',
      gender: 'FEMALE',
      userLifeStage: 'ADULT',
      background: '退休前是中学老师。',
      relationshipNote: '和成年女儿每周通话。',
      consentText: 'LOCAL FALLBACK OTHER',
      confirmed: true
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.submit()

  assert.equal(instance.data.consentText, 'SERVER CANONICAL OTHER')
  assert.deepEqual(profileRequestBody, {
    name: '家人的声音',
    permissionType: 'OTHER',
    relationshipType: 'MOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    ageYears: 70,
    gender: 'FEMALE',
    userLifeStage: 'ADULT',
    background: '退休前是中学老师。',
    relationshipNote: '和成年女儿每周通话。'
  })
  assert.deepEqual(consentRequestBody, {
    consentVersion: 'voice-consent-v-test',
    consentText: 'SERVER CANONICAL OTHER',
    confirmed: true
  })
  assert.equal(redirectUrl, '/pages/create/progress?voiceId=voice-1')
})

test('voice relationship fields use native form controls and readable typography', () => {
  const wxml = readFileSync(new URL('../pages/create/voice-profile.wxml', import.meta.url), 'utf8')
  const style = readFileSync(new URL('../pages/create/voice-profile.wxss', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../pages/create/voice-profile.ts', import.meta.url), 'utf8')

  assert.match(wxml, /<radio-group[^>]*bindchange="onRelationshipRadioChange"/)
  assert.match(wxml, /<label[\s\S]*<radio[^>]*value="\{\{item\.key\}\}"/)
  assert.match(wxml, /TA 平时怎么称呼你？/)
  assert.match(wxml, /例如：小林、妈妈、宝贝/)
  assert.match(style, /grid-template-columns:\s*repeat\(3,/)
  assert.match(style, /\.relationship-option\s*\{[^}]*min-height:\s*78rpx[^}]*font-size:\s*26rpx/s)
  assert.doesNotMatch(wxml, /class="relationship-chip/)
  assert.match(source, /请先勾选“声音使用确认”。/)
  assert.doesNotMatch(source, /请确认与当前权限类型对应的授权文案。/)
})

test('settings clear chat returns immediately when the confirmation is canceled', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let requestCalled = false
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (_key: string, _value: any) => undefined,
    removeStorageSync: (_key: string) => undefined,
    request: () => {
      requestCalled = true
      throw new Error('request should not be called when clear chat is canceled')
    },
    showModal: (options: any) => {
      options.success({ confirm: false, cancel: true })
    },
    showToast: () => undefined
  }

  await import('../pages/voice/settings?case=clear-chat-cancel')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      state: 'success',
      voiceName: '测试声音'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.clearChat()

  assert.equal(requestCalled, false)
  assert.equal(instance.data.clearing, false)
  assert.equal(instance.data.successMessage, '')
  assert.equal(instance.data.errorMessage, '')
})

test('settings remove voice stops after the first confirmation is canceled', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let requestCalled = false
  let modalCalls = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (_key: string, _value: any) => undefined,
    removeStorageSync: (_key: string) => undefined,
    request: () => {
      requestCalled = true
      throw new Error('request should not be called when delete is canceled')
    },
    showModal: (options: any) => {
      modalCalls += 1
      options.success({ confirm: false, cancel: true })
    },
    showToast: () => undefined,
    switchTab: () => undefined
  }

  await import('../pages/voice/settings?case=delete-first-cancel')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      state: 'success',
      voiceName: '测试声音'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.removeVoice()

  assert.equal(modalCalls, 1)
  assert.equal(requestCalled, false)
  assert.equal(instance.data.deleting, false)
  assert.equal(instance.data.deleted, false)
})

test('settings remove voice stops before deletion when the second confirmation is canceled', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let requestCalled = false
  let modalCalls = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (_key: string, _value: any) => undefined,
    removeStorageSync: (_key: string) => undefined,
    request: () => {
      requestCalled = true
      throw new Error('request should not be called when delete is canceled')
    },
    showModal: (options: any) => {
      modalCalls += 1
      options.success({ confirm: modalCalls === 1, cancel: modalCalls !== 1 })
    },
    showToast: () => undefined,
    switchTab: () => undefined
  }

  await import('../pages/voice/settings?case=delete-second-cancel')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-1',
      state: 'success',
      voiceName: '测试声音'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.removeVoice()

  assert.equal(modalCalls, 2)
  assert.equal(requestCalled, false)
  assert.equal(instance.data.deleting, false)
  assert.equal(instance.data.deleted, false)
})
