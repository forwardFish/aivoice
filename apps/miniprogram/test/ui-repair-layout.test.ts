import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('P0 screens keep their primary actions and navigation visible on compact viewports', () => {
  const selectVideoView = read('pages/create/select-video.wxml')
  const selectVideoStyle = read('pages/create/select-video.wxss')
  const clipView = read('pages/create/select-clip.wxml')
  const clipStyle = read('pages/create/select-clip.wxss')
  const workbenchView = read('pages/voice/workbench.wxml')
  const workbenchStyle = read('pages/voice/workbench.wxss')
  const purchaseView = read('pages/purchase/index.wxml')
  const purchaseStyle = read('pages/purchase/index.wxss')
  const homeView = read('pages/home/index.wxml')
  const homeStyle = read('pages/home/index.wxss')

  assert.match(selectVideoView, /class="media-tabs"/)
  assert.match(selectVideoView, /class="media-grid"/)
  assert.match(selectVideoView, /class="selection-circle/)
  assert.match(selectVideoView, /class="selection-footer/)
  assert.match(selectVideoView, /class="footer-next"/)
  assert.doesNotMatch(selectVideoView, /thumb-person/)
  assert.match(selectVideoStyle, /\.selection-footer\s*\{[^}]*position:\s*fixed/s)
  assert.match(selectVideoStyle, /@media \(max-height:\s*740px\)/)

  assert.match(clipView, /class="wave-selection" style="left: \{\{startPercent\}\}%; width: \{\{selectionPercent\}\}%;"/)
  assert.match(clipView, /class="clip-footer/)
  assert.match(clipView, />\s*\{\{saving \? '正在保存片段…' : '下一步'\}\}\s*</)
  assert.match(clipStyle, /\.clip-footer\s*\{[^}]*position:\s*fixed/s)
  assert.match(clipStyle, /@media \(max-height:\s*740px\)/)

  assert.match(workbenchView, /class="exact-primary-card/)
  assert.match(workbenchView, /class="primary-button exact-generate/)
  assert.doesNotMatch(workbenchView, /class="exact-action/)
  assert.match(workbenchStyle, /@media \(max-height:\s*740px\)/)

  assert.match(purchaseView, /class="product-card/)
  assert.match(purchaseView, /class="purchase-footer/)
  assert.match(purchaseView, /purchaseOption\.points/)
  assert.doesNotMatch(purchaseView, /10次|购买10次/)
  assert.match(purchaseStyle, /\.purchase-footer\s*\{[^}]*position:\s*fixed/s)

  assert.match(homeView, /class="hero/)
  assert.match(homeView, /class="voice-card/)
  assert.match(homeView, /class="voice-avatar fallback"/)
  assert.match(homeView, /class="fallback-wave"/)
  assert.match(homeStyle, /padding:\s*0 32rpx calc\(132rpx \+ env\(safe-area-inset-bottom\)\)/)
})

test('P1 screens use simplified hierarchy while retaining real business actions', () => {
  const progressView = read('pages/create/progress.wxml')
  const previewView = read('pages/create/preview.wxml')
  const profileView = read('pages/create/voice-profile.wxml')
  const profileStyle = read('pages/create/voice-profile.wxss')
  const workbenchView = read('pages/voice/workbench.wxml')

  assert.match(progressView, /class="simple-stages"/)
  assert.doesNotMatch(progressView, /stages-card|time-card|status-pill/)

  assert.match(previewView, /wx:if="\{\{avatarUrl\}\}"/)
  assert.match(previewView, /bindtap="acceptPreview"/)
  assert.match(previewView, /bindtap="retryPreview"/)
  assert.match(previewView, /¥9\.9 购买 50 个账号积分/)

  assert.match(profileView, /class="permission-card/)
  assert.match(profileView, /class="consent-card/)
  assert.match(profileView, /class="profile-footer/)
  assert.match(profileView, /bindtap="submit"/)
  assert.match(profileStyle, /\.profile-footer\s*\{[^}]*position:\s*fixed/s)

  assert.match(workbenchView, /class="mode-card-summary"/)
  assert.match(workbenchView, /两种模式共享账号积分，仅成功生成后扣减/)
})

test('current account-points contract remains visible and no legacy ten-use copy returns', () => {
  const files = [
    'pages/create/preview.wxml',
    'pages/purchase/index.wxml',
    'pages/voice/workbench.wxml',
    'components/quota-purchase-dialog/quota-purchase-dialog.wxml'
  ].map(read).join('\n')

  assert.match(files, /账号积分/)
  assert.match(files, /成功生成/)
  assert.doesNotMatch(files, /¥9\.9\s*\/\s*10次|购买10次|10 次额度/)
})
