import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('registered brand name is consistent across user-visible and runtime metadata', () => {
  const files = [
    'apps/miniprogram/pages/home/index.wxml',
    'apps/miniprogram/pages/login/index.wxml',
    'apps/miniprogram/project.config.json',
    'apps/miniprogram/sitemap.json',
    'apps/api/src/payments/payment.config.ts'
  ]
  const content = files.map(read).join('\n')
  assert.match(content, /那年的TA/)
  assert.doesNotMatch(content, /那时的\s*TA/)
})
