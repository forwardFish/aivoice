import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('button families share color tokens without forcing page-specific geometry', () => {
  const appStyle = read('app.wxss')
  const componentStyle = read('components/app-button/app-button.wxss')
  const loginStyle = read('pages/login/index.wxss')
  const progressStyle = read('pages/create/progress.wxss')
  const workbenchStyle = read('pages/voice/workbench.wxss')
  const dialogStyle = read('components/quota-purchase-dialog/quota-purchase-dialog.wxss')
  const dialogView = read('components/quota-purchase-dialog/quota-purchase-dialog.wxml')

  assert.match(appStyle, /--action-primary-start:\s*#6552f5/)
  assert.match(appStyle, /--action-primary-end:\s*#8d68f6/)
  assert.match(appStyle, /\.primary-button\s*\{[^}]*var\(--action-primary-start\)[^}]*var\(--action-primary-end\)/s)
  assert.match(appStyle, /\.secondary-button\s*\{[^}]*var\(--action-secondary-text\)[^}]*var\(--action-secondary-bg\)/s)
  assert.match(componentStyle, /\.is-primary[^}]*var\(--action-primary-start/)
  assert.match(loginStyle, /\.wechat-login-button[^}]*width:590rpx[^}]*height:120rpx[^}]*var\(--action-primary-start\)/s)
  assert.match(progressStyle, /\.leave-button[^}]*width:\s*100%[^}]*min-height:\s*96rpx[^}]*var\(--action-primary-start\)/s)
  const sendButtonBlock = workbenchStyle.match(/\.send-button\s*\{([^}]*)\}/s)?.[1] || ''
  const sendButtonMinWidth = Number(sendButtonBlock.match(/min-width:\s*(\d+)rpx/)?.[1] || 0)
  const sendButtonMinHeight = Number(sendButtonBlock.match(/min-height:\s*(\d+)rpx/)?.[1] || 0)
  assert.ok(sendButtonMinWidth >= 128, 'send button keeps a usable minimum width')
  assert.ok(sendButtonMinHeight >= 80, 'send button keeps a usable minimum touch height')
  assert.match(
    workbenchStyle,
    /\.quick-prompt-button\s*\{[^}]*width:\s*432rpx[^}]*min-height:\s*82rpx[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*line-height:\s*1\.3[^}]*text-align:\s*center/s
  )
  assert.match(dialogView, /<app-button[\s\S]*custom-class="buy-button"[\s\S]*bindaction="buy"/)
  assert.match(dialogStyle, /\.buy-button-row\s*\{[^}]*margin-top:\s*8rpx/s)
  assert.match(dialogStyle, /\.buy-button\s*\{[^}]*min-height:\s*94rpx/s)
})

test('button color normalization does not replace already-approved page layouts', () => {
  const views = [
    'pages/login/index.wxml',
    'pages/create/preview.wxml',
    'pages/voice/workbench.wxml',
    'pages/account/index.wxml'
  ].map(read).join('\n')
  assert.doesNotMatch(views, /wechat-login-shell|preview-actions|generate-action|logout-action/)
})
