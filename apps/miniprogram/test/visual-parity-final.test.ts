import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function gitBlobSha(relativePath: string): string {
  const content = fs.readFileSync(path.join(root, relativePath))
  const header = Buffer.from(`blob ${content.length}\0`)
  return crypto.createHash('sha1').update(header).update(content).digest('hex')
}

test('video selection follows the actual selected tile through choose, reselect, clear and restore', async () => {
  const storage = new Map<string, any>([['nashide_ta_token', 'test-token']])
  let pageDefinition: any
  let chooseCount = 0
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    getExtConfigSync: () => ({ apiBaseUrl: 'https://api.example.test' }),
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: any) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: () => undefined,
    chooseMedia: (options: any) => {
      chooseCount += 1
      options.success({
        tempFiles: [{
          tempFilePath: `/tmp/selected-${chooseCount}.mp4`,
          thumbTempFilePath: `/tmp/selected-${chooseCount}.jpg`,
          size: 6 * 1024 * 1024,
          duration: 24
        }]
      })
    },
    getVideoInfo: (options: any) => options.success({ duration: 24, type: 'mp4' })
  }

  await import('../pages/create/select-video.ts?case=visual-parity-final')
  assert.ok(pageDefinition)

  const instance: any = {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  instance.onLoad({})
  assert.equal(instance.data.selectedIndex, -1)

  await instance.chooseVideo({ currentTarget: { dataset: { index: 5 } } })
  assert.equal(instance.data.selectedIndex, 5)
  assert.equal(instance.data.selected.tileIndex, 5)
  assert.equal(instance.data.selected.thumbTempFilePath, '/tmp/selected-1.jpg')

  await instance.chooseVideo({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(instance.data.selectedIndex, 1)
  assert.equal(instance.data.selected.tileIndex, 1)
  assert.equal(instance.data.selected.tempFilePath, '/tmp/selected-2.mp4')

  instance.resetSelection()
  assert.equal(instance.data.selectedIndex, -1)
  assert.equal(instance.data.selected, null)

  storage.set('nashide_ta_creation_session', {
    voiceId: 'voice-restored',
    tempFilePath: '/tmp/restored.mp4',
    thumbTempFilePath: '/tmp/restored.jpg',
    selectedTileIndex: 7,
    fileName: 'restored.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 5 * 1024 * 1024,
    durationMs: 26000
  })
  const restored: any = {
    ...pageDefinition,
    data: structuredClone(pageDefinition.data),
    setData(patch: Record<string, unknown>) { Object.assign(this.data, patch) }
  }
  restored.onLoad({ voiceId: 'voice-restored' })
  assert.equal(restored.data.selectedIndex, 7)
  assert.equal(restored.data.selected.tileIndex, 7)
  assert.equal(restored.data.selected.thumbTempFilePath, '/tmp/restored.jpg')
})

test('selection markup, metadata and icon assets consume real state without hardcoded first tile', () => {
  const selectVideoTs = read('pages/create/select-video.ts')
  const selectVideoView = read('pages/create/select-video.wxml')
  const selectVideoStyle = read('pages/create/select-video.wxss')
  const storageSource = read('utils/storage.ts')
  const homeTs = read('pages/home/index.ts')
  const homeView = read('pages/home/index.wxml')
  const appStyle = read('app.wxss')
  const audioView = read('components/audio-player/audio-player.wxml')
  const clipView = read('pages/create/select-clip.wxml')
  const accountView = read('pages/account/index.wxml')

  assert.match(selectVideoTs, /selectedIndex:\s*-1/)
  assert.match(selectVideoTs, /dataset\.index/)
  assert.match(selectVideoTs, /selectedTileIndex:\s*this\.data\.selectedIndex/)
  assert.match(storageSource, /selectedTileIndex\?:\s*number/)
  assert.match(storageSource, /thumbTempFilePath\?:\s*string/)
  assert.match(selectVideoView, /selectedIndex === index/)
  assert.match(selectVideoView, /data-index="\{\{index\}\}"/)
  assert.match(selectVideoView, /class="media-tile \{\{selected && selectedIndex === index/)
  assert.doesNotMatch(selectVideoView, /selected\s*&&\s*index\s*===\s*0/)
  assert.doesNotMatch(selectVideoView, />\s*▶\s*</)
  assert.match(selectVideoStyle, /\.media-tile\.is-selected/)
  assert.match(selectVideoStyle, /\.selection-footer\s*\{[^}]*position:\s*fixed/s)

  assert.match(homeTs, /clipStartMs/)
  assert.match(homeTs, /clipEndMs/)
  assert.match(homeTs, /formatDurationMs/)
  assert.doesNotMatch(homeTs, /pointsText/)
  assert.match(homeView, /wx:if="\{\{item\.durationText\}\}"/)
  assert.doesNotMatch(homeView, /voice-points|item\.pointsText/)
  assert.doesNotMatch(homeView, /00:21|00:20|00:18|00:24/)
  assert.match(homeView, /wx:if="\{\{item\.avatarUrl\}\}"/)
  assert.match(homeView, /class="voice-avatar fallback"/)

  assert.match(appStyle, /\.sprite-play-line \.ui-sprite-sheet/)
  assert.match(appStyle, /sprite-play-line[^}]*transform:\s*none/s)
  assert.match(audioView, /sprite-play-line/)
  assert.match(audioView, /\/assets\/ui\/play-line\.png/)
  assert.match(clipView, /\/assets\/ui\/play-line\.png/)
  assert.match(selectVideoView, /\/assets\/ui\/play-line\.png/)
  assert.match(accountView, /\/assets\/ui\/user-outline\.png/)

  assert.equal(gitBlobSha('assets/ui/play-line.png'), '69993a28a1e2c811bf669dfb3362397b46c30f47')
  assert.equal(gitBlobSha('assets/ui/user-outline.png'), '137da405b5c59809cf399c1db49b1a9941744528')
})

test('fixed actions remain protected on compact screens and legacy ten-use copy stays absent', () => {
  const clipStyle = read('pages/create/select-clip.wxss')
  const workbenchView = read('pages/voice/workbench.wxml')
  const workbenchStyle = read('pages/voice/workbench.wxss')
  const profileStyle = read('pages/create/voice-profile.wxss')
  const purchaseStyle = read('pages/purchase/index.wxss')
  const homeStyle = read('pages/home/index.wxss')
  const contractFiles = [
    read('pages/create/preview.wxml'),
    read('pages/purchase/index.wxml'),
    read('pages/voice/workbench.wxml'),
    read('components/quota-purchase-dialog/quota-purchase-dialog.wxml')
  ].join('\n')

  assert.match(clipStyle, /\.clip-footer\s*\{[^}]*position:\s*fixed/s)
  assert.match(clipStyle, /@media \(max-height:\s*740px\)/)
  assert.match(workbenchView, /class="primary-button exact-generate/)
  assert.match(workbenchStyle, /@media \(max-height:\s*740px\)/)
  assert.match(profileStyle, /\.profile-footer\s*\{[^}]*position:\s*fixed/s)
  assert.match(purchaseStyle, /\.purchase-footer\s*\{[^}]*position:\s*fixed/s)
  assert.match(homeStyle, /padding:\s*0 32rpx calc\(132rpx \+ env\(safe-area-inset-bottom\)\)/)

  assert.match(contractFiles, /50 个账号积分|purchaseOption\.points|账号积分/)
  assert.match(contractFiles, /成功生成/)
  assert.doesNotMatch(contractFiles, /¥9\.9\s*\/\s*10次|购买10次|10 次额度|10次生成/)
})
