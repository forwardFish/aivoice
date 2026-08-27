import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('creation flow uses one 8-60 second video and an 8-20 second cloning reference', () => {
  const selectVideoTs = read('pages/create/select-video.ts')
  const selectVideoWxml = read('pages/create/select-video.wxml')
  const selectClipTs = read('pages/create/select-clip.ts')
  const selectClipWxml = read('pages/create/select-clip.wxml')
  const apiTs = read('services/api.ts')

  assert.match(selectVideoTs, /MIN_DURATION_MS\s*=\s*8000/)
  assert.match(selectVideoTs, /MAX_DURATION_MS\s*=\s*60000/)
  assert.match(selectVideoWxml, /8[–-]60/)
  assert.match(selectClipTs, /MIN_CLIP_SECONDS\s*=\s*8/)
  assert.match(selectClipTs, /MAX_CLIP_SECONDS\s*=\s*20/)
  assert.match(selectClipWxml, /8[–-]20/)
  assert.match(selectClipWxml, /catchtouchstart="onMarkerTouchStart"/)
  assert.match(selectClipWxml, /catchtouchmove="onMarkerTouchMove"/)
  assert.match(selectClipWxml, /catchtouchstart="onWaveShellTouchStart"/)
  assert.match(selectClipWxml, /data-marker="range"/)
  assert.match(selectClipTs, /updateMarkerFromClientX/)
  assert.match(selectClipTs, /resolveWaveTouchMarker/)
  assert.match(selectClipTs, /dragRangeStart \+ delta/)
  assert.match(selectClipTs, /endSec - MAX_CLIP_SECONDS/)
  assert.match(selectClipTs, /startSec \+ MIN_CLIP_SECONDS/)
  assert.match(apiTs, /视频不足 8 秒/)
  assert.match(apiTs, /声音片段最长为 20 秒/)
  assert.doesNotMatch([selectVideoTs, selectVideoWxml, selectClipTs, selectClipWxml, apiTs].join('\n'), /12[–-]60|10[–-]30/)
})

test('select video footer keeps a visible right gutter without a slotted action host', () => {
  const selectVideoWxml = read('pages/create/select-video.wxml')
  const selectVideoWxss = read('pages/create/select-video.wxss')
  assert.match(selectVideoWxml, /<view class="selection-footer">/)
  assert.match(selectVideoWxml, /<view role="button"[^>]*class="selection-action-button primary-button"/)
  assert.match(selectVideoWxml, /class="summary-remove-button" bindtap="resetSelection"/)
  assert.doesNotMatch(selectVideoWxml, /<app-icon-button/)
  assert.doesNotMatch(selectVideoWxml, /<bottom-action-bar|slot="action"|slot="leading"/)
  assert.match(selectVideoWxss, /\.selection-footer\s*\{[^}]*width:\s*750rpx[^}]*padding:\s*16rpx 34rpx/s)
  assert.match(selectVideoWxss, /\.selection-footer-action\s*\{[^}]*flex:\s*0 0 190rpx[^}]*margin-left:\s*18rpx/s)
  assert.match(selectVideoWxss, /\.selection-action-button\s*\{[^}]*width:\s*190rpx[^}]*display:\s*flex/s)
  assert.match(selectVideoWxss, /\.summary-remove-button\s*\{[^}]*min-width:\s*146rpx[^}]*min-height:\s*82rpx/s)
})

test('select clip uses a page-native full-width footer action', () => {
  const appStyle = read('app.wxss')
  const clipView = read('pages/create/select-clip.wxml')
  assert.match(appStyle, /app-button,[\s\S]*bottom-action-bar,[\s\S]*display:\s*block;[\s\S]*width:\s*100%/)
  assert.match(clipView, /<view[^>]*class="clip-footer"[\s\S]*<view[^>]*role="button"[\s\S]*class="clip-next-button primary-button/)
  assert.doesNotMatch(clipView, /<app-button/)
  assert.doesNotMatch(clipView, /<bottom-action-bar/)
})
