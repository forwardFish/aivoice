import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
// @ts-expect-error JavaScript HTTP Function module intentionally has no declaration file.
import { decryptWechatMessage, handleVirtualPayEvent, messageSignature, verifyMessageSignature } from '../../../cloudfunctions/aivoice-xpay-events/handler.mjs';

test('virtual payment message signatures and AES envelope bind to the expected AppID', () => {
  const token = 'message-token';
  const timestamp = '1780000000';
  const nonce = 'nonce';
  const encodingKey = Buffer.alloc(32, 7).toString('base64').replace(/=$/, '');
  const key = Buffer.from(`${encodingKey}=`, 'base64');
  const message = JSON.stringify({ Event: 'xpay_goods_deliver_notify' });
  const appId = 'wx-risk';
  const plain = Buffer.alloc(20 + Buffer.byteLength(message) + Buffer.byteLength(appId));
  Buffer.alloc(16, 1).copy(plain, 0);
  plain.writeUInt32BE(Buffer.byteLength(message), 16);
  plain.write(message, 20);
  plain.write(appId, 20 + Buffer.byteLength(message));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64');
  const signature = messageSignature(token, timestamp, nonce, encrypted);
  assert.equal(verifyMessageSignature({ token, timestamp, nonce, signature, encrypted }), true);
  assert.equal(decryptWechatMessage(encrypted, encodingKey, appId), message);
  assert.throws(() => decryptWechatMessage(encrypted, encodingKey, 'wx-other'), /AppID mismatch/u);
});

test('goods delivery grants once through the existing payment RPC and refund uses the refund RPC', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const runtime = {
    async selectOne(table: string, options: any) {
      assert.equal(table, 'orders');
      assert.equal(options.filters.orderNo, 'av-risk-order');
      return { id: 'order-id', userId: 'user-id', orderNo: 'av-risk-order', payerOpenid: 'openid-risk', amountFen: 990, points: 50, status: 'PENDING' };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { balance: 60 };
    },
  };
  const delivery = await handleVirtualPayEvent({
    Event: 'xpay_goods_deliver_notify',
    OpenId: 'openid-risk',
    OutTradeNo: 'av-risk-order',
    GoodsInfo: { ProductId: 'POINTS_50', ActualPrice: 990 },
    WeChatPayInfo: { TransactionId: 'wxpay-risk', PaidTime: 1_780_000_000 },
  }, { runtime, appId: 'wx-risk', merchantId: 'virtual-mch', productId: 'POINTS_50' });
  assert.deepEqual(delivery, { ErrCode: 0, ErrMsg: 'success' });
  assert.equal(rpcCalls[0].name, 'rpc_payment_apply_success');
  assert.equal(rpcCalls[0].args.pAmountFen, 990);
  assert.equal(rpcCalls[0].args.pPayerOpenid, 'openid-risk');

  const refund = await handleVirtualPayEvent({
    Event: 'xpay_refund_notify', MchOrderId: 'av-risk-order', WxRefundId: 'refund-risk',
    RefundFee: 990, RetCode: 0, RefundSuccTimestamp: 1_780_000_100,
  }, { runtime, appId: 'wx-risk', merchantId: 'virtual-mch', productId: 'POINTS_50' });
  assert.deepEqual(refund, { ErrCode: 0, ErrMsg: 'success' });
  assert.equal(rpcCalls[1].name, 'rpc_virtual_payment_apply_refund');
  assert.equal(rpcCalls[1].args.pRefundFee, 990);
});

test('iOS refund advice allows full point recovery and rejects already-consumed packages', async () => {
  let balance = 50;
  const runtime = {
    async selectOne(table: string) {
      if (table === 'orders') return { id: 'order-id', userId: 'user-id', orderNo: 'av-risk-order', transactionId: 'pay-risk', status: 'PAID', points: 50 };
      if (table === 'point_accounts') return { balance };
      return null;
    },
  };
  const input = { Event: 'xpay_subscribe_ios_refund_query_notify', pay_order_id: 'pay-risk' };
  const allowed = await handleVirtualPayEvent(input, { runtime, appId: 'wx-risk', merchantId: 'virtual-mch' });
  assert.equal(allowed.result_code, 0);
  balance = 12;
  const rejected = await handleVirtualPayEvent(input, { runtime, appId: 'wx-risk', merchantId: 'virtual-mch' });
  assert.equal(rejected.result_code, 1);
});
