import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import type { DatabaseService } from '../src/db/database.service.js';
import type { OrderService } from '../src/orders/order.service.js';
import { QuotaService } from '../src/quota/quota.service.js';
import { WechatPayService, type WechatTransaction } from '../src/payments/wechat-pay.service.js';

function privatePem(key: crypto.KeyObject): string {
  return key.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function publicPem(key: crypto.KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function encryptNotify(apiV3Key: string, payload: WechatTransaction) {
  const nonce = 'notify-nonce-001';
  const associatedData = 'transaction';
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64'),
    associated_data: associatedData,
    nonce,
  };
}

test('WeChat Pay creates signed JSAPI params and notification grants quota once', async () => {
  const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const apiV3Key = '12345678901234567890123456789012';
  Object.assign(process.env, {
    WECHAT_APP_ID: 'wx-test-app',
    WECHAT_PAY_MCH_ID: 'mch-test',
    WECHAT_PAY_SERIAL_NO: 'serial-test',
    WECHAT_PAY_PRIVATE_KEY: privatePem(merchant.privateKey),
    WECHAT_PAY_PLATFORM_CERT: publicPem(platform.publicKey),
    WECHAT_PAY_API_V3_KEY: apiV3Key,
    WECHAT_PAY_NOTIFY_URL: 'https://example.test/v1/payments/wechat/notify',
  });

  const grants: unknown[] = [];
  const database = {
    db: {
      query: {
        users: {
          findFirst: async () => ({ id: 'user-id', openid: 'openid-owner' }),
        },
      },
    },
  } as unknown as DatabaseService;
  const orderService = {
    attachPrepay: async (_id: string, prepayId: string) => ({ prepayId }),
    findByOrderNo: async () => ({
      id: 'order-id',
      orderNo: 'order-no',
      userId: 'user-id',
      voiceProfileId: 'voice-id',
      amountFen: 990,
      quota: 50,
      points: 50,
    }),
  } as unknown as OrderService;
  const quotaService = {
    grantPurchasedPoints: async (input: unknown) => {
      grants.push(input);
      return { paidQuotaRemaining: 50 };
    },
  } as unknown as QuotaService;
  const service = new WechatPayService(database, orderService, quotaService);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.match(String(new Headers(init?.headers).get('Authorization')), /^WECHATPAY2-SHA256-RSA2048 /);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount.total, 990);
    assert.equal(body.payer.openid, 'openid-owner');
    return new Response(JSON.stringify({ prepay_id: 'wx-prepay-id' }), { status: 200 });
  };
  try {
    const prepay = await service.createPrepay({
      id: 'order-id',
      orderNo: 'order-no',
      userId: 'user-id',
      voiceProfileId: 'voice-id',
      productCode: 'POINTS_50',
      amountFen: 990,
      quota: 50,
      points: 50,
      status: 'PENDING',
      prepayId: '',
      transactionId: null,
      paidAt: null,
      quotaGrantedAt: null,
      pointsGrantedAt: null,
      notifyDigest: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, 'openid-owner');
    assert.equal(prepay.payment.package, 'prepay_id=wx-prepay-id');
    assert.equal(prepay.payment.signType, 'RSA');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const transaction: WechatTransaction = {
    appid: 'wx-test-app',
    mchid: 'mch-test',
    out_trade_no: 'order-no',
    transaction_id: 'transaction-id',
    trade_state: 'SUCCESS',
    success_time: '2026-08-21T15:00:00+08:00',
    payer: { openid: 'openid-owner' },
    amount: { total: 990, currency: 'CNY' },
  };
  const body = {
    event_type: 'TRANSACTION.SUCCESS',
    resource: encryptNotify(apiV3Key, transaction),
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const notifyNonce = 'header-nonce';
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${timestamp}\n${notifyNonce}\n${rawBody.toString('utf8')}\n`)
    .sign(platform.privateKey, 'base64');
  await service.handleNotify({
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': notifyNonce,
      'wechatpay-signature': signature,
    },
    body,
    rawBody,
  });
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0], {
    userId: 'user-id',
    orderId: 'order-id',
    transactionId: 'transaction-id',
    paidAt: new Date('2026-08-21T15:00:00+08:00'),
    orderNo: 'order-no',
    notifyDigest: crypto.createHash('sha256').update(rawBody).digest('hex'),
    appId: 'wx-test-app',
    mchId: 'mch-test',
    payerOpenid: 'openid-owner',
    amountFen: 990,
  });
});

test('WeChat Pay notification supports the configured WeChat Pay public key id', () => {
  const wechatPay = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  delete process.env.WECHAT_PAY_PLATFORM_CERT;
  delete process.env.WECHAT_PAY_PLATFORM_CERT_PATH;
  Object.assign(process.env, {
    WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_TEST',
    WECHAT_PAY_PUBLIC_KEY: publicPem(wechatPay.publicKey),
  });
  const service = new WechatPayService(
    {} as DatabaseService,
    {} as OrderService,
    {} as QuotaService,
  );
  const rawBody = Buffer.from('{"event_type":"TRANSACTION.SUCCESS"}');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 'public-key-notify-nonce';
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`)
    .sign(wechatPay.privateKey, 'base64');

  assert.equal(service.verifyNotifySignature({
    'wechatpay-serial': 'PUB_KEY_ID_TEST',
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-signature': signature,
  }, rawBody), true);
  assert.equal(service.verifyNotifySignature({
    'wechatpay-serial': 'WRONG_KEY_ID',
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-signature': signature,
  }, rawBody), false);
});

test('CloudBase notify and active query converge on rpc_payment_apply_success', async () => {
  const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const apiV3Key = '12345678901234567890123456789012';
  Object.assign(process.env, {
    WECHAT_APP_ID: 'wx-cloud-app',
    WECHAT_PAY_MCH_ID: 'mch-cloud',
    WECHAT_PAY_SERIAL_NO: 'serial-cloud',
    WECHAT_PAY_PRIVATE_KEY: privatePem(merchant.privateKey),
    WECHAT_PAY_PLATFORM_CERT: publicPem(platform.publicKey),
    WECHAT_PAY_API_V3_KEY: apiV3Key,
    WECHAT_PAY_NOTIFY_URL: 'https://api.example.test/v1/payments/wechat/notify',
  });
  const transaction: WechatTransaction = {
    appid: 'wx-cloud-app',
    mchid: 'mch-cloud',
    out_trade_no: 'order-no-cloud',
    transaction_id: 'transaction-cloud',
    trade_state: 'SUCCESS',
    success_time: '2026-08-22T08:00:00+08:00',
    payer: { openid: 'openid-cloud' },
    amount: { total: 990, currency: 'CNY' },
  };
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    selectOne: async (table: string) => {
      if (table === 'users') return { id: 'user-cloud', openid: 'openid-cloud' };
      if (table === 'orders') return { orderNo: 'order-no-cloud', amountFen: 990 };
      return null;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'rpc_payment_apply_success') return { balance: 60, credited: true };
      return { recorded: true };
    },
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
    get db(): never { throw new Error('Drizzle must not be used'); },
    get pool(): never { throw new Error('pg must not be used'); },
  } as unknown as DatabaseService;
  const order = {
    id: 'order-id-cloud',
    orderNo: 'order-no-cloud',
    userId: 'user-cloud',
    amountFen: 990,
    pointsGrantedAt: null,
  };
  const orderService = {
    findByOrderNo: async () => order,
    findUserOrder: async () => order,
  } as unknown as OrderService;
  const service = new WechatPayService(database, orderService, new QuotaService(database));

  const body = { id: 'event-cloud', event_type: 'TRANSACTION.SUCCESS', resource: encryptNotify(apiV3Key, transaction) };
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const notifyNonce = 'notify-cloud';
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${timestamp}\n${notifyNonce}\n${rawBody.toString('utf8')}\n`)
    .sign(platform.privateKey, 'base64');
  await service.handleNotify({
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': notifyNonce,
      'wechatpay-signature': signature,
      'request-id': 'request-cloud',
    },
    body,
    rawBody,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(transaction), { status: 200 });
  try {
    const refreshed = await service.refreshOrder('user-cloud', 'order-id-cloud');
    assert.equal(refreshed.granted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(rpcCalls.map((item) => item.name), [
    'rpc_payment_record_notify_event',
    'rpc_payment_apply_success',
    'rpc_payment_apply_success',
  ]);
  for (const call of rpcCalls.filter((item) => item.name === 'rpc_payment_apply_success')) {
    assert.equal(call.args.pAppid, 'wx-cloud-app');
    assert.equal(call.args.pMchid, 'mch-cloud');
    assert.equal(call.args.pPayerOpenid, 'openid-cloud');
    assert.equal(call.args.pAmountFen, 990);
  }
});
