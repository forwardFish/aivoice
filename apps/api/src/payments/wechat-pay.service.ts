import crypto from 'node:crypto';
import { BadGatewayException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { orders, users } from '../db/schema.js';
import { OrderService } from '../orders/order.service.js';
import { QuotaService } from '../quota/quota.service.js';
import { loadWechatPayConfig, type WechatPayConfig } from './payment.config.js';

const WECHAT_PAY_API_BASE = 'https://api.mch.weixin.qq.com';

function normalizePrivateKey(value = ''): string {
  return value.replace(/\\n/g, '\n').trim();
}

function nonce(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function signRsa(message: string, privateKey: string): string {
  return crypto.createSign('RSA-SHA256').update(message).sign(normalizePrivateKey(privateKey), 'base64');
}

function decryptAes256Gcm(input: {
  apiV3Key: string;
  ciphertext: string;
  nonce: string;
  associatedData?: string;
}): string {
  const key = Buffer.from(input.apiV3Key, 'utf8');
  if (key.length !== 32) throw new Error('WECHAT_PAY_API_V3_KEY must be 32 bytes');
  const encrypted = Buffer.from(input.ciphertext, 'base64');
  const authTag = encrypted.subarray(encrypted.length - 16);
  const data = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(input.nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  if (input.associatedData) decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export interface WechatTransaction {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_state: string;
  trade_type?: string;
  success_time?: string;
  payer?: { openid?: string };
  amount?: { total?: number; currency?: string };
}

@Injectable()
export class WechatPayService {
  private readonly config: WechatPayConfig;

  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(OrderService)
    private readonly orderService: OrderService,
    @Inject(QuotaService)
    private readonly quotaService: QuotaService,
  ) {
    this.config = loadWechatPayConfig();
  }

  private assertPrepayConfig(): void {
    const missing = [
      ['WECHAT_APP_ID', this.config.appId],
      ['WECHAT_PAY_MCH_ID', this.config.mchId],
      ['WECHAT_PAY_SERIAL_NO', this.config.serialNo],
      ['WECHAT_PAY_PRIVATE_KEY', this.config.privateKey],
      ['WECHAT_PAY_NOTIFY_URL', this.config.notifyUrl],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`WeChat Pay config missing: ${missing.join(', ')}`);
  }

  private isLocalTestMode(): boolean {
    return process.env.WECHAT_PAY_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';
  }

  private hasRealPrepayConfig(): boolean {
    return Boolean(
      this.config.appId &&
      this.config.mchId &&
      this.config.serialNo &&
      this.config.privateKey &&
      this.config.notifyUrl,
    );
  }

  private isLocalMockMode(): boolean {
    return this.isLocalTestMode() && !this.hasRealPrepayConfig();
  }

  buildAuthorization(input: { method: string; path: string; body: string; timestamp: string; nonceStr: string }): string {
    const message = `${input.method}\n${input.path}\n${input.timestamp}\n${input.nonceStr}\n${input.body}\n`;
    const signature = signRsa(message, this.config.privateKey);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchId}",nonce_str="${input.nonceStr}",signature="${signature}",timestamp="${input.timestamp}",serial_no="${this.config.serialNo}"`;
  }

  buildRequestPaymentParams(prepayId: string) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = nonce();
    const pkg = `prepay_id=${prepayId}`;
    return {
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA' as const,
      paySign: signRsa(`${this.config.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`, this.config.privateKey),
    };
  }

  async createPrepay(order: Awaited<ReturnType<OrderService['createOrder']>>, openid: string) {
    if (this.isLocalMockMode()) {
      const prepayId = `mock-prepay-${order.id}`;
      await this.orderService.attachPrepay(order.id, prepayId);
      return {
        prepayId,
        payment: {
          timeStamp: Math.floor(Date.now() / 1000).toString(),
          nonceStr: nonce(),
          package: `prepay_id=${prepayId}`,
          signType: 'RSA' as const,
          paySign: 'MOCK_PAY_SIGNATURE',
        },
      };
    }
    this.assertPrepayConfig();
    const path = '/v3/pay/transactions/jsapi';
    const body = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: this.config.description,
      out_trade_no: order.orderNo,
      attach: order.id,
      notify_url: this.config.notifyUrl,
      amount: { total: order.amountFen, currency: 'CNY' },
      payer: { openid },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = nonce();
    const response = await fetch(`${WECHAT_PAY_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.buildAuthorization({ method: 'POST', path, body, timestamp, nonceStr }),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as { prepay_id?: string; message?: string };
    if (!response.ok || !data.prepay_id) {
      throw new BadGatewayException(data.message || `WeChat Pay prepay HTTP ${response.status}`);
    }
    await this.orderService.attachPrepay(order.id, data.prepay_id);
    return { prepayId: data.prepay_id, payment: this.buildRequestPaymentParams(data.prepay_id) };
  }

  private async requestWechat(path: string): Promise<WechatTransaction> {
    this.assertPrepayConfig();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = nonce();
    const response = await fetch(`${WECHAT_PAY_API_BASE}${path}`, {
      headers: {
        Authorization: this.buildAuthorization({ method: 'GET', path, body: '', timestamp, nonceStr }),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as WechatTransaction & { message?: string };
    if (!response.ok) throw new BadGatewayException(data.message || `WeChat Pay query HTTP ${response.status}`);
    return data;
  }

  async refreshOrder(userId: string, orderId: string) {
    const order = await this.orderService.findUserOrder(userId, orderId);
    if (this.isLocalMockMode()) {
      return { order, granted: Boolean(order.pointsGrantedAt) };
    }
    const query = new URLSearchParams({ mchid: this.config.mchId }).toString();
    const transaction = await this.requestWechat(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?${query}`);
    if (transaction.trade_state !== 'SUCCESS') return { order, granted: false };
    const points = await this.validateAndGrant(transaction);
    return { order: await this.orderService.findUserOrder(userId, orderId), granted: true, points };
  }

  async confirmLocalTestPayment(userId: string, orderId: string) {
    if (!this.isLocalMockMode()) {
      throw new ConflictException('local test payment is disabled');
    }
    const order = await this.orderService.findUserOrder(userId, orderId);
    const paidAt = order.paidAt || new Date();
    const transactionId = order.transactionId || `mock-tx-${order.id}`;
    if (order.status !== 'PAID' || order.transactionId !== transactionId) {
      await this.orderService.markPaid(order.id, transactionId, paidAt);
    }
    const points = await this.quotaService.grantPurchasedPoints({
      userId: order.userId,
      orderId: order.id,
      transactionId,
      paidAt,
    });
    const refreshedOrder = await this.database.db.query.orders.findFirst({
      where: and(eq(orders.id, order.id), eq(orders.userId, userId)),
    });
    if (!refreshedOrder) throw new UnauthorizedException('order not found');
    return { order: refreshedOrder, granted: true, points, testMode: true };
  }

  async validateAndGrant(transaction: WechatTransaction) {
    if (transaction.appid !== this.config.appId || transaction.mchid !== this.config.mchId) {
      throw new UnauthorizedException('WeChat Pay appid/mchid mismatch');
    }
    const order = await this.orderService.findByOrderNo(transaction.out_trade_no);
    const user = await this.database.db.query.users.findFirst({ where: eq(users.id, order.userId) });
    if (!user) throw new UnauthorizedException('order user not found');
    if (Number(transaction.amount?.total) !== order.amountFen) throw new UnauthorizedException('PAYMENT_MISMATCH');
    if (!transaction.payer?.openid || transaction.payer.openid !== user.openid) {
      throw new UnauthorizedException('payer openid mismatch');
    }
    return this.quotaService.grantPurchasedPoints({
      userId: order.userId,
      orderId: order.id,
      transactionId: transaction.transaction_id,
      paidAt: transaction.success_time ? new Date(transaction.success_time) : new Date(),
    });
  }

  verifyNotifySignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): boolean {
    if (!this.config.platformCert) throw new Error('WECHAT_PAY_PLATFORM_CERT is required');
    const signature = header(headers, 'wechatpay-signature');
    const timestamp = header(headers, 'wechatpay-timestamp');
    const nonceStr = header(headers, 'wechatpay-nonce');
    if (!signature || !timestamp || !nonceStr) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
    return crypto.createVerify('RSA-SHA256')
      .update(`${timestamp}\n${nonceStr}\n${rawBody.toString('utf8')}\n`)
      .verify(this.config.platformCert, signature, 'base64');
  }

  async handleNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
    rawBody: Buffer;
  }): Promise<void> {
    if (!this.verifyNotifySignature(input.headers, input.rawBody)) {
      throw new UnauthorizedException('WeChat Pay notify signature verification failed');
    }
    if (input.body.event_type !== 'TRANSACTION.SUCCESS') return;
    const resource = input.body.resource as Record<string, string> | undefined;
    if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') {
      throw new UnauthorizedException('unsupported WeChat Pay resource');
    }
    const transaction = JSON.parse(decryptAes256Gcm({
      apiV3Key: this.config.apiV3Key,
      ciphertext: resource.ciphertext,
      nonce: resource.nonce,
      associatedData: resource.associated_data || '',
    })) as WechatTransaction;
    if (transaction.trade_state === 'SUCCESS') await this.validateAndGrant(transaction);
  }
}
