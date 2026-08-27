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
  const accountSource = fs.readFileSync(path.join(appRoot, 'pages/account/index.ts'), 'utf8')
  const accountMarkup = fs.readFileSync(path.join(appRoot, 'pages/account/index.wxml'), 'utf8')
  const legalMarkup = fs.readFileSync(path.join(appRoot, 'pages/legal/index.wxml'), 'utf8')
  const legalStyles = fs.readFileSync(path.join(appRoot, 'pages/legal/index.wxss'), 'utf8')

  assert.ok(appJson.pages.includes('pages/legal/index'))
  assert.match(loginSource, /pages\/legal\/index\?type=/)
  assert.match(purchaseSource, /pages\/legal\/index\?type=/)
  assert.match(accountSource, /LEGAL_ROUTE_MAP/)
  assert.match(accountSource, /data-privacy/)
  assert.match(accountSource, /pages\/legal\/index\?type=/)
  assert.doesNotMatch(accountSource, /wx\.showModal/)
  assert.match(accountMarkup, /AI生成标识说明/)
  assert.match(accountMarkup, /itemKey="help"/)
  assert.match(accountMarkup, /itemKey="service"/)
  assert.match(accountMarkup, /itemKey="feedback"/)
  assert.match(accountMarkup, /itemKey="privacy"/)
  assert.match(accountMarkup, /itemKey="rules"/)
  assert.match(accountMarkup, /itemKey="policy"/)
  assert.match(accountMarkup, /itemKey="terms"/)
  assert.match(accountMarkup, /itemKey="ai"/)
  assert.match(legalMarkup, /<app-nav[^>]*back="\{\{true\}\}"/)
  assert.match(legalMarkup, /<scroll-view[^>]*scroll-y/)
  assert.match(legalStyles, /\.legal-screen\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden[^}]*display:\s*flex/s)
  assert.match(legalStyles, /\.legal-scroll\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*height:\s*auto/s)
  assert.match(legalStyles, /safe-area-inset-bottom/)
  assert.doesNotMatch(loginSource, /正式上线前请由运营方发布完整/)
  assert.doesNotMatch(purchaseSource, /购买页不会保存支付密钥/)
})

test('legal documents cover all account entry types', () => {
  const help = getLegalDoc('help')
  const service = getLegalDoc('service')
  const feedback = getLegalDoc('feedback')
  const dataPrivacy = getLegalDoc('data-privacy')
  const rules = getLegalDoc('rules')
  const privacy = getLegalDoc('privacy')
  const terms = getLegalDoc('terms')
  const ai = getLegalDoc('ai')

  assert.equal(help.title, '使用帮助')
  assert.equal(service.title, '退款与售后')
  assert.equal(feedback.title, '意见反馈')
  assert.equal(dataPrivacy.title, '数据与隐私')
  assert.equal(rules.title, '声音使用规则')
  assert.equal(privacy.title, '隐私政策')
  assert.equal(terms.title, '服务协议')
  assert.equal(ai.title, 'AI 生成标识说明')
  assert.ok(help.sections.length >= 3)
  assert.ok(service.sections.length >= 3)
  assert.ok(feedback.sections.length >= 3)
  assert.ok(dataPrivacy.sections.length >= 3)
  assert.ok(rules.sections.length >= 3)
  assert.ok(privacy.sections.length >= 5)
  assert.ok(terms.sections.length >= 5)
  assert.ok(ai.sections.some(section => section.heading.includes('上线前')))
  assert.match(JSON.stringify(help), /8.*60 秒.*视频素材/)
  assert.match(JSON.stringify(service), /积分未到账/)
  assert.match(JSON.stringify(feedback), /页面截图/)
  assert.match(JSON.stringify(dataPrivacy), /清空当前对话/)
  assert.match(JSON.stringify(rules), /身份核验/)
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

test('every service and privacy menu entry opens its complete document page', async () => {
  let pageDefinition: any
  const navigated: string[] = []
  ;(globalThis as any).Page = (definition: any) => { pageDefinition = definition }
  ;(globalThis as any).getCurrentPages = () => []
  ;(globalThis as any).wx = {
    navigateTo: ({ url }: { url: string }) => { navigated.push(url) }
  }

  await import('../pages/account/index?case=all-info-routes')
  assert.ok(pageDefinition)

  for (const key of ['help', 'service', 'feedback', 'privacy', 'rules', 'policy', 'terms', 'ai']) {
    pageDefinition.showInfo({ detail: { key }, currentTarget: { dataset: {} } })
  }

  assert.deepEqual(navigated, [
    '/pages/legal/index?type=help',
    '/pages/legal/index?type=service',
    '/pages/legal/index?type=feedback',
    '/pages/legal/index?type=data-privacy',
    '/pages/legal/index?type=rules',
    '/pages/legal/index?type=privacy',
    '/pages/legal/index?type=terms',
    '/pages/legal/index?type=ai'
  ])
})
