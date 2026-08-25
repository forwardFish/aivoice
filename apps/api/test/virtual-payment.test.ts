import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { VirtualPayService } from '../src/payments/virtual-pay.service.js';

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('virtual payment signs the official requestVirtualPayment payload without exposing session_key', async () => {
  const names = [
    'WECHAT_PAYMENT_MODE', 'WECHAT_VIRTUAL_PAY_ENV', 'WECHAT_VIRTUAL_PAY_OFFER_ID',
    'WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY', 'WECHAT_VIRTUAL_PAY_MCH_ID', 'WECHAT_VIRTUAL_PAY_PRODUCT_ID',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    WECHAT_PAYMENT_MODE: 'virtual',
    WECHAT_VIRTUAL_PAY_ENV: '1',
    WECHAT_VIRTUAL_PAY_OFFER_ID: 'offer-risk',
    WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY: 'sandbox-app-key',
    WECHAT_VIRTUAL_PAY_PRODUCT_ID: 'POINTS_50',
  });
  try {
    const service = new VirtualPayService({} as any, {} as any, {
      async exchangeWithSession() {
        return { openid: 'openid-risk', sessionKey: 'session-key-risk' };
      },
    } as any);
    const result = await service.createPayment({ id: 'order-id', orderNo: 'av1234567890', amountFen: 990 }, 'openid-risk', 'wx-code');
    const signData = JSON.parse(result.payment.signData);
    assert.deepEqual(signData, {
      offerId: 'offer-risk', buyQuantity: 1, env: 1, currencyType: 'CNY', productId: 'POINTS_50',
      goodsPrice: 990, outTradeNo: 'av1234567890', attach: 'order-id',
    });
    assert.equal(result.payment.paySig, createHmac('sha256', 'sandbox-app-key')
      .update(`requestVirtualPayment&${result.payment.signData}`).digest('hex'));
    assert.equal(result.payment.signature, createHmac('sha256', 'session-key-risk')
      .update(result.payment.signData).digest('hex'));
    assert.equal(service.merchantId(), 'offer-risk');
    assert.equal(JSON.stringify(result).includes('session-key-risk'), false);
  } finally {
    for (const name of names) restore(name, previous[name]);
  }
});

test('virtual payment polling validates amount, grants points once through authority and marks delivery', async () => {
  const names = [
    'WECHAT_PAYMENT_MODE', 'WECHAT_VIRTUAL_PAY_ENV', 'WECHAT_VIRTUAL_PAY_OFFER_ID',
    'WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY', 'WECHAT_VIRTUAL_PAY_MCH_ID', 'WECHAT_VIRTUAL_PAY_PRODUCT_ID',
    'WECHAT_APP_ID', 'WECHAT_APP_SECRET',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    WECHAT_PAYMENT_MODE: 'virtual', WECHAT_VIRTUAL_PAY_ENV: '1', WECHAT_VIRTUAL_PAY_OFFER_ID: 'offer-risk',
    WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY: 'sandbox-app-key', WECHAT_VIRTUAL_PAY_MCH_ID: 'virtual-mch',
    WECHAT_VIRTUAL_PAY_PRODUCT_ID: 'POINTS_50', WECHAT_APP_ID: 'wx-risk', WECHAT_APP_SECRET: 'wx-secret',
  });
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  const grantCalls: any[] = [];
  const order = {
    id: 'order-id', userId: 'user-id', orderNo: 'av1234567890', amountFen: 990,
    payerOpenid: 'openid-risk', pointsGrantedAt: null,
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url.includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'access-token', expires_in: 7200 }));
    if (url.includes('/xpay/query_order')) {
      const parsed = new URL(url);
      const rawBody = JSON.stringify(body);
      assert.equal(parsed.searchParams.get('pay_sig'), createHmac('sha256', 'sandbox-app-key')
        .update(`/xpay/query_order&${rawBody}`).digest('hex'));
      return new Response(JSON.stringify({
        errcode: 0,
        order: { order_id: order.orderNo, status: 2, paid_fee: 990, paid_time: 1_780_000_000, wxpay_order_id: 'wxpay-risk' },
      }));
    }
    if (url.includes('/xpay/notify_provide_goods')) return new Response(JSON.stringify({ errcode: 0 }));
    throw new Error(`unexpected URL ${url}`);
  };
  try {
    const service = new VirtualPayService({
      async findUserOrder() { return order; },
    } as any, {
      async grantPurchasedPoints(input: any) { grantCalls.push(input); return { balance: 60 }; },
    } as any, {} as any);
    const result = await service.refreshOrder('user-id', 'order-id');
    assert.equal(result.granted, true);
    assert.equal(grantCalls.length, 1);
    assert.equal(grantCalls[0].amountFen, 990);
    assert.equal(grantCalls[0].mchId, 'virtual-mch');
    assert.equal(grantCalls[0].payerOpenid, 'openid-risk');
    assert.equal(calls.some((item) => item.url.includes('/xpay/notify_provide_goods')), true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) restore(name, previous[name]);
  }
});
