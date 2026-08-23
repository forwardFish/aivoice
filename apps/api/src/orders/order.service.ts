import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { orders, voiceProfiles } from '../db/schema.js';
import { loadPointsConfig } from '../quota/points.config.js';

@Injectable()
export class OrderService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  effectiveAmountFen(): number {
    const testMode = process.env.WECHAT_PAY_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';
    const hasRealWechatPayConfig = Boolean(
      process.env.WECHAT_PAY_MCH_ID?.trim() &&
      process.env.WECHAT_PAY_SERIAL_NO?.trim() &&
      (process.env.WECHAT_PAY_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY_PATH) &&
      process.env.WECHAT_PAY_NOTIFY_URL?.trim(),
    );
    const product = loadPointsConfig().product;
    if (!testMode) return product.amountFen;
    return hasRealWechatPayConfig
      ? Math.max(1, Number(process.env.WECHAT_PAY_TEST_AMOUNT_FEN || 1))
      : product.amountFen;
  }

  async createOrder(userId: string, input: { voiceId?: string; productCode: string }, idempotencyKey = '') {
    const requestKey = idempotencyKey.trim();
    if (!requestKey) throw new BadRequestException('Idempotency-Key is required');
    const product = loadPointsConfig().product;
    if (input.productCode !== product.productCode) {
      throw new NotFoundException('product not found');
    }
    const orderNo = `av${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const user = await cloud.selectOne<{ openid: string }>('users', {
        select: 'openid',
        filters: { id: userId, deletedAt: { is: null } },
      });
      if (!user) throw new NotFoundException('user not found');
      return cloud.rpc<typeof orders.$inferSelect>('rpc_order_create', {
        pUserId: userId,
        pVoiceProfileId: input.voiceId || null,
        pProductCode: product.productCode,
        pAmountFen: this.effectiveAmountFen(),
        pPoints: product.points,
        pOrderNo: orderNo,
        pIdempotencyKey: requestKey,
        pAppid: process.env.WECHAT_APP_ID || null,
        pMchid: process.env.WECHAT_PAY_MCH_ID || null,
        pPayerOpenid: user.openid,
      });
    }
    if (input.voiceId) {
      const voice = await this.database.db.query.voiceProfiles.findFirst({
        where: and(
          eq(voiceProfiles.id, input.voiceId),
          eq(voiceProfiles.userId, userId),
          eq(voiceProfiles.status, 'READY'),
          isNull(voiceProfiles.deletedAt),
        ),
      });
      if (!voice) throw new ConflictException('voice is not ready or not owned by user');
    }
    const [order] = await this.database.db.insert(orders).values({
      orderNo,
      userId,
      voiceProfileId: input.voiceId || null,
      productCode: product.productCode,
      amountFen: this.effectiveAmountFen(),
      quota: product.points,
      points: product.points,
    }).returning();
    return order;
  }

  async attachPrepay(orderId: string, prepayId: string) {
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const order = await cloud.selectOne<{ userId: string }>('orders', {
        select: 'user_id',
        filters: { id: orderId },
      });
      if (!order) throw new NotFoundException('order not found');
      return cloud.rpc<typeof orders.$inferSelect>('rpc_order_attach_prepay', {
        pOrderId: orderId,
        pUserId: order.userId,
        pPrepayId: prepayId,
        pRequestDigest: '',
      });
    }
    const [order] = await this.database.db
      .update(orders)
      .set({ prepayId, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async markPaid(orderId: string, transactionId: string, paidAt = new Date()) {
    if (this.database.isCloudBase) {
      throw new ConflictException(
        'CloudBase payment state must be changed by rpc_payment_apply_success',
      );
    }
    const [order] = await this.database.db
      .update(orders)
      .set({
        status: 'PAID',
        transactionId,
        paidAt,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async findUserOrder(userId: string, orderId: string) {
    if (this.database.isCloudBase) {
      const order = await this.database.requireCloud().selectOne<typeof orders.$inferSelect>('orders', {
        filters: { id: orderId, userId },
      });
      if (!order) throw new NotFoundException('order not found');
      return order;
    }
    const order = await this.database.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async findByOrderNo(orderNo: string) {
    if (this.database.isCloudBase) {
      const order = await this.database.requireCloud().selectOne<typeof orders.$inferSelect>('orders', {
        filters: { orderNo },
      });
      if (!order) throw new NotFoundException('order not found');
      return order;
    }
    const order = await this.database.db.query.orders.findFirst({ where: eq(orders.orderNo, orderNo) });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  listUserOrders(userId: string) {
    if (this.database.isCloudBase) {
      return this.database.requireCloud().select<typeof orders.$inferSelect>('orders', {
        filters: { userId },
        order: [{ column: 'createdAt', ascending: false }],
        limit: 100,
      });
    }
    return this.database.db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      limit: 100,
    });
  }
}
