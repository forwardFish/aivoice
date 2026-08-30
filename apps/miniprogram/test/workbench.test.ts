import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import path from 'node:path'

test('pending chat keeps the user message out of the assistant bubble', () => {
  const view = fs.readFileSync(path.resolve(process.cwd(), 'apps/miniprogram/pages/voice/workbench.wxml'), 'utf8')
  assert.match(view, /class="message-row user-row pending-user-row"[\s\S]*\{\{pendingText\}\}/)
  assert.match(view, /class="message-row assistant-row pending-row"[\s\S]*\{\{generationStatusText\}\}/)
  assert.doesNotMatch(view, /pending-user-copy|你：\{\{pendingText\}\}/)
  assert.match(view, /id="pending-assistant"[\s\S]*wx:if="\{\{pendingReplyText\}\}"[\s\S]*\{\{pendingReplyText\}\}/)
  assert.match(view, /wx:else class="typing-wave"/)
})

test('processing chat publishes text first and keeps the same bubble waiting for audio', () => {
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')

  assert.match(source, /result\.status === 'PROCESSING'[\s\S]*publishedText[\s\S]*pendingReplyText:\s*publishedText[\s\S]*generationStatusText:\s*'声音生成中…'/)
  assert.match(source, /firstTextMs\s*=\s*Date\.now\(\) - this\.generationClientTiming\.startedAt/)
  assert.match(source, /result\.status === 'READY'[\s\S]*await this\.loadData\(false\)[\s\S]*pendingReplyText:\s*''/)
  assert.equal((markup.match(/id="pending-assistant"/g) || []).length, 1)
})

test('audio failure keeps an already published text reply visible without charging', () => {
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')

  assert.match(source, /result\.status === 'FAILED'[\s\S]*pendingMode === 'chat'[\s\S]*result\.text[\s\S]*await this\.loadData\(false\)/)
  assert.match(source, /声音生成失败，文字回复已保留，本次未扣积分/)
  assert.match(source, /toast\('文字回复已保留，声音生成失败，本次未扣积分'\)/)
  assert.match(markup, /声音生成失败，文字已保留，未扣积分/)
})

test('app nav supports stacked voice title plus subtitle without reintroducing bold settings chrome', () => {
  const markup = fs.readFileSync(new URL('../components/app-nav/app-nav.wxml', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../components/app-nav/app-nav.wxss', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../components/app-nav/app-nav.ts', import.meta.url), 'utf8')

  assert.match(source, /subtitle:\s*\{\s*type:\s*String,\s*value:\s*''\s*\}/)
  assert.match(markup, /class="nav-center \{\{subtitle \? 'nav-center-with-subtitle' : ''\}\}"/)
  assert.match(markup, /<text wx:if="\{\{subtitle\}\}" class="nav-subtitle">\{\{subtitle\}\}<\/text>/)
  assert.match(style, /\.nav-center-with-subtitle\s*\{[^}]*max-width:\s*calc\(100% - 72rpx\)[^}]*transform:\s*translateX\(-48rpx\)/s)
  assert.match(style, /\.nav-subtitle\s*\{[^}]*font-size:\s*20rpx[^}]*color:\s*#7b8197/s)
  assert.match(style, /\.nav-right\s*\{[^}]*font-weight:\s*400[^}]*background:\s*transparent/s)
})

test('workbench moves voice name and points into app nav only after success', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../pages/voice/workbench.wxss', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')

  assert.match(markup, /title="\{\{state === 'success' \? voiceName : ''\}\}"/)
  assert.match(markup, /subtitle="\{\{state === 'success' \? pointsText : ''\}\}"/)
  assert.match(markup, /rightText="\{\{state === 'success' \? '声音设置' : ''\}\}"/)
  assert.match(markup, /bindrighttap="openSettings"/)
  assert.doesNotMatch(markup, /workbench-hero|hero-title|hero-quota/)
  assert.doesNotMatch(markup, /生成音频会明确显示“AI生成”标识/)
  assert.match(markup, /tag="AI生成"/)
  assert.match(style, /\.segment-control\s*\{[^}]*width:\s*540rpx[^}]*max-width:\s*calc\(100% - 104rpx\)[^}]*margin:\s*16rpx auto 0[^}]*padding:\s*7rpx[^}]*border-radius:\s*23rpx/s)
  assert.match(style, /\.segment-item\s*\{[^}]*height:\s*78rpx[^}]*border-radius:\s*18rpx[^}]*font-size:\s*29rpx[^}]*text-align:\s*center/s)
  assert.match(style, /@media \(max-height:\s*740px\)[\s\S]*\.segment-control\s*\{[^}]*margin-top:\s*8rpx/s)
  assert.match(style, /@media \(max-height:\s*740px\)[\s\S]*\.segment-item\s*\{[^}]*height:\s*74rpx[^}]*font-size:\s*28rpx/s)
  assert.match(source, /openSettings\(\)\s*\{[\s\S]*\/pages\/voice\/settings\?voiceId=/)
})

test('chat workbench matches the approved bilateral conversation structure', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../pages/voice/workbench.wxss', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')
  const playerMarkup = fs.readFileSync(new URL('../components/audio-player/audio-player.wxml', import.meta.url), 'utf8')

  assert.match(markup, /class="assistant-avatar \{\{voiceAvatar \? 'has-image' : ''\}\}"/)
  assert.match(markup, /wx:if="\{\{voiceAvatar\}\}"[\s\S]*class="assistant-avatar-image"[\s\S]*src="\{\{voiceAvatar\}\}"/)
  assert.match(markup, /wx:if="\{\{item\.isAssistant && voiceAvatar\}\}"[\s\S]*class="message-avatar assistant-message-avatar assistant-message-avatar-image"[\s\S]*src="\{\{voiceAvatar\}\}"/)
  assert.match(markup, /wx:elif="\{\{item\.isAssistant\}\}" class="message-avatar assistant-message-avatar assistant-message-avatar-fallback">\{\{voiceInitial\}\}<\/view>/)
  assert.match(markup, /class="message-avatar user-message-avatar" src="\{\{userAvatar\}\}"/)
  assert.match(markup, /item\.isUser && item\.timeText/)
  assert.match(markup, /bubble="\{\{true\}\}"[^>]*durationOnly="\{\{true\}\}"/)
  assert.doesNotMatch(markup, /class="workbench-content fade-in"/)
  assert.doesNotMatch(markup, /class="text-button change-mode"/)
  assert.doesNotMatch(markup, /class="reply-feedback"/)
  assert.match(style, /\.user-bubble\s*\{[^}]*color:\s*#ffffff[^}]*linear-gradient\(135deg,\s*#7264f9/s)
  assert.match(style, /\.assistant-avatar-image\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s)
  assert.match(style, /\.assistant-message-avatar-image\s*\{/)
  assert.match(style, /\.message-time\s*\{/)
  assert.match(style, /\.messages-scroll\s*\{[^}]*height:\s*calc\(100vh - 694rpx/s)
  assert.match(style, /\.send-button\s*\{[^}]*width:\s*200rpx\s*!important[^}]*min-width:\s*200rpx[^}]*min-height:\s*80rpx/s)
  assert.match(source, /timeText:\s*messageTimeLabel\(message\.createdAt\)/)
  assert.match(source, /onVoiceAvatarError\(\)\s*\{[\s\S]*this\.setData\(\{\s*voiceAvatar:\s*''\s*\}\)/)
  assert.match(source, /resolveProfileAvatarSource\(source\)/)
  assert.match(playerMarkup, /durationOnly \? durationLabel : currentText/)
})

test('chat composer keeps the native single-line input stable while typing', async () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../pages/voice/workbench.wxss', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: () => '',
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=stable-composer')
  assert.ok(pageDefinition)
  assert.match(markup, /<input[\s\S]*class="composer-input"/)
  assert.match(markup, /class="composer-input-shell"[\s\S]*<input/)
  assert.match(markup, /placeholder-class="composer-input-placeholder"/)
  assert.match(markup, /adjust-position="\{\{false\}\}"/)
  assert.match(markup, /hold-keyboard="\{\{true\}\}"/)
  assert.match(markup, /placeholder="\{\{chatInputFocused \? '' : '输入想说的话…'\}\}"/)
  assert.match(markup, /bindfocus="onChatFocus"/)
  assert.doesNotMatch(markup, /<textarea[\s\S]*class="composer-input"|auto-height=/)
  assert.match(style, /\.composer-input-shell\s*\{[^}]*flex:\s*1[^}]*min-width:\s*0[^}]*height:\s*72rpx[^}]*display:\s*flex[^}]*align-items:\s*center/s)
  assert.match(style, /\.composer-input\s*\{[^}]*width:\s*100%[^}]*height:\s*72rpx[^}]*padding:\s*0[^}]*line-height:\s*72rpx/s)
  assert.match(style, /\.composer-input-placeholder\s*\{[^}]*line-height:\s*72rpx/s)
  assert.match(source, /message_delivery_timing/)
  assert.match(source, /idempotencyMs[\s\S]*submitRequestMs[\s\S]*pollCount[\s\S]*pollRequestMs[\s\S]*firstTextMs[\s\S]*totalMs/)
  assert.match(source, /waitingForBackendAndPollMs[\s\S]*overThreeSecondTarget/)
  assert.match(source, /appendGenerationTiming\(record\)/)

  let renderCount = 0
  const instance: any = {
    ...pageDefinition,
    data: { ...structuredClone(pageDefinition.data), errorMessage: '' },
    setData(patch: Record<string, unknown>) {
      renderCount += 1
      Object.assign(this.data, patch)
    }
  }
  instance.onChatFocus()
  assert.equal(instance.data.chatInputFocused, true)
  assert.equal(renderCount, 1)
  instance.onChatInput({ detail: { value: '今天不开心' } })
  assert.equal(instance.chatDraftText, '今天不开心')
  assert.equal(renderCount, 1)
  instance.onChatBlur()
  assert.equal(instance.data.chatInputFocused, false)
  assert.equal(instance.data.chatText, '今天不开心')
  assert.equal(renderCount, 2)
})

test('non-ready exact results never present themselves as generated audio', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  assert.match(markup, /item\.status === 'BLOCKED' \? '内容未通过审核，未扣积分'/)
  assert.match(markup, /item\.status === 'PROCESSING' \? '正在生成'/)
  assert.doesNotMatch(markup, /item\.status === 'FAILED' \? '生成失败，未扣积分' : 'AI生成'/)
})

test('zero points shows the purchase option only after an active generation and preserves the draft', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/exact-speech') || url.includes('/messages')) {
        queueMicrotask(() => options.success({
          statusCode: 402,
          data: {
            code: 'POINTS_EXHAUSTED',
            purchaseOption: {
              productCode: 'POINTS_50',
              amountFen: 990,
              points: 50,
              autoRenew: false
            }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=points-exhausted')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-zero-points',
      state: 'success',
      mode: 'exact',
      exactText: '下一次主动生成才显示购买框。',
      exactCount: 15,
      points: { availablePoints: 0 },
      exactResults: [{ id: 'prior', status: 'READY', audioUrl: '/prior.wav', text: '上一次成功结果' }],
      purchaseVisible: false
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.generateExact()

  assert.equal(instance.data.purchaseVisible, true)
  assert.equal(instance.data.exactText, '下一次主动生成才显示购买框。')
  assert.equal(instance.data.purchaseOption.productCode, 'POINTS_50')
  assert.equal(instance.data.purchaseOption.amountFen, 990)
  assert.equal(instance.data.purchaseOption.points, 50)
  assert.equal(instance.data.purchaseOption.autoRenew, false)
  assert.equal(instance.data.points.availablePoints, 0)
  assert.equal(storage.get('nashide_ta_workbench_draft:voice-zero-points').exactText, '下一次主动生成才显示购买框。')
})

test('purchase action opens the dedicated purchase page with preserved mode and product code', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let navigatedUrl = ''
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    navigateTo: ({ url }: any) => { navigatedUrl = String(url || '') },
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=open-purchase')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-open-purchase',
      state: 'success',
      mode: 'exact',
      purchaseVisible: true,
      purchaseOption: {
        productCode: 'POINTS_50',
        amountFen: 990,
        points: 50,
        autoRenew: false
      }
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  instance.buyQuota()

  assert.equal(instance.data.purchaseVisible, false)
  assert.equal(navigatedUrl, '/pages/purchase/index?voiceId=voice-open-purchase&mode=exact&productCode=POINTS_50')
})

test('workbench auto-opens purchase recovery when a pending order exists', async () => {
  const storage = new Map<string, any>([
    ['nashide_ta_token', 'test-token'],
    ['nashide_ta_pending_order:voice-pending', { orderId: 'order-pending', paymentCompleted: true, updatedAt: Date.now() }]
  ])
  let pageDefinition: any
  const navigations: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: any) => {
      const url = String(options.url || '')
      if (url.includes('/points')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { availablePoints: 0 } }))
        return {}
      }
      if (url.includes('/products')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: { products: [{ productCode: 'POINTS_50', amountFen: 990, points: 50, autoRenew: false }] }
        }))
        return {}
      }
      if (url.includes('/voices/voice-pending/conversation')) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { messages: [] } }))
        return {}
      }
      if (url.includes('/voices/voice-pending')) {
        queueMicrotask(() => options.success({
          statusCode: 200,
          data: {
            id: 'voice-pending',
            name: '待恢复声音',
            status: 'READY',
            acceptedAt: '2026-08-21T12:00:00.000Z',
            points: { availablePoints: 0 }
          }
        }))
        return {}
      }
      throw new Error(`unexpected request: ${url}`)
    },
    navigateTo: ({ url }: { url: string }) => navigations.push(url),
    reLaunch: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=pending-order-recovery')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-pending'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  await instance.loadData(false)

  assert.deepEqual(navigations, ['/pages/purchase/index?voiceId=voice-pending&resume=1'])
  assert.equal(storage.get('nashide_ta_pending_order:voice-pending').orderId, 'order-pending')
})

test('assistant reply feedback records like and asks for a reason before recording dislike', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let actionSheetItems: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: () => undefined,
    showToast: () => undefined,
    showActionSheet: (options: any) => {
      actionSheetItems = options.itemList
      options.success({ tapIndex: 3 })
    }
  }

  await import('../pages/voice/workbench?case=reply-feedback')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-feedback',
      chatMessages: [{ id: 'message-1', feedbackVerdict: '', feedbackReason: '' }]
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  instance.markReplyLike({ currentTarget: { dataset: { messageId: 'message-1' } } })
  assert.equal(instance.data.chatMessages[0].feedbackVerdict, 'LIKE')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].verdict, 'LIKE')

  instance.markReplyDislike({ currentTarget: { dataset: { messageId: 'message-1' } } })
  assert.equal(actionSheetItems.length, 6)
  assert.equal(instance.data.chatMessages[0].feedbackVerdict, 'DISLIKE')
  assert.equal(instance.data.chatMessages[0].feedbackReason, 'LESS_PREACHY')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].reason, 'LESS_PREACHY')
})
