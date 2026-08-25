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
  assert.match(apiTs, /视频不足 8 秒/)
  assert.match(apiTs, /声音片段最长为 20 秒/)
  assert.doesNotMatch([selectVideoTs, selectVideoWxml, selectClipTs, selectClipWxml, apiTs].join('\n'), /12[–-]60|10[–-]30/)
})

test('select video footer delegates row spacing and action width to the standard bottom action bar', () => {
  const selectVideoWxml = read('pages/create/select-video.wxml')
  const selectVideoWxss = read('pages/create/select-video.wxss')
  const actionBarWxml = read('components/bottom-action-bar/bottom-action-bar.wxml')
  const actionBarWxss = read('components/bottom-action-bar/bottom-action-bar.wxss')
  const actionBarTs = read('components/bottom-action-bar/bottom-action-bar.ts')

  assert.match(selectVideoWxml, /<bottom-action-bar[^>]*layout="row"[^>]*actionWidth="\{\{222\}\}"/)
  assert.match(selectVideoWxml, /slot="leading"/)
  assert.match(selectVideoWxml, /<app-button[^>]*slot="action"/)
  assert.doesNotMatch(selectVideoWxss, /\.footer-action/)
  assert.match(actionBarTs, /multipleSlots:\s*true/)
  assert.match(actionBarWxml, /bottom-action-leading[^]*slot name="leading"/)
  assert.match(actionBarWxml, /bottom-action-trailing[^]*slot name="action"/)
  assert.match(actionBarWxss, /\.bottom-action-trailing\s*\{[^}]*margin-left:\s*22rpx/s)
  assert.doesNotMatch(actionBarWxss, /\.is-row\s*\{[^}]*gap:/s)
})
