import crypto from 'node:crypto';

const success = { ErrCode: 0, ErrMsg: 'success' };

export function messageSignature(token, timestamp, nonce, encrypted = '') {
  return crypto.createHash('sha1').update([token, timestamp, nonce, encrypted].filter(Boolean).sort().join('')).digest('hex');
}

export function verifyMessageSignature({ token, timestamp, nonce, signature, encrypted = '' }) {
  const expected = messageSignature(token, timestamp, nonce, encrypted);
  const provided = String(signature || '');
  return expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function decryptWechatMessage(encrypted, encodingAesKey, expectedAppId) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) throw new Error('invalid WeChat EncodingAESKey');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
  if (plaintext.length < 20) throw new Error('encrypted WeChat message is truncated');
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plaintext.length) throw new Error('encrypted WeChat message length is invalid');
  const message = plaintext.toString('utf8', 20, messageEnd);
  const appId = plaintext.toString('utf8', messageEnd);
  if (expectedAppId && appId !== expectedAppId) throw new Error('encrypted WeChat message AppID mismatch');
  return message;
}

function field(value, ...names) {
  for (const name of names) if (value?.[name] !== undefined && value?.[name] !== null) return value[name];
  return undefined;
}

async function findOrder(runtime, value) {
  if (!value) return null;
  return await runtime.selectOne('orders', { filters: { orderNo: value } })
    || await runtime.selectOne('orders', { filters: { transactionId: value } });
}

export async function handleVirtualPayEvent(event, { runtime, appId, merchantId, productId = 'POINTS_50' }) {
  const eventName = String(field(event, 'Event', 'event') || '');
  if (eventName === 'xpay_goods_deliver_notify') {
    const orderNo = String(field(event, 'OutTradeNo', 'outTradeNo') || '');
    const openid = String(field(event, 'OpenId', 'openid') || '');
    const order = await findOrder(runtime, orderNo);
    if (!order || order.payerOpenid !== openid) throw new Error('virtual payment order/openid mismatch');
    const goods = field(event, 'GoodsInfo', 'goodsInfo') || {};
    const pay = field(event, 'WeChatPayInfo', 'wechatPayInfo') || {};
    const paidFen = Number(field(goods, 'ActualPrice', 'actualPrice', 'OrigPrice', 'origPrice') || order.amountFen);
    const eventProductId = String(field(goods, 'ProductId', 'productId') || productId);
    if (eventProductId !== productId || paidFen !== Number(order.amountFen)) throw new Error('virtual payment goods mismatch');
    const transactionId = String(field(pay, 'TransactionId', 'transactionId') || orderNo);
    await runtime.rpc('rpc_payment_apply_success', {
      pOrderNo: orderNo,
      pTransactionId: transactionId,
      pPaidAt: new Date(Number(field(pay, 'PaidTime', 'paidTime') || Date.now() / 1000) * 1_000).toISOString(),
      pNotifyDigest: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),
      pAppid: appId,
      pMchid: merchantId,
      pPayerOpenid: openid,
      pAmountFen: paidFen,
    });
    return success;
  }
  if (eventName === 'xpay_refund_notify') {
    if (Number(field(event, 'RetCode', 'retCode') || 0) !== 0) return success;
    const orderNo = String(field(event, 'MchOrderId', 'mchOrderId') || '');
    const refundId = String(field(event, 'WxRefundId', 'wxRefundId', 'WxpayRefundTransactionId', 'wxpayRefundTransactionId') || '');
    await runtime.rpc('rpc_virtual_payment_apply_refund', {
      pOrderNo: orderNo,
      pRefundId: refundId,
      pRefundFee: Number(field(event, 'RefundFee', 'refundFee') || 0),
      pRefundedAt: new Date(Number(field(event, 'RefundSuccTimestamp', 'refundSuccTimestamp') || Date.now() / 1000) * 1_000).toISOString(),
    });
    return success;
  }
  if (eventName === 'xpay_subscribe_ios_refund_query_notify') {
    const paymentOrderId = String(field(event, 'pay_order_id', 'PayOrderId') || '');
    const order = await findOrder(runtime, paymentOrderId);
    if (!order || order.status !== 'PAID') {
      return { result_code: 0, result_info: '建议退款', evidence: '订单不存在或尚未完成发货' };
    }
    const account = await runtime.selectOne('point_accounts', { filters: { userId: order.userId } });
    const unused = Number(account?.balance || 0) >= Number(order.points || 0);
    return unused
      ? { result_code: 0, result_info: '建议退款', evidence: '该积分包对应积分仍可完整回收' }
      : { result_code: 1, result_info: '建议拒绝退款', evidence: '该积分包对应积分已部分或全部用于生成服务' };
  }
  return success;
}
