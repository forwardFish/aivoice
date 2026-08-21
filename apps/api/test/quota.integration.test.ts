import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/db/database.service.js';
import { conversations, messages, orders, pointAccounts, pointLedgers, users, voiceProfiles } from '../src/db/schema.js';
import { MediaService } from '../src/media/media.service.js';
import { MessageService } from '../src/messages/message.service.js';
import { QuotaService } from '../src/quota/quota.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

test('account points are registration-granted, shared, success-only and idempotent', { skip: !hasDatabase }, async () => {
  const database = new DatabaseService();
  const points = new QuotaService(database);
  const messageService = new MessageService(database, new MediaService(database));
  try {
    await database.pool.query(
      'TRUNCATE point_ledgers, point_accounts, quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    const [user] = await database.db.insert(users).values({ openid: 'points-test-openid' }).returning();
    const grants = await Promise.all(Array.from({ length: 4 }, () => points.ensureSignupGrant(user.id)));
    assert.ok(grants.every((item) => item.balance === 5));
    assert.equal((await database.db.query.pointLedgers.findMany({ where: eq(pointLedgers.type, 'REGISTER_GRANT') })).length, 1);

    const [voiceA, voiceB] = await database.db.insert(voiceProfiles).values([
      { userId: user.id, name: 'A', status: 'READY', previewPlayedAt: new Date(), acceptedAt: new Date() },
      { userId: user.id, name: 'B', status: 'READY', previewPlayedAt: new Date(), acceptedAt: new Date() },
    ]).returning();
    const [conversation] = await database.db.insert(conversations).values({ voiceProfileId: voiceA.id }).returning();
    const [message] = await database.db.insert(messages).values({
      conversationId: conversation.id,
      userId: user.id,
      voiceProfileId: voiceA.id,
      idempotencyKey: 'success-one',
      mode: 'EXACT_SPEECH',
      status: 'PROCESSING',
      inputText: '成功生成',
    }).returning();
    const completions = await Promise.all([
      points.completeMessage({ userId: user.id, voiceId: voiceA.id, messageId: message.id, outputText: '成功生成' }),
      points.completeMessage({ userId: user.id, voiceId: voiceA.id, messageId: message.id, outputText: '成功生成' }),
    ]);
    assert.ok(completions.every((item) => item.availableQuota === 4));
    assert.equal((await database.db.query.pointLedgers.findMany({ where: eq(pointLedgers.type, 'GENERATION_CONSUME') })).length, 1);

    const [failed] = await database.db.insert(messages).values({
      conversationId: conversation.id,
      userId: user.id,
      voiceProfileId: voiceA.id,
      idempotencyKey: 'failed-one',
      mode: 'EXACT_SPEECH',
      status: 'PROCESSING',
      inputText: '失败不扣分',
    }).returning();
    await points.failMessage({ userId: user.id, messageId: failed.id, code: 'PROVIDER_FAILED', message: 'test' });
    assert.equal((await points.getPoints(user.id)).balance, 4);

    const makeOrder = (orderNo: string) => database.db.insert(orders).values({
      orderNo,
      userId: user.id,
      productCode: 'POINTS_50',
      amountFen: 990,
      quota: 50,
      points: 50,
    }).returning();
    const [firstOrder] = await makeOrder('points-order-1');
    const purchases = await Promise.all([
      points.grantPurchasedPoints({ userId: user.id, orderId: firstOrder.id, transactionId: 'tx-1', paidAt: new Date() }),
      points.grantPurchasedPoints({ userId: user.id, orderId: firstOrder.id, transactionId: 'tx-1', paidAt: new Date() }),
    ]);
    assert.ok(purchases.every((item) => item.availableQuota === 54));
    const [secondOrder] = await makeOrder('points-order-2');
    await points.grantPurchasedPoints({ userId: user.id, orderId: secondOrder.id, transactionId: 'tx-2', paidAt: new Date() });
    assert.equal((await points.getPoints(user.id)).balance, 104);
    assert.equal((await database.db.query.pointLedgers.findMany({ where: eq(pointLedgers.type, 'PURCHASE_GRANT') })).length, 2);

    await database.db.update(pointAccounts).set({ balance: 1 }).where(eq(pointAccounts.userId, user.id));
    const queued = await messageService.create({
      userId: user.id, voiceId: voiceA.id, idempotencyKey: 'reserve-a', text: '占用一份潜在积分', mode: 'EXACT_SPEECH',
    });
    assert.equal(queued.status, 'PROCESSING');
    await assert.rejects(
      messageService.create({
        userId: user.id, voiceId: voiceB.id, idempotencyKey: 'reserve-b', text: '不能超卖', mode: 'EXACT_SPEECH',
      }),
      (error: unknown) => (error as { response?: { code?: string } }).response?.code === 'POINTS_EXHAUSTED',
    );
  } finally {
    await database.onModuleDestroy();
  }
});
