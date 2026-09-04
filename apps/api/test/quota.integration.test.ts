import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/db/database.service.js';
import { conversations, messages, orders, pointAccounts, pointLedgers, users, voiceProfiles } from '../src/db/schema.js';
import { MediaService } from '../src/media/media.service.js';
import { MessageService } from '../src/messages/message.service.js';
import { QuotaService } from '../src/quota/quota.service.js';
import { loadPointsConfig } from '../src/quota/points.config.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

test('account points are registration-granted, shared, success-only and idempotent', { skip: !hasDatabase }, async () => {
  const database = new DatabaseService();
  const points = new QuotaService(database);
  const messageService = new MessageService(database, new MediaService(database));
  const pointsConfig = loadPointsConfig();
  const balanceAfterOneGeneration = pointsConfig.signupBonusPoints - pointsConfig.generationCost;
  try {
    await database.pool.query(
      'TRUNCATE point_ledgers, point_accounts, quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    const [user] = await database.db.insert(users).values({ openid: 'points-test-openid' }).returning();
    const grants = await Promise.all(Array.from({ length: 4 }, () => points.ensureSignupGrant(user.id)));
    assert.ok(grants.every((item) => item.balance === pointsConfig.signupBonusPoints));
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
    assert.ok(completions.every((item) => item.availableQuota === balanceAfterOneGeneration));
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
    assert.equal((await points.getPoints(user.id)).balance, balanceAfterOneGeneration);

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
    assert.ok(purchases.every((item) => item.availableQuota === balanceAfterOneGeneration + pointsConfig.product.points));
    const [secondOrder] = await makeOrder('points-order-2');
    await points.grantPurchasedPoints({ userId: user.id, orderId: secondOrder.id, transactionId: 'tx-2', paidAt: new Date() });
    assert.equal((await points.getPoints(user.id)).balance, balanceAfterOneGeneration + (pointsConfig.product.points * 2));
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

test('CloudBase quota mutations use RPC and never access pg or Drizzle', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    selectOne: async (table: string) => {
      if (table === 'point_accounts') return { balance: 10 };
      if (table === 'voice_profiles') return { id: 'voice-cloud' };
      if (table === 'orders') return { orderNo: 'order-cloud', amountFen: 990 };
      if (table === 'users') return { openid: 'openid-cloud' };
      return null;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'rpc_voice_accept_preview') {
        return { quota: { availableQuota: 10 } };
      }
      if (name === 'rpc_message_complete_success') return { balance: 9 };
      if (name === 'rpc_payment_apply_success') return { balance: 59, credited: true };
      return { updated: true };
    },
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
    get db(): never { throw new Error('Drizzle must not be used'); },
    get pool(): never { throw new Error('pg must not be used'); },
  } as unknown as DatabaseService;
  const quota = new QuotaService(database);

  assert.equal((await quota.getPoints('user-cloud')).balance, 10);
  assert.equal((await quota.getQuota('user-cloud', 'voice-cloud')).availableQuota, 10);
  assert.equal((await quota.acceptPreview('user-cloud', 'voice-cloud')).availableQuota, 10);
  assert.equal((await quota.completeMessage({
    userId: 'user-cloud',
    voiceId: 'voice-cloud',
    messageId: 'message-cloud',
    outputText: '成功生成',
    generatedMedia: {
      objectKey: 'generated/message-cloud.wav',
      mimeType: 'audio/wav',
      bytes: 1234,
      durationMs: 1000,
      sha256: 'a'.repeat(64),
    },
  })).availableQuota, 9);
  await quota.failMessage({
    userId: 'user-cloud',
    messageId: 'failed-cloud',
    code: 'PROVIDER_FAILED',
    message: 'provider failed',
  });
  assert.equal((await quota.grantPurchasedPoints({
    userId: 'user-cloud',
    orderId: 'order-id-cloud',
    orderNo: 'order-cloud',
    transactionId: 'transaction-cloud',
    paidAt: new Date('2026-08-22T00:00:00.000Z'),
    appId: 'wx-cloud',
    mchId: 'mch-cloud',
    payerOpenid: 'openid-cloud',
    amountFen: 990,
  })).availableQuota, 59);

  assert.deepEqual(calls.map((item) => item.name), [
    'rpc_voice_accept_preview',
    'rpc_message_complete_success',
    'rpc_message_complete_failure',
    'rpc_payment_apply_success',
  ]);
  const payment = calls.at(-1)?.args;
  assert.equal(payment?.pAmountFen, 990);
  assert.equal(payment?.pPayerOpenid, 'openid-cloud');
});
