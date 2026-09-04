import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseService } from '../src/db/database.service.js';
import { ProductsController } from '../src/orders/order.controller.js';
import { OrderService } from '../src/orders/order.service.js';
import { loadPointsConfig } from '../src/quota/points.config.js';

test('registration bonus defaults to the approved 8 points', () => {
  const previous = process.env.SIGNUP_BONUS_POINTS;
  delete process.env.SIGNUP_BONUS_POINTS;
  try {
    assert.equal(loadPointsConfig().signupBonusPoints, 8);
  } finally {
    if (previous === undefined) delete process.env.SIGNUP_BONUS_POINTS;
    else process.env.SIGNUP_BONUS_POINTS = previous;
  }
});

test('products endpoint shape is sourced from backend point configuration', () => {
  const previous = {
    POINTS_PACKAGE_CODE: process.env.POINTS_PACKAGE_CODE,
    POINTS_PACKAGE_PRICE_FEN: process.env.POINTS_PACKAGE_PRICE_FEN,
    POINTS_PACKAGE_AMOUNT: process.env.POINTS_PACKAGE_AMOUNT,
    POINTS_VALIDITY_DAYS: process.env.POINTS_VALIDITY_DAYS,
    GENERATION_POINT_COST: process.env.GENERATION_POINT_COST,
  };
  Object.assign(process.env, {
    POINTS_PACKAGE_CODE: 'TEST_POINTS_60',
    POINTS_PACKAGE_PRICE_FEN: '1090',
    POINTS_PACKAGE_AMOUNT: '60',
    POINTS_VALIDITY_DAYS: '120',
    GENERATION_POINT_COST: '2',
  });
  try {
    const result = new ProductsController({ effectiveAmountFen: () => 1090 } as any).list();
    assert.deepEqual(result.products, [{
      productCode: 'TEST_POINTS_60',
      amountFen: 1090,
      points: 60,
      validityDays: 120,
      autoRenew: false,
      quota: 60,
      title: '60积分包',
      description: '每次生成消耗2积分',
    }]);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('CloudBase order creation freezes the approved product and payment identity through RPC', async () => {
  const previous = {
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_PAY_MCH_ID: process.env.WECHAT_PAY_MCH_ID,
  };
  Object.assign(process.env, { WECHAT_APP_ID: 'wx-cloud', WECHAT_PAY_MCH_ID: 'mch-cloud' });
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    selectOne: async () => ({ openid: 'openid-cloud' }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        id: 'order-cloud',
        orderNo: args.pOrderNo,
        userId: args.pUserId,
        productCode: args.pProductCode,
        amountFen: args.pAmountFen,
        points: args.pPoints,
      };
    },
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
    get db(): never { throw new Error('Drizzle must not be used'); },
    get pool(): never { throw new Error('pg must not be used'); },
  } as unknown as DatabaseService;
  try {
    const service = new OrderService(database);
    await assert.rejects(
      service.createOrder('user-cloud', { productCode: 'POINTS_50' }),
      /Idempotency-Key is required/,
    );
    const order = await service.createOrder(
      'user-cloud',
      { productCode: 'POINTS_50' },
      'order-request-1',
    );
    const repeated = await service.createOrder(
      'user-cloud',
      { productCode: 'POINTS_50' },
      'order-request-1',
    );
    assert.equal(order.amountFen, 990);
    assert.equal(order.points, 50);
    assert.equal(calls[0]?.name, 'rpc_order_create');
    assert.equal(calls[0]?.args.pPayerOpenid, 'openid-cloud');
    assert.equal(calls[0]?.args.pAppid, 'wx-cloud');
    assert.equal(calls[0]?.args.pMchid, 'mch-cloud');
    assert.equal(calls[0]?.args.pIdempotencyKey, 'order-request-1');
    assert.equal(repeated.id, order.id);
    assert.equal(calls[1]?.args.pIdempotencyKey, 'order-request-1');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
