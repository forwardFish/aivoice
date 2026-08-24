import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentController } from '../payments/payment.controller.js';
import { WechatPayService } from '../payments/wechat-pay.service.js';
import { VirtualPayService } from '../payments/virtual-pay.service.js';
import { QuotaModule } from '../quota/quota.module.js';
import { OrderController, ProductsController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [AuthModule, QuotaModule],
  controllers: [OrderController, ProductsController, PaymentController],
  providers: [OrderService, WechatPayService, VirtualPayService],
  exports: [OrderService, WechatPayService, VirtualPayService],
})
export class OrderModule {}
