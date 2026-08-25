import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'apps/miniprogram')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test('voice input dock owns the shared bottom action styling and workbench consumes it', () => {
  const view = read('components/voice-input-dock/voice-input-dock.wxml')
  const style = read('components/voice-input-dock/voice-input-dock.wxss')
  const page = read('pages/voice/workbench.wxml')
  const pageStyle = read('pages/voice/workbench.wxss')

  assert.match(view, /class="voice-input-dock/)
  assert.match(view, /\/assets\/ui\/mic-mode\.png/)
  assert.match(style, /\.voice-input-dock\.is-fixed\s*\{[^}]*position:fixed/s)
  assert.match(style, /env\(safe-area-inset-bottom\)/)
  assert.match(page, /<voice-input-dock/)
  assert.doesNotMatch(pageStyle, /\.chat-dock|\.voice-hold-button|\.dock-side-button/)
})
