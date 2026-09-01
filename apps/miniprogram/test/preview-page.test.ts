import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('preview page keeps the use button clickable while preserving playback acceptance gating', () => {
  const view = read('pages/create/preview.wxml')
  const style = read('pages/create/preview.wxss')
  const source = read('pages/create/preview.ts')
  const playerSource = read('components/audio-player/audio-player.ts')

  assert.match(view, /role="button"[\s\S]*aria-disabled="\{\{accepting\}\}"/)
  assert.match(view, /id="previewPlayer"/)
  assert.match(view, /bindpause="onPreviewPause"/)
  assert.match(view, /binderror="onPreviewError"/)
  assert.match(view, /playCompleted \? \(trialEligible \? '使用这个声音，免费体验 1 次' : '使用这个声音'\) : '先听完，再使用这个声音'/)
  assert.match(view, /previewPlaying \? '试听播放中，完整听完后即可使用'/)
  assert.match(style, /\.preview-action\s*\{[^}]*width:\s*100%/s)
  assert.match(style, /\.preview-card\.is-prompted\s*\{/)
  assert.match(style, /\.use-button-prompted\s*\{/)
  assert.match(style, /\.retry-button\s*\{[^}]*background:\s*rgba\(255, 255, 255/s)
  assert.match(style, /\.retry-button\s*\{[^}]*margin-top:\s*22rpx/s)
  assert.doesNotMatch(view, /新账号赠送 10 个账号积分/)
  assert.doesNotMatch(view, /对话与“说一句”共享使用，不自动续费/)
  assert.doesNotMatch(style, /\.points-note/)
  assert.match(style, /\.preview-copy\s*\{[^}]*font-size:\s*30rpx/s)
  assert.match(style, /\.preview-status\s*\{[^}]*font-size:\s*27rpx/s)
  assert.match(source, /if \(this\.data\.accepting\) return/)
  assert.match(source, /if \(!this\.data\.playCompleted\) \{/)
  assert.match(source, /selectComponent\('#previewPlayer'\)/)
  assert.match(source, /player\?\.toggle\?\.\(\)/)
  assert.match(source, /onPreviewPause\(\)/)
  assert.match(source, /onPreviewError\(\)/)
  assert.match(playerSource, /audio\.onPause[\s\S]*triggerEvent\('pause'\)/)
  assert.match(playerSource, /audio\.volume\s*=\s*1/)
  assert.match(playerSource, /audio\.onPlay[\s\S]*triggerEvent\('play'\)/)
  assert.match(playerSource, /this\.data\.playing \|\| this\.audio\.paused === false/)
  assert.match(playerSource, /pauseFallbackTimer[\s\S]*this\.audio\.stop\(\)/)
  assert.match(playerSource, /durationLabel:\s*'0″'/)
  assert.match(playerSource, /formatDurationLabel\(value\)/)
  assert.doesNotMatch(playerSource, /this\.audio\.play\(\)\s*\n\s*this\.triggerEvent\('play'\)/)
  assert.match(source, /await acceptVoicePreview/)
  assert.match(source, /await markVoicePreviewPlayed/)
})

test('audio player confirms real playback and force-stops when pause stalls', async () => {
  let componentDefinition: any
  let stopCalls = 0
  const handlers: Record<string, (...args: any[]) => void> = {}
  const audio: any = {
    src: '',
    paused: true,
    duration: 40,
    currentTime: 0,
    obeyMuteSwitch: true,
    autoplay: true,
    volume: 0,
    onPlay: (handler: any) => { handlers.play = handler },
    onPause: (handler: any) => { handlers.pause = handler },
    onStop: (handler: any) => { handlers.stop = handler },
    onTimeUpdate: (handler: any) => { handlers.timeupdate = handler },
    onEnded: (handler: any) => { handlers.ended = handler },
    onError: (handler: any) => { handlers.error = handler },
    play() { this.paused = false },
    pause() { /* Simulate a platform pause call that never takes effect. */ },
    stop() {
      stopCalls += 1
      this.paused = true
      handlers.stop?.()
    },
    destroy() {}
  }
  ;(globalThis as any).Component = (definition: any) => { componentDefinition = definition }
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({}),
    createInnerAudioContext: () => audio,
    cloud: {}
  }

  await import('../components/audio-player/audio-player?case=confirmed-playback')
  assert.ok(componentDefinition)

  const events: string[] = []
  const instance: any = {
    data: {
      playing: false,
      progress: 0,
      currentText: '00:00',
      src: 'https://audio.example.test/preview.mp3',
      disabled: false
    },
    setData(patch: Record<string, unknown>) {
      Object.assign(this.data, patch)
    },
    triggerEvent(name: string) {
      events.push(name)
    }
  }
  Object.assign(instance, componentDefinition.methods)
  componentDefinition.lifetimes.attached.call(instance)

  await instance.toggle()
  assert.equal(instance.data.playing, false)
  assert.deepEqual(events, [])

  handlers.play()
  assert.equal(instance.data.playing, true)
  assert.equal(instance.sourceLocked, true)
  assert.deepEqual(events, ['play'])
  assert.equal(audio.volume, 1)

  await instance.toggle()
  assert.equal(instance.data.playing, false)
  assert.deepEqual(events, ['play', 'pause'])

  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal(stopCalls, 1)
  assert.equal(audio.paused, true)
  assert.deepEqual(events, ['play', 'pause'])

  componentDefinition.lifetimes.detached.call(instance)
})

test('audio player locks the first played cloud version and only refreshes before playback starts', () => {
  const source = read('components/audio-player/audio-player.ts')
  assert.doesNotMatch(source, /if \(this\.data\.src\) void this\.assignSource/)
  assert.match(source, /this\.sourceLocked = true/)
  assert.match(source, /isCloudFileId\(this\.data\.src\) && !this\.sourceLocked/)
  assert.match(source, /if \(this\.observedSource === normalized\) return/)
  assert.match(source, /await this\.assignSource\(this\.data\.src\)/)
})
