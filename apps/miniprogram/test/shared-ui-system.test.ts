import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test('shared UI primitives are globally registered and replace repeated page implementations', () => {
  const app = JSON.parse(read('app.json'))
  assert.equal(app.usingComponents['app-button'], '/components/app-button/app-button')
  assert.equal(app.usingComponents['app-avatar'], '/components/app-avatar/app-avatar')
  assert.equal(app.usingComponents['app-chevron'], '/components/app-chevron/app-chevron')
  assert.equal(app.usingComponents['bottom-action-bar'], '/components/bottom-action-bar/bottom-action-bar')
  assert.equal(app.usingComponents['bottom-sheet'], '/components/bottom-sheet/bottom-sheet')
  assert.equal(app.usingComponents['menu-row'], '/components/menu-row/menu-row')
  assert.equal(app.usingComponents['voice-input-dock'], '/components/voice-input-dock/voice-input-dock')

  const fixedFooterPages = [
    'pages/create/select-video.wxml',
    'pages/create/select-clip.wxml',
    'pages/create/voice-profile.wxml',
    'pages/purchase/index.wxml'
  ].map(read).join('\n')
  assert.equal((fixedFooterPages.match(/<bottom-action-bar/g) || []).length, 4)
  assert.ok((fixedFooterPages.match(/<app-button/g) || []).length >= 4)

  const avatarPages = [
    'pages/home/index.wxml',
    'pages/voices/index.wxml',
    'pages/voice/workbench.wxml'
  ].map(read).join('\n')
  assert.ok((avatarPages.match(/<app-avatar/g) || []).length >= 4)

  const repeatedFooterStyles = [
    'pages/create/select-video.wxss',
    'pages/create/select-clip.wxss',
    'pages/create/voice-profile.wxss',
    'pages/purchase/index.wxss'
  ].map(read).join('\n')
  assert.doesNotMatch(repeatedFooterStyles, /\.(selection|clip|profile|purchase)-footer\s*\{[^}]*position:\s*fixed/s)

  const sheetPages = [read('pages/login/index.wxml'), read('pages/account/index.wxml')].join('\n')
  const sheetStyles = [read('pages/login/index.wxss'), read('pages/account/index.wxss')].join('\n')
  assert.equal((sheetPages.match(/<bottom-sheet/g) || []).length, 2)
  assert.doesNotMatch(sheetStyles, /\.(profile-mask|profile-editor-mask)\s*\{[^}]*position:\s*fixed/s)

  const menuPages = [read('pages/account/index.wxml'), read('pages/voice/settings.wxml')].join('\n')
  assert.ok((menuPages.match(/<menu-row/g) || []).length >= 7)

  const buttonPages = [
    read('pages/home/index.wxml'),
    read('pages/voices/index.wxml'),
    read('pages/voice/settings.wxml'),
    read('pages/account/service-detail.wxml')
  ].join('\n')
  assert.ok((buttonPages.match(/<app-button/g) || []).length >= 3)

  const settingsView = read('pages/voice/settings.wxml')
  assert.doesNotMatch(settingsView, /账户积分|订单与积分记录|阶段标签|对话风格|购买积分/)
  assert.match(settingsView, /声音名称/)
  assert.match(settingsView, /声音使用权限/)
  assert.match(settingsView, /清空当前对话/)
  assert.match(settingsView, /删除整个声音/)

  const pageStateView = read('components/page-state/page-state.wxml')
  const pageStateSource = read('components/page-state/page-state.ts')
  assert.match(pageStateView, /<app-button[^>]*label="\{\{actionText\}\}"/)
  assert.match(pageStateSource, /cloud\\\.callFunction|Failed to fetch/)

  assert.match(read('app.wxss'), /app-button,[\s\S]*display:block; width:100%/)
  assert.doesNotMatch(read('components/app-button/app-button.wxml'), /loading="\{\{loading\}\}"/)
  assert.match(read('components/app-button/app-button.wxml'), /class="button-spinner"/)

  const chevronConsumers = [read('components/menu-row/menu-row.wxml'), read('pages/home/index.wxml'), read('pages/voice/settings.wxml')].join('\n')
  assert.ok((chevronConsumers.match(/<app-chevron/g) || []).length >= 4)

  assert.match(read('pages/account/index.wxml'), /\/assets\/ui\/account-identity-hero\.png/)

  const nativeFormButtons = [read('pages/login/index.wxml'), read('pages/account/index.wxml')].join('\n')
  assert.equal((nativeFormButtons.match(/class="ui-form-button ui-form-button--secondary/g) || []).length, 2)
  assert.equal((nativeFormButtons.match(/class="ui-form-button ui-form-button--primary/g) || []).length, 2)
  assert.doesNotMatch(nativeFormButtons, /loading="\{\{(?:loading|updatingProfile)\}\}"/)
  assert.match(read('app.wxss'), /\.ui-form-actions\s*\{[^}]*padding:0 20rpx[^}]*gap:28rpx/s)
})

test('voice settings is composed from standard controls without page-local arrows or raw action buttons', () => {
  const settings = read('pages/voice/settings.wxml')
  const styles = read('pages/voice/settings.wxss')
  const menuRow = read('components/menu-row/menu-row.wxml')
  const menuStyles = read('components/menu-row/menu-row.wxss')

  assert.match(settings, /<app-button/)
  assert.match(settings, /<app-chevron/)
  assert.equal((settings.match(/<menu-row/g) || []).length, 2)
  assert.doesNotMatch(settings, /<button|class="[^"]*chevron/)
  assert.match(settings, /tone="danger"/)
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) 146rpx/)
  assert.match(menuRow, /tone-\{\{tone\}\}/)
  assert.match(menuStyles, /\.tone-danger/)
})

test('home empty state keeps one creation entry instead of repeating the primary CTA', () => {
  const home = read('pages/home/index.wxml')
  assert.doesNotMatch(home, /创建第一个声音|开始创建/)
  assert.equal((home.match(/createVoice/g) || []).length, 1)
})

test('select video footer keeps the page-specific row geometry while using the standard action component', () => {
  const view = read('pages/create/select-video.wxml')
  const style = read('pages/create/select-video.wxss')
  assert.match(view, /<bottom-action-bar[^>]*layout="row"/)
  assert.match(view, /<app-button[^>]*label="下一步"/)
  assert.match(style, /\.footer-action\s*\{[^}]*flex:\s*0\s+0\s+222rpx[^}]*width:222rpx/s)
})
