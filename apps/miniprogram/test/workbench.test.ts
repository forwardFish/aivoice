import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import path from 'node:path'

test('pending chat keeps the user message out of the assistant bubble', () => {
  const view = fs.readFileSync(path.resolve(process.cwd(), 'apps/miniprogram/pages/voice/workbench.wxml'), 'utf8')
  const source = fs.readFileSync(path.resolve(process.cwd(), 'apps/miniprogram/pages/voice/workbench.ts'), 'utf8')
  assert.match(view, /class="message-row user-row pending-user-row"[\s\S]*\{\{pendingText\}\}/)
  assert.match(view, /class="message-row assistant-row pending-row"[\s\S]*\{\{generationStatusText\}\}/)
  assert.doesNotMatch(view, /pending-user-copy|你：\{\{pendingText\}\}/)
  assert.match(view, /id="pending-assistant"[\s\S]*wx:if="\{\{pendingReplyText\}\}"[\s\S]*\{\{pendingReplyText\}\}/)
  assert.match(view, /wx:else class="typing-wave"/)
  assert.match(source, /if \(mode === 'chat'\) \{\s*this\.chatDraftText = ''\s*this\.chatDraftDirty = false/)
  assert.match(source, /chatText: '',\s*chatCount: 0,\s*bottomAnchorId: submittedBottomAnchorId,/)
  assert.match(source, /pendingText: text,\s*pendingReplyText: '',\s*pendingMode: mode/)
  assert.doesNotMatch(source, /\/assets\/avatars\/[^'"\s]+\.webp/)
  assert.match(source, /voiceAvatar:\s*'\/assets\/avatars\/age-30-49-female\.png'/)
  assert.match(source, /\}, \(\) => \{\s*if \(mode !== 'chat'\) return\s*this\.setData\(\{ scrollTarget: 'pending-assistant' \}\)/)
  assert.match(source, /const retryChatText = latestChatDraft \|\| text/)
  assert.match(source, /const restoredChatDraft = mode === 'chat' \? \{ chatText: retryChatText, chatCount: retryChatText\.length \} : \{\}/)
})

test('sending a chat clears the composer and scrolls the pending reply into view immediately', async () => {
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => key === 'nashide_ta_token' ? 'test-token' : '',
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    getRandomValues: () => undefined,
    showToast: () => undefined
  }

  await import('../pages/voice/workbench?case=send-scroll-bottom')
  assert.ok(pageDefinition)
  let scheduledAnchor = ''
  const instance: any = {
    ...pageDefinition,
    chatDraftText: '刚发送的消息',
    chatDraftDirty: true,
    chatBottomSequence: 1,
    data: {
      ...structuredClone(pageDefinition.data),
      voiceId: 'voice-scroll',
      state: 'success',
      mode: 'chat',
      chatText: '刚发送的消息',
      chatCount: 6
    },
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch)
      callback?.()
    },
    scheduleChatViewportSync() {},
    scheduleChatBottomScroll(anchorId: string) { scheduledAnchor = anchorId }
  }

  void instance.sendChat()

  assert.equal(instance.data.chatText, '')
  assert.equal(instance.data.chatCount, 0)
  assert.equal(instance.data.pendingText, '刚发送的消息')
  assert.equal(instance.data.pendingMode, 'chat')
  assert.equal(instance.data.scrollTarget, 'pending-assistant')
  assert.equal(scheduledAnchor, 'chat-bottom-2')
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
  assert.match(markup, /fixed="\{\{state === 'success' && mode === 'chat'\}\}"/)
  assert.match(markup, /bindrighttap="openSettings"/)
  assert.doesNotMatch(markup, /workbench-hero|hero-title|hero-quota/)
  assert.doesNotMatch(markup, /生成音频会明确显示“AI生成”标识/)
  assert.match(markup, /tag="AI生成"/)
  assert.match(style, /\.workbench-screen\s*\{[^}]*height:\s*100vh[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s)
  assert.match(style, /\.workbench-content\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
  assert.match(style, /\.segment-control-shell\s*\{[^}]*flex:\s*0 0 auto[^}]*z-index:\s*5/s)
  assert.match(style, /\.segment-control\s*\{[^}]*width:\s*540rpx[^}]*max-width:\s*calc\(100% - 104rpx\)[^}]*margin:\s*16rpx auto 0[^}]*padding:\s*7rpx[^}]*border-radius:\s*23rpx/s)
  assert.match(style, /\.segment-item\s*\{[^}]*height:\s*78rpx[^}]*border-radius:\s*18rpx[^}]*font-size:\s*29rpx[^}]*text-align:\s*center/s)
  assert.match(style, /\.chat-panel\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(style, /\.messages-scroll\s*\{[^}]*width:\s*100%[^}]*min-height:\s*320rpx[^}]*margin-top:\s*12rpx[^}]*padding:\s*24rpx 30rpx calc\(188rpx \+ env\(safe-area-inset-bottom\)\)/s)
  assert.match(style, /@media \(max-height:\s*740px\)[\s\S]*\.segment-control\s*\{[^}]*margin-top:\s*8rpx/s)
  assert.match(style, /@media \(max-height:\s*740px\)[\s\S]*\.segment-item\s*\{[^}]*height:\s*74rpx[^}]*font-size:\s*28rpx/s)
  assert.match(style, /@media \(max-height:\s*740px\)[\s\S]*\.messages-scroll\s*\{[^}]*min-height:\s*300rpx[^}]*margin-top:\s*10rpx[^}]*padding-bottom:\s*calc\(172rpx \+ env\(safe-area-inset-bottom\)\)/s)
  assert.match(source, /openSettings\(\)\s*\{[\s\S]*\/pages\/voice\/settings\?voiceId=/)
})

test('workbench opens directly in chat without the redundant mode chooser', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(markup, /想用 TA 的声音做什么|mode-chooser|bindtap="selectMode"/)
  assert.doesNotMatch(source, /showModeChooser|chooseAnotherMode|selectMode/)
  assert.match(source, /const mode = options\.mode === 'exact' \? 'exact' : 'chat'/)
})

test('conversation entry scrolls to a fresh bottom anchor instead of the last message row', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../pages/voice/workbench.ts', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../pages/voice/workbench.wxss', import.meta.url), 'utf8')

  assert.match(markup, /wx:if="\{\{bottomAnchorId\}\}" id="\{\{bottomAnchorId\}\}" class="scroll-bottom-anchor"/)
  assert.match(source, /this\.chatBottomSequence = Number\(this\.chatBottomSequence \|\| 0\) \+ 1/)
  assert.match(source, /const bottomAnchorId = `chat-bottom-\$\{this\.chatBottomSequence\}`/)
  assert.match(source, /bottomAnchorId,\s*scrollTarget: ''/)
  assert.match(source, /scheduleChatBottomScroll\(bottomAnchorId\)/)
  assert.match(source, /scheduleChatBottomScroll\(anchorId = this\.data\.bottomAnchorId\)/)
  assert.match(markup, /scroll-top="\{\{chatScrollTop\}\}"/)
  assert.match(source, /const chatScrollTop = 1000000 \+ this\.chatScrollPositionSequence/)
  assert.match(source, /setData\(\{ scrollTarget: '', chatScrollTop: 0 \}, \(\) => this\.setData\(\{ scrollTarget: anchorId, chatScrollTop \}\)\)/)
  assert.match(source, /}, 650\)/)
  assert.match(source, /const submittedBottomAnchorId = mode === 'chat' \? `chat-bottom-\$\{this\.chatBottomSequence\}` : this\.data\.bottomAnchorId/)
  assert.match(source, /bottomAnchorId: submittedBottomAnchorId,\s*scrollTarget: ''/)
  assert.match(source, /scheduleChatBottomScroll\(submittedBottomAnchorId\)/)
  assert.match(source, /generationStatusText: '声音生成中…',[\s\S]*scheduleChatBottomScroll\(this\.data\.bottomAnchorId\)/)
  assert.doesNotMatch(source, /const scrollTarget = chatMessages\.length \? `message-/)
  assert.match(style, /\.scroll-bottom-anchor\s*\{[^}]*height:\s*1rpx/s)
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
  assert.match(markup, /class="reply-feedback"[\s\S]*reply-feedback-action like-action[\s\S]*reply-feedback-divider[\s\S]*reply-feedback-action dislike-action/s)
  assert.match(markup, /hover-class="reply-feedback-action-hover"[\s\S]*像TA[\s\S]*hover-class="reply-feedback-action-hover"[\s\S]*不像TA/s)
  assert.match(style, /\.user-bubble\s*\{[^}]*color:\s*#ffffff[^}]*linear-gradient\(135deg,\s*#7264f9/s)
  assert.match(style, /\.assistant-avatar-image\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s)
  assert.match(style, /\.assistant-message-avatar-image\s*\{/)
  assert.match(style, /\.message-time\s*\{/)
  assert.match(style, /\.message-text\s*\{[^}]*font-size:\s*32rpx[^}]*line-height:\s*1\.62/s)
  assert.match(style, /\.message-time\s*\{[^}]*font-size:\s*22rpx[^}]*line-height:\s*1\.3/s)
  assert.match(style, /\.assistant-stack\s*\{[^}]*max-width:\s*82%/s)
  assert.match(markup, /<scroll-view[\s\S]*class="messages-scroll"[\s\S]*style="\{\{messagesScrollStyle\}\}"/)
  assert.match(style, /\.scroll-spacer\s*\{[^}]*height:\s*32rpx/s)
  assert.match(style, /\.send-button\s*\{[^}]*width:\s*184rpx\s*!important[^}]*min-width:\s*184rpx[^}]*min-height:\s*84rpx/s)
  assert.match(style, /\.reply-feedback\s*\{[^}]*display:\s*inline-flex[^}]*border-radius:\s*999rpx[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/s)
  assert.match(style, /\.reply-feedback-action\s*\{[^}]*min-width:\s*140rpx[^}]*min-height:\s*64rpx[^}]*justify-content:\s*center/s)
  assert.match(style, /\.reply-feedback-label\s*\{[^}]*font-size:\s*22rpx/s)
  assert.match(style, /\.reply-feedback-action\.like-action\.selected\s*\{[^}]*background:\s*rgba\(110,\s*93,\s*246,\s*0\.14\)/s)
  assert.match(style, /\.reply-feedback-action\.dislike-action\.selected\s*\{[^}]*background:\s*rgba\(107,\s*115,\s*141,\s*0\.13\)/s)
  assert.match(source, /timeText:\s*messageTimeLabel\(message\.createdAt\)/)
  assert.match(source, /onVoiceAvatarError\(\)\s*\{[\s\S]*this\.setData\(\{\s*voiceAvatar:\s*''\s*\}\)/)
  assert.match(source, /resolveProfileAvatarSource\(source\)/)
  assert.match(source, /scheduleChatViewportSync\(\)/)
  assert.match(source, /syncChatViewport\(\)\s*\{[\s\S]*createSelectorQuery\(\)\.in\(this\)[\s\S]*messagesScrollStyle/s)
  assert.match(playerMarkup, /durationOnly \? durationLabel : currentText/)
})

test('chat mode keeps nav and top chrome outside the scrolling message list while exact mode keeps its own scroll container', () => {
  const markup = fs.readFileSync(new URL('../pages/voice/workbench.wxml', import.meta.url), 'utf8')
  const style = fs.readFileSync(new URL('../pages/voice/workbench.wxss', import.meta.url), 'utf8')

  assert.match(markup, /<view wx:else class="workbench-content \{\{mode === 'chat' \? 'chat-workbench-content' : 'exact-workbench-content'\}\}">/)
  assert.match(markup, /<view class="segment-control-shell">[\s\S]*class="segment-control"/)
  assert.doesNotMatch(markup, /AI 生成内容不代表声音本人真实表达|class="ai-notice"/)
  assert.doesNotMatch(style, /\.ai-notice\s*\{/)
  assert.match(markup, /<view wx:if="\{\{mode === 'chat'\}\}" class="chat-panel">[\s\S]*<scroll-view[\s\S]*class="messages-scroll"/)
  assert.match(markup, /class="messages-scroll"[\s\S]*bounces="\{\{false\}\}"[\s\S]*enhanced="\{\{true\}\}"/)
  assert.doesNotMatch(markup, /<scroll-view[\s\S]*class="messages-scroll"[\s\S]*class="segment-control"/)
  assert.match(markup, /<scroll-view wx:else class="exact-scroll" scroll-y="\{\{true\}\}" enhanced="\{\{true\}\}" show-scrollbar="\{\{false\}\}">[\s\S]*class="exact-panel"/)
  assert.match(style, /\.chat-workbench-content,\s*\.exact-workbench-content\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(style, /\.chat-panel\s*\{[^}]*background:\s*transparent/s)
  assert.match(style, /\.messages-scroll\s*\{[^}]*background:\s*transparent/s)
  assert.match(style, /\.exact-scroll\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*width:\s*100%/s)
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
  assert.match(markup, /class="chat-composer-shell" style="\{\{chatComposerStyle\}\}"/)
  assert.match(markup, /class="composer-input-shell"[\s\S]*<input/)
  assert.doesNotMatch(markup, /composer-leading|composer-leading-icon|mic-mode\.png/)
  assert.match(markup, /placeholder-class="composer-input-placeholder"/)
  assert.match(markup, /adjust-position="\{\{false\}\}"/)
  assert.match(markup, /hold-keyboard="\{\{true\}\}"/)
  assert.match(markup, /placeholder="\{\{chatInputFocused \? '' : '输入想说的话…'\}\}"/)
  assert.match(markup, /bindfocus="onChatFocus"/)
  assert.match(markup, /bindkeyboardheightchange="onChatKeyboardHeightChange"/)
  const composerInput = markup.match(/<input[\s\S]*?class="composer-input"[\s\S]*?\/>/)?.[0] || ''
  assert.ok(composerInput)
  assert.doesNotMatch(composerInput, /disabled=/)
  assert.match(markup, /<button class="primary-button send-button[\s\S]*disabled="\{\{sending\}\}"/)
  assert.doesNotMatch(markup, /<textarea[\s\S]*class="composer-input"|auto-height=/)
  assert.match(style, /\.chat-composer\s*\{[^}]*min-height:\s*108rpx[^}]*padding:\s*12rpx 12rpx 12rpx 16rpx/s)
  assert.match(style, /\.composer-input-shell\s*\{[^}]*flex:\s*1[^}]*min-width:\s*0[^}]*height:\s*80rpx[^}]*padding:\s*0 24rpx[^}]*display:\s*flex[^}]*align-items:\s*center/s)
  assert.match(style, /\.composer-input\s*\{[^}]*width:\s*100%[^}]*height:\s*80rpx[^}]*padding:\s*0[^}]*font-size:\s*30rpx[^}]*line-height:\s*80rpx/s)
  assert.match(style, /\.composer-input-placeholder\s*\{[^}]*font-size:\s*30rpx[^}]*line-height:\s*80rpx/s)
  assert.match(source, /chatKeyboardHeight:\s*0,\s*chatComposerStyle:\s*''/)
  assert.match(source, /onChatKeyboardHeightChange\(event: any\)\s*\{/)
  assert.match(source, /const chatComposerStyle = keyboardHeight > 0 \? `bottom:\$\{keyboardHeight\}px;` : ''/)
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

test('chat composer accepts the next draft while a reply is generating and preserves it on completion', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    getDeviceInfo: () => ({ platform: 'devtools' }),
    request: (options: any) => {
      queueMicrotask(() => options.success({
        statusCode: 200,
        data: {
          messageId: 'message-pending',
          status: 'READY',
          text: '上一条回复完成了',
          audioUrl: 'https://example.test/reply.mp3',
          durationMs: 1200
        }
      }))
      return {}
    },
    showToast: () => undefined,
    reLaunch: () => undefined
  }

  await import('../pages/voice/workbench?case=next-draft-while-generating')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    destroyed: false,
    chatDraftText: '',
    chatDraftDirty: false,
    data: {
      ...structuredClone(pageDefinition.data),
      state: 'success',
      mode: 'chat',
      voiceId: 'voice-next-draft',
      sending: true,
      pendingMode: 'chat',
      pendingText: '上一条消息',
      bottomAnchorId: 'chat-bottom-2'
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    },
    async loadData() {},
    scheduleChatViewportSync() {},
    finishGenerationTiming() {}
  }

  instance.onChatInput({ detail: { value: '这是准备发送的下一条' } })
  assert.equal(instance.data.chatText, '这是准备发送的下一条')
  assert.equal(instance.data.chatCount, 10)
  await instance.pollMessage('message-pending')

  assert.equal(instance.data.chatText, '这是准备发送的下一条')
  assert.equal(instance.data.chatCount, 10)
  assert.equal(instance.chatDraftText, '这是准备发送的下一条')
  assert.equal(instance.data.sending, false)
  assert.equal(storage.get('nashide_ta_workbench_draft:voice-next-draft').chatText, '这是准备发送的下一条')
})

test('chat composer follows keyboard height and keeps viewport sync on keyboard open and close', async () => {
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

  await import('../pages/voice/workbench?case=keyboard-follow')
  assert.ok(pageDefinition)
  let viewportSyncCount = 0
  let bottomScrollCount = 0
  const instance: any = {
    ...pageDefinition,
    data: {
      ...structuredClone(pageDefinition.data),
      state: 'success',
      mode: 'chat',
      bottomAnchorId: 'chat-bottom-9'
    },
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch)
      callback?.()
    },
    scheduleChatViewportSync() { viewportSyncCount += 1 },
    scheduleChatBottomScroll() { bottomScrollCount += 1 }
  }

  instance.onChatFocus()
  instance.onChatKeyboardHeightChange({ detail: { height: 336.8 } })
  assert.equal(instance.data.chatInputFocused, true)
  assert.equal(instance.data.chatKeyboardHeight, 336)
  assert.equal(instance.data.chatComposerStyle, 'bottom:336px;')

  instance.onChatKeyboardHeightChange({ detail: { keyboardHeight: 0 } })
  assert.equal(instance.data.chatKeyboardHeight, 0)
  assert.equal(instance.data.chatComposerStyle, '')

  instance.onChatBlur()
  assert.equal(instance.data.chatInputFocused, false)
  assert.ok(viewportSyncCount >= 3)
  assert.ok(bottomScrollCount >= 3)
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

test('assistant reply feedback records both like and dislike directly without opening native prompts', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  const requestBodies: any[] = []
  let showActionSheetCalls = 0
  let showModalCalls = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: () => undefined,
    showToast: () => undefined,
    showActionSheet: () => { showActionSheetCalls += 1 },
    showModal: () => { showModalCalls += 1 },
    request: (options: any) => {
      requestBodies.push(options.data)
      options.success({ statusCode: 200, data: { recorded: true, correctionApplied: true } })
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
  assert.equal(instance.data.chatMessages[0].feedbackReason, '')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].verdict, 'LIKE')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].reason, undefined)
  assert.deepEqual(requestBodies[0], { messageId: 'message-1', verdict: 'LIKE' })

  instance.markReplyDislike({ currentTarget: { dataset: { messageId: 'message-1' } } })
  assert.equal(instance.data.chatMessages[0].feedbackVerdict, 'DISLIKE')
  assert.equal(instance.data.chatMessages[0].feedbackReason, '')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].verdict, 'DISLIKE')
  assert.equal(storage.get('nashide_ta_reply_feedback:voice-feedback')['message-1'].reason, undefined)
  assert.deepEqual(requestBodies[1], { messageId: 'message-1', verdict: 'DISLIKE' })
  assert.equal(showActionSheetCalls, 0)
  assert.equal(showModalCalls, 0)
})

test('chat viewport uses measured top chrome and composer boundaries on a real-device layout', async () => {
  let pageDefinition: any
  const selected: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getWindowInfo: () => ({ windowHeight: 844 }),
    createSelectorQuery: () => ({
      in() { return this },
      select(selector: string) { selected.push(selector); return this },
      boundingClientRect() { return this },
      exec(callback: (rects: any[]) => void) {
        callback([{ bottom: 145 }, { top: 770 }])
      }
    })
  }

  await import('../pages/voice/workbench?case=measured-chat-viewport')
  assert.ok(pageDefinition)
  const instance: any = {
    ...pageDefinition,
    destroyed: false,
    data: {
      ...structuredClone(pageDefinition.data),
      state: 'success',
      mode: 'chat',
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    }
  }

  instance.syncChatViewport()

  assert.deepEqual(selected, ['.segment-control-shell', '.chat-composer-shell'])
  assert.equal(instance.data.messagesScrollStyle, 'height:613px;')
})
