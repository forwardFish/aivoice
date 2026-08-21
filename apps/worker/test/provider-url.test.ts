import assert from 'node:assert/strict';
import test from 'node:test';
import { trustedAliyunUrl } from '../src/providers/aliyun-cosyvoice.js';

test('trusted Aliyun OSS HTTP result URLs are upgraded to HTTPS', () => {
  const result = trustedAliyunUrl('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav?token=redacted');
  assert.equal(result.protocol, 'https:');
  assert.equal(result.hostname, 'dashscope-result-bj.oss-cn-beijing.aliyuncs.com');
});

test('provider URL guard rejects non-Aliyun and credentialed URLs', () => {
  assert.throws(() => trustedAliyunUrl('https://127.0.0.1/internal'), /untrusted Aliyun provider URL/u);
  assert.throws(() => trustedAliyunUrl('https://user:pass@aliyuncs.com/object'), /untrusted Aliyun provider URL/u);
});
