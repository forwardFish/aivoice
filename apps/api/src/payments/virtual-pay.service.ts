import { createHmac } from 'node:crypto';
import { BadGatewayException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { WechatCodeExchanger } from '../auth/wechat-code-exchanger.js';
import { OrderService } from '../orders/order.service.js';
import { QuotaService } from '../quota/quota.service.js';

interface VirtualOrderResponse {
  errcode?: number;
  errmsg?: string;
  order?: {
    order_id?: string;
    status?: number;
    paid_fee?: number;
    paid_time?: number;
    wx_order_id?: string;
    wxpay_order_id?: string;
    channel_order_id?: string;
  };
}

@Injectable()
export class VirtualPayService {
  private accessTokenValue = '';
  private accessTokenExpiresAt = 0;

  constructor(
    @Inject(OrderService) private readonly orderService: OrderService,
    @Inject(QuotaService) private readonly quotaService: QuotaService,
    @Inject(WechatCodeExchanger) private readonly exchanger: WechatCodeExchanger,
  ) {}

  enabled(): boolean {
    return String(process.env.WECHAT_PAYMENT_MODE || '').toLowerCase() === 'virtual';
  }

  private env(): 0 | 1 {
    return String(process.env.WECHAT_VIRTUAL_PAY_ENV || (process.env.NODE_ENV === 'production' ? '0' : '1')) === '1' ? 1 : 0;
  }

  private config() {
    const offerId = String(process.env.WECHAT_VIRTUAL_PAY_OFFER_ID || '').trim();
    const appKey = String(this.env() === 1
      ? process.env.WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY || process.env.WECHAT_VIRTUAL_PAY_APP_KEY || ''
      : process.env.WECHAT_VIRTUAL_PAY_APP_KEY || '').trim();
    // WeChat documents OfferID as the merchant identifier for virtual payment.
    // Keep an override for accounts that expose a distinct settlement identifier.
    const merchantId = String(process.env.WECHAT_VIRTUAL_PAY_MCH_ID || offerId).trim();
    const productId = String(process.env.WECHAT_VIRTUAL_PAY_PRODUCT_ID || 'POINTS_50').trim();
    if (!offerId || !appKey || !merchantId || !productId) {
      throw new ConflictException('WECHAT_VIRTUAL_PAY_CONFIG_REQUIRED');
    }
    return { offerId, appKey, merchantId, productId, env: this.env() };
  }

  merchantId(): string {
    return this.config().merchantId;
  }

  private hmac(key: string, value: string): string {
    return createHmac('sha256', key).update(value).digest('hex');
  }

  async createPayment(order: {
    id: string;
    orderNo: string;
    amountFen: number;
  }, expectedOpenid: string, wxLoginCode: string) {
    if (!wxLoginCode) throw new UnauthorizedException('fresh wx.login code is required for virtual payment');
    const session = await this.exchanger.exchangeWithSession(wxLoginCode);
    if (session.openid !== expectedOpenid) throw new UnauthorizedException('virtual payment openid mismatch');
    const config = this.config();
    const signData = JSON.stringify({
      offerId: config.offerId,
      buyQuantity: 1,
      env: config.env,
      currencyType: 'CNY',
      productId: config.productId,
      goodsPrice: Number(order.amountFen),
      outTradeNo: order.orderNo,
      attach: order.id,
    });
    return {
      payment: {
        kind: 'VIRTUAL' as const,
        signData,
        paySig: this.hmac(config.appKey, `requestVirtualPayment&${signData}`),
        signature: this.hmac(session.sessionKey, signData),
        mode: 'short_series_goods' as const,
      },
    };
  }

  private async accessToken(): Promise<string> {
    if (this.accessTokenValue && Date.now() < this.accessTokenExpiresAt) return this.accessTokenValue;
    const appid = String(process.env.WECHAT_APP_ID || '').trim();
    const secret = String(process.env.WECHAT_APP_SECRET || '').trim();
    if (!appid || !secret) throw new Error('WECHAT_APP_ID/WECHAT_APP_SECRET is not configured');
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
    if (!response.ok || !data.access_token) throw new BadGatewayException(data.errmsg || `WeChat access token HTTP ${response.status}`);
    this.accessTokenValue = data.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 7_200) - 300) * 1_000;
    return this.accessTokenValue;
  }

  private async requestXpay(path: string, body: Record<string, unknown>, signed: boolean): Promise<any> {
    const token = await this.accessToken();
    const rawBody = JSON.stringify(body);
    const url = new URL(`https://api.weixin.qq.com${path}`);
    url.searchParams.set('access_token', token);
    if (signed) url.searchParams.set('pay_sig', this.hmac(this.config().appKey, `${path}&${rawBody}`));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || Number(data.errcode || 0) !== 0) {
      throw new BadGatewayException(String(data.errmsg || `WeChat xpay HTTP ${response.status}`));
    }
    return data;
  }

  async refreshOrder(userId: string, orderId: string) {
    const localOrder = await this.orderService.findUserOrder(userId, orderId);
    const config = this.config();
    const data = await this.requestXpay('/xpay/query_order', {
      openid: localOrder.payerOpenid,
      env: config.env,
      order_id: localOrder.orderNo,
      wx_order_id: '',
    }, true) as VirtualOrderResponse;
    const virtualOrder = data.order;
    if (!virtualOrder || ![2, 3, 4].includes(Number(virtualOrder.status))) {
      return { order: localOrder, granted: false, virtualOrderStatus: Number(virtualOrder?.status ?? -1) };
    }
    if (Number(virtualOrder.paid_fee) !== Number(localOrder.amountFen)) {
      throw new UnauthorizedException('PAYMENT_MISMATCH');
    }
    const transactionId = String(
      virtualOrder.wxpay_order_id || virtualOrder.channel_order_id || virtualOrder.wx_order_id || virtualOrder.order_id || '',
    );
    if (!transactionId) throw new BadGatewayException('virtual payment transaction id is missing');
    const points = await this.quotaService.grantPurchasedPoints({
      userId: localOrder.userId,
      orderId: localOrder.id,
      transactionId,
      paidAt: virtualOrder.paid_time ? new Date(virtualOrder.paid_time * 1_000) : new Date(),
      orderNo: localOrder.orderNo,
      notifyDigest: `virtual-query:${localOrder.orderNo}:${virtualOrder.status}:${transactionId}`,
      appId: process.env.WECHAT_APP_ID || '',
      mchId: config.merchantId,
      payerOpenid: localOrder.payerOpenid || '',
      amountFen: Number(virtualOrder.paid_fee),
    });
    if (Number(virtualOrder.status) !== 4) {
      await this.requestXpay('/xpay/notify_provide_goods', {
        order_id: localOrder.orderNo,
        wx_order_id: virtualOrder.wx_order_id || '',
        env: config.env,
      }, false);
    }
    return {
      order: await this.orderService.findUserOrder(userId, orderId),
      granted: true,
      points,
      virtualOrderStatus: Number(virtualOrder.status),
    };
  }
}
