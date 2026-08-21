import { Controller, Headers, HttpCode, Inject, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WechatPayService } from './wechat-pay.service.js';

@Controller('payments/wechat')
export class PaymentController {
  constructor(@Inject(WechatPayService) private readonly wechatPay: WechatPayService) {}

  @Post('notify')
  @HttpCode(204)
  async notify(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    if (!request.rawBody) throw new Error('raw request body is required');
    await this.wechatPay.handleNotify({
      headers,
      body: request.body as Record<string, unknown>,
      rawBody: request.rawBody,
    });
  }
}
