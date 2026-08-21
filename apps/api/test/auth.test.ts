import assert from 'node:assert/strict';
import test from 'node:test';
import { WechatCodeExchanger } from '../src/auth/wechat-code-exchanger.js';

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('production forbids mock login and real code2Session never exposes session_key', async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    WECHAT_MOCK_LOGIN: process.env.WECHAT_MOCK_LOGIN,
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET,
  };
  const originalFetch = globalThis.fetch;
  try {
    process.env.NODE_ENV = 'production';
    process.env.WECHAT_MOCK_LOGIN = 'true';
    await assert.rejects(new WechatCodeExchanger().exchange('mock:forbidden'), /forbidden in production/u);

    process.env.NODE_ENV = 'test';
    process.env.WECHAT_MOCK_LOGIN = 'false';
    process.env.WECHAT_APP_ID = 'wx-real-app';
    process.env.WECHAT_APP_SECRET = 'server-only-secret';
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'api.weixin.qq.com');
      assert.equal(url.searchParams.get('appid'), 'wx-real-app');
      assert.equal(url.searchParams.get('secret'), 'server-only-secret');
      assert.equal(url.searchParams.get('js_code'), 'real-wx-code');
      return new Response(JSON.stringify({
        openid: 'real-openid',
        unionid: 'real-unionid',
        session_key: 'must-never-leave-server',
      }), { status: 200 });
    };
    const exchanged = await new WechatCodeExchanger().exchange('real-wx-code');
    assert.deepEqual(exchanged, { openid: 'real-openid', unionid: 'real-unionid' });
    assert.equal('session_key' in exchanged, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('NODE_ENV', previous.NODE_ENV);
    restoreEnv('WECHAT_MOCK_LOGIN', previous.WECHAT_MOCK_LOGIN);
    restoreEnv('WECHAT_APP_ID', previous.WECHAT_APP_ID);
    restoreEnv('WECHAT_APP_SECRET', previous.WECHAT_APP_SECRET);
  }
});
