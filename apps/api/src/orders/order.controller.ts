import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { WechatPayService } from '../payments/wechat-pay.service.js';
import { CreateOrderDto } from './order.dto.js';
import { OrderService } from './order.service.js';
import { loadPointsConfig } from '../quota/points.config.js';

@Controller('products')
export class ProductsController {
  constructor(@Inject(OrderService) private readonly orderService: OrderService) {}

  @Get()
  list() {
    const product = loadPointsConfig().product;
    return {
      products: [{
        ...product,
        amountFen: this.orderService.effectiveAmountFen(),
        quota: product.points,
        title: `${product.points}积分包`,
        description: `每次生成消耗${loadPointsConfig().generationCost}积分`,
      }],
    };
  }
}

@Controller('orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(
    @Inject(OrderService)
    private readonly orderService: OrderService,
    @Inject(WechatPayService)
    private readonly wechatPay: WechatPayService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey = '',
  ) {
    const order = await this.orderService.createOrder(user.id, body, idempotencyKey);
    const prepay = await this.wechatPay.createPrepay(order, user.openid);
    return { order, paymentProvider: 'wechat', ...prepay };
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.orderService.listUserOrders(user.id);
  }

  @Get(':orderId')
  find(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.orderService.findUserOrder(user.id, orderId);
  }

  @Post(':orderId/refresh')
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.wechatPay.refreshOrder(user.id, orderId);
  }

  @Post(':orderId/mock-paid')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  confirmLocalTestPayment(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.wechatPay.confirmLocalTestPayment(user.id, orderId);
  }
}
