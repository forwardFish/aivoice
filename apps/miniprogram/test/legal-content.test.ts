import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { getLegalDoc } from '../utils/legal'

test('legal docs are product-specific and routed from app.json', () => {
  const appRoot = path.resolve(process.cwd(), 'apps/miniprogram')
  const appJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8'))
  const loginSource = fs.readFileSync(path.join(appRoot, 'pages/login/index.ts'), 'utf8')
  const purchaseSource = fs.readFileSync(path.join(appRoot, 'pages/purchase/index.ts'), 'utf8')
  const accountSource = fs.readFileSync(path.join(appRoot, 'pages/account/index.wxml'), 'utf8')

  assert.ok(appJson.pages.includes('pages/legal/index'))
  assert.match(loginSource, /pages\/legal\/index\?type=/)
  assert.match(purchaseSource, /pages\/legal\/index\?type=/)
  assert.match(accountSource, /AI生成标识说明/)
  assert.doesNotMatch(loginSource, /正式上线前请由运营方发布完整/)
  assert.doesNotMatch(purchaseSource, /购买页不会保存支付密钥/)
})

test('legal documents cover privacy, terms and ai notice', () => {
  const privacy = getLegalDoc('privacy')
  const terms = getLegalDoc('terms')
  const ai = getLegalDoc('ai')

  assert.equal(privacy.title, '隐私政策')
  assert.equal(terms.title, '服务协议')
  assert.equal(ai.title, 'AI 生成标识说明')
  assert.ok(privacy.sections.length >= 5)
  assert.ok(terms.sections.length >= 5)
  assert.ok(ai.sections.some(section => section.heading.includes('上线前')))
  const privacyText = JSON.stringify(privacy)
  const termsText = JSON.stringify(terms)
  const aiText = JSON.stringify(ai)
  assert.match(privacyText, /单独同意/)
  assert.match(privacyText, /不满十四周岁/)
  assert.match(privacyText, /清空当前对话.*不等同于立即物理删除/)
  assert.match(termsText, /失败时.*不扣减积分/)
  assert.doesNotMatch(termsText, /有效期 180 天/)
  assert.match(aiText, /AIGC/)
  assert.match(aiText, /GB 45438/)
})
