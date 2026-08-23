import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { resolveVoiceAvatar } from '../utils/default-avatar'

test('real voice avatar wins over every system default', () => {
  assert.equal(
    resolveVoiceAvatar({ id: 'voice-1', name: '奶奶', avatarUrl: 'https://example.test/avatar.png' }),
    'https://example.test/avatar.png'
  )
})

test('relationship labels and age hints receive the matching default portrait', () => {
  assert.equal(resolveVoiceAvatar({ id: 'girl', name: '女儿' }), '/assets/avatars/avatar-child-girl.png')
  assert.equal(resolveVoiceAvatar({ id: 'boy', name: '儿子' }), '/assets/avatars/avatar-child-boy.png')
  assert.equal(resolveVoiceAvatar({ id: 'mother', name: '妈妈' }), '/assets/avatars/avatar-mother.png')
  assert.equal(resolveVoiceAvatar({ id: 'father', name: '爸爸' }), '/assets/avatars/avatar-father.png')
  assert.equal(resolveVoiceAvatar({ id: 'grandma', name: '奶奶' }), '/assets/avatars/avatar-grandma.png')
  assert.equal(resolveVoiceAvatar({ id: 'grandpa', name: '爷爷' }), '/assets/avatars/avatar-grandpa.png')
  assert.equal(resolveVoiceAvatar({ id: 'rain', name: '小雨 · 5岁' }), '/assets/avatars/avatar-child-girl.png')
  assert.equal(resolveVoiceAvatar({ id: 'grandpa-age', name: '67岁爷爷' }), '/assets/avatars/avatar-grandpa.png')
})

test('fully ambiguous names still keep the neutral fallback', () => {
  assert.equal(resolveVoiceAvatar({ id: 'unknown', name: '这个声音' }), '')
  assert.equal(resolveVoiceAvatar({ id: 'empty', name: '' }), '')
})

test('default avatar assets remain small enough for the miniprogram package', () => {
  const root = path.resolve(process.cwd(), 'apps/miniprogram/assets/avatars')
  const files = fs.readdirSync(root).filter(file => file.endsWith('.png'))
  assert.equal(files.length, 6)
  const bytes = files.reduce((total, file) => total + fs.statSync(path.join(root, file)).size, 0)
  assert.ok(bytes < 700_000, `default avatar assets should stay below 700 KB, got ${bytes}`)
})

