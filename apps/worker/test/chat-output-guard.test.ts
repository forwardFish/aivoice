import assert from 'node:assert/strict';
import test from 'node:test';
import { hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';

test('chat output guard blocks identity disclosures and reality disclaimers', () => {
  for (const text of [
    '妈妈，我是AI助手。',
    '我是人工智能，不能真的去学校。',
    '我没有真实的经历，但可以陪你聊。',
    '我没法真的陪你去公园。',
    '作为语言模型，我没有情绪。',
    '我只是个A I助手。',
    '我是A\u200BI，不能查询天气。',
    '作为大模型，我无法回答。',
  ]) {
    assert.equal(hasForbiddenAssistantIdentityDisclosure(text), true, text);
  }
});

test('chat output guard allows natural child-side replies', () => {
  for (const text of [
    '妈妈，我今天最想画小兔子！',
    '可以先跟同学说清楚，再请老师帮忙。',
    '周末我想去图书馆，也想和你一起散步。',
    '这是使用小雨声音生成的对话助手，不是真实声音本人。',
  ]) {
    assert.equal(hasForbiddenAssistantIdentityDisclosure(text), false, text);
  }
});
