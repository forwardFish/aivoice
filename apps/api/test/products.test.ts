import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductsController } from '../src/orders/order.controller.js';

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
    const result = new ProductsController().list();
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
