import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from 'class-validator';
import { ProfileDto } from '../src/auth/auth.dto.js';
import { AuthService } from '../src/auth/auth.service.js';
import { WechatCodeExchanger } from '../src/auth/wechat-code-exchanger.js';
import type { DatabaseService } from '../src/db/database.service.js';

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('profile nickname accepts at most ten characters', async () => {
  const valid = Object.assign(new ProfileDto(), { nickname: '1234567890' });
  const invalid = Object.assign(new ProfileDto(), { nickname: '12345678901' });

  assert.equal((await validate(valid)).length, 0);
  assert.ok((await validate(invalid)).some((error) => error.property === 'nickname'));
});

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

test('CloudBase login uses atomic signup RPC and session RPC without Drizzle or pg', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'rpc_auth_login_wechat') {
        return {
          user: {
            id: 'user-cloud',
            openid: 'openid-cloud',
            unionid: 'unionid-cloud',
            nickname: '云端用户',
            avatarUrl: 'https://example.test/avatar.png',
            trialCustomGenerationGrantedAt: null,
            trialCustomGenerationConsumedAt: null,
          },
        };
      }
      return { sessionId: 'session-cloud' };
    },
    selectOne: async (table: string) => {
      assert.equal(table, 'point_accounts');
      return { balance: 10 };
    },
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
    get db(): never { throw new Error('Drizzle must not be used'); },
    get pool(): never { throw new Error('pg must not be used'); },
  } as unknown as DatabaseService;
  const exchanger = {
    exchange: async () => ({ openid: 'openid-cloud', unionid: 'unionid-cloud' }),
  } as unknown as WechatCodeExchanger;

  const result = await new AuthService(database, exchanger).login({
    code: 'wx-code',
    profile: { nickname: '云端用户1234567890', avatarUrl: 'https://example.test/avatar.png' },
  });

  assert.equal(result.user.id, 'user-cloud');
  assert.equal(result.points.balance, 10);
  assert.ok(result.token.length > 20);
  assert.deepEqual(calls.map((item) => item.name), [
    'rpc_auth_login_wechat',
    'rpc_auth_issue_session',
  ]);
  assert.equal(calls[0]?.args.pNickname, '云端用户123456');
  assert.equal(calls[0]?.args.pSignupBonusPoints, 10);
  assert.equal(typeof calls[1]?.args.pTokenHash, 'string');
});

test('CloudBase HTTP Function identity bypasses code2Session and rejects a mismatched AppID', async () => {
  const previousAppId = process.env.WECHAT_APP_ID;
  process.env.WECHAT_APP_ID = 'wx-risk-app';
  let exchangeCalls = 0;
  const cloud = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'rpc_auth_login_wechat') {
        assert.equal(args.pOpenid, 'openid-from-cloudbase');
        return {
          user: {
            id: 'user-risk',
            openid: 'openid-from-cloudbase',
            unionid: '',
            nickname: '',
            avatarUrl: '',
            trialCustomGenerationGrantedAt: null,
            trialCustomGenerationConsumedAt: null,
          },
        };
      }
      return { sessionId: 'session-risk' };
    },
    async selectOne() { return { balance: 10 }; },
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
  } as unknown as DatabaseService;
  const exchanger = {
    async exchange() {
      exchangeCalls += 1;
      return { openid: 'must-not-be-used', unionid: '' };
    },
  } as unknown as WechatCodeExchanger;
  try {
    const service = new AuthService(database, exchanger);
    const result = await service.login({}, { openid: 'openid-from-cloudbase', appid: 'wx-risk-app' });
    assert.equal(result.user.openid, 'openid-from-cloudbase');
    assert.equal(exchangeCalls, 0);
    await assert.rejects(
      service.login({}, { openid: 'openid-from-cloudbase', appid: 'wx-other-app' }),
      /does not match/u,
    );
  } finally {
    restoreEnv('WECHAT_APP_ID', previousAppId);
  }
});
