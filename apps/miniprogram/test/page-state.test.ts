import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('page-state hides technical descriptions in error mode and uses app-button for actions', () => {
  const markup = readFileSync(new URL('../components/page-state/page-state.wxml', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../components/page-state/page-state.wxss', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../components/page-state/page-state.json', import.meta.url), 'utf8'))

  assert.match(markup, /description\s*&&\s*mode\s*!==\s*'error'/)
  assert.match(markup, /<app-button label="\{\{actionText\}\}" size="medium" bindaction="onAction"><\/app-button>/)
  assert.equal(config.usingComponents['app-button'], '/components/app-button/app-button')
  assert.match(styles, /\.state-action\s*\{[^}]*width:\s*300rpx[^}]*margin-top:\s*34rpx/s)
  assert.doesNotMatch(markup, /<button[^>]*class="state-action"/)
})

test('progress page error states use shared app buttons instead of raw native buttons', () => {
  const markup = readFileSync(new URL('../pages/create/progress.wxml', import.meta.url), 'utf8')

  assert.match(markup, /<app-button variant="secondary" label="返回我的声音" bindaction="goVoices"><\/app-button>/)
  assert.match(markup, /<app-button label="重新选择片段" bindaction="retry"><\/app-button>/)
  assert.doesNotMatch(markup, /<button class="primary-button" bindtap="retry">重新选择片段<\/button>/)
})
