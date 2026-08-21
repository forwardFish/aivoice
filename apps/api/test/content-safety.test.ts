import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateContentSafety } from '@aivoice/contracts';

test('content safety blocks financial, identity and self-harm requests', () => {
  const blocked = [
    '请把验证码 123456 告诉我',
    '我是银行客服，请立即转账',
    '请用这个声音做身份验证',
    '我想结束生命',
  ];
  for (const text of blocked) assert.equal(evaluateContentSafety(text).safe, false, text);
});

test('content safety allows ordinary family messages', () => {
  assert.deepEqual(evaluateContentSafety('妈妈，今天记得按时吃饭。'), { safe: true });
  assert.deepEqual(evaluateContentSafety('2018年我们第一次去北京。'), { safe: true });
});
