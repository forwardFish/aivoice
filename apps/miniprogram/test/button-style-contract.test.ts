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

  assert.match(appStyle, /--action-primary-start:\s*#6552f5/)
  assert.match(appStyle, /--action-primary-end:\s*#8d68f6/)
  assert.match(appStyle, /\.primary-button\s*\{[^}]*var\(--action-primary-start\)[^}]*var\(--action-primary-end\)/s)
  assert.match(appStyle, /\.secondary-button\s*\{[^}]*var\(--action-secondary-text\)[^}]*var\(--action-secondary-bg\)/s)
  assert.match(componentStyle, /\.is-primary[^}]*var\(--action-primary-start/)
  assert.match(loginStyle, /\.wechat-login-button[^}]*width:590rpx[^}]*height:120rpx[^}]*var\(--action-primary-start\)/s)
  assert.match(progressStyle, /\.leave-button[^}]*width:300rpx[^}]*height:62rpx[^}]*var\(--action-primary-start\)/s)
  assert.match(workbenchStyle, /\.send-button\s*\{[^}]*min-width:\s*112rpx[^}]*min-height:\s*74rpx/s)
  assert.match(dialogStyle, /\.buy-button\s*\{[^}]*min-height:\s*94rpx[^}]*var\(--action-primary-start/s)
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
