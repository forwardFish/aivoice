import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VOICE_QUOTA_PRODUCT } from '@aivoice/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { orders, voiceProfiles } from '../db/schema.js';

@Injectable()
export class OrderService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  effectiveAmountFen(): number {
    const testMode = process.env.WECHAT_PAY_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';
    return testMode ? Math.max(1, Number(process.env.WECHAT_PAY_TEST_AMOUNT_FEN || 1)) : VOICE_QUOTA_PRODUCT.amountFen;
  }

  async createOrder(userId: string, input: { voiceId: string; productCode: string }) {
    if (input.productCode !== VOICE_QUOTA_PRODUCT.productCode) {
      throw new NotFoundException('product not found');
    }
    const voice = await this.database.db.query.voiceProfiles.findFirst({
      where: and(
        eq(voiceProfiles.id, input.voiceId),
        eq(voiceProfiles.userId, userId),
        eq(voiceProfiles.status, 'READY'),
        isNull(voiceProfiles.deletedAt),
      ),
    });
    if (!voice) throw new ConflictException('voice is not ready or not owned by user');
    const [order] = await this.database.db.insert(orders).values({
      orderNo: `av${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`,
      userId,
      voiceProfileId: input.voiceId,
      productCode: VOICE_QUOTA_PRODUCT.productCode,
      amountFen: this.effectiveAmountFen(),
      quota: VOICE_QUOTA_PRODUCT.quota,
    }).returning();
    return order;
  }

  async attachPrepay(orderId: string, prepayId: string) {
    const [order] = await this.database.db
      .update(orders)
      .set({ prepayId, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async findUserOrder(userId: string, orderId: string) {
    const order = await this.database.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async findByOrderNo(orderNo: string) {
    const order = await this.database.db.query.orders.findFirst({ where: eq(orders.orderNo, orderNo) });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  listUserOrders(userId: string) {
    return this.database.db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      limit: 100,
    });
  }
}
