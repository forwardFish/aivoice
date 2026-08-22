import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { resolveVoiceAvatar, resolveVoiceDurationLabel } from '../utils/avatar'

test('home page consumes provided visual assets and custom tabbar shell', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const appConfig = fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')
  const homeMarkup = fs.readFileSync(path.join(appRoot, 'pages/home/index.wxml'), 'utf8')
  const homeSource = fs.readFileSync(path.join(appRoot, 'pages/home/index.ts'), 'utf8')
  const tabbarSource = fs.readFileSync(path.join(appRoot, 'custom-tab-bar/index.wxml'), 'utf8')

  assert.match(appConfig, /"custom"\s*:\s*true/)
  assert.match(homeMarkup, /home-hero-card\.png/)
  assert.match(homeMarkup, /arrow-circle\.png/)
  assert.match(homeMarkup, /waveform\.png/)
  assert.match(homeMarkup, /play-circle\.png/)
  assert.match(homeMarkup, /more-plain\.png/)
  assert.match(homeMarkup, /shopping-bag\.png/)
  assert.match(tabbarSource, /tab-label/)
  assert.match(homeSource, /resolveVoiceAvatar/)
  assert.match(homeSource, /resolveVoiceDurationLabel/)
  assert.doesNotMatch(homeMarkup, /继续对话/)
})

test('default voice avatars and real duration labels follow provided assets', () => {
  assert.equal(resolveVoiceAvatar({ name: '小雨·5岁' }), '/assets/avatars/child-girl-01.png')
  assert.equal(resolveVoiceAvatar({ name: '奶奶' }), '/assets/avatars/grandma-01.png')
  assert.equal(resolveVoiceAvatar({ name: '爷爷' }), '/assets/avatars/grandpa-01.png')
  assert.equal(resolveVoiceAvatar({ name: '妈妈' }), '/assets/avatars/woman-01.png')
  assert.equal(resolveVoiceAvatar({ name: '爸爸' }), '/assets/avatars/man-01.png')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 25000 }), '00:20')
  assert.equal(resolveVoiceDurationLabel({ clipStartMs: 5000, clipEndMs: 5000 }), '')
})
