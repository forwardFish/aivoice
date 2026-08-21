import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/db/database.service.js';
import {
  conversations,
  messages,
  orders,
  quotaLedgers,
  users,
  voiceProfiles,
} from '../src/db/schema.js';
import { QuotaService } from '../src/quota/quota.service.js';
import { MediaService } from '../src/media/media.service.js';
import { MessageService } from '../src/messages/message.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

test('quota transactions are idempotent, success-only and trial-first', { skip: !hasDatabase }, async () => {
  const database = new DatabaseService();
  const quota = new QuotaService(database);
  const messageService = new MessageService(database, new MediaService(database));
  try {
    await database.pool.query(
      'TRUNCATE quota_ledgers, jobs, media_assets, messages, conversations, orders, voice_models, consent_records, voice_profiles, sessions, users RESTART IDENTITY CASCADE',
    );
    const [user] = await database.db.insert(users).values({ openid: 'quota-test-openid' }).returning();
    const [voice] = await database.db.insert(voiceProfiles).values({
      userId: user.id,
      name: 'Test voice',
      status: 'READY',
      previewPlayedAt: new Date(),
    }).returning();
    const [conversation] = await database.db.insert(conversations).values({ voiceProfileId: voice.id }).returning();

    const grants = await Promise.all(Array.from({ length: 5 }, () => quota.acceptPreview(user.id, voice.id)));
    assert.ok(grants.every((item) => item.trialQuotaRemaining === 1));
    const trialLedgers = await database.db.query.quotaLedgers.findMany({
      where: eq(quotaLedgers.type, 'TRIAL_GRANT'),
    });
    assert.equal(trialLedgers.length, 1);

    const [firstMessage] = await database.db.insert(messages).values({
      conversationId: conversation.id,
      userId: user.id,
      voiceProfileId: voice.id,
      idempotencyKey: 'first-message',
      mode: 'EXACT_SPEECH',
      status: 'PROCESSING',
      inputText: '第一次生成',
    }).returning();
    const completions = await Promise.all([
      quota.completeMessage({ userId: user.id, voiceId: voice.id, messageId: firstMessage.id, outputText: '第一次生成' }),
      quota.completeMessage({ userId: user.id, voiceId: voice.id, messageId: firstMessage.id, outputText: '第一次生成' }),
    ]);
    assert.ok(completions.every((item) => item.trialQuotaRemaining === 0));
    const consumeLedgersAfterFirst = await database.db.query.quotaLedgers.findMany({
      where: eq(quotaLedgers.type, 'GENERATION_CONSUME'),
    });
    assert.equal(consumeLedgersAfterFirst.length, 1);
    assert.equal(consumeLedgersAfterFirst[0].bucket, 'TRIAL');

    const [order] = await database.db.insert(orders).values({
      orderNo: 'quota-order-1',
      userId: user.id,
      voiceProfileId: voice.id,
      productCode: 'VOICE_QUOTA_10',
      amountFen: 990,
      quota: 10,
    }).returning();
    const paidGrants = await Promise.all([
      quota.grantPaidQuota({ userId: user.id, orderId: order.id, transactionId: 'tx-1', paidAt: new Date() }),
      quota.grantPaidQuota({ userId: user.id, orderId: order.id, transactionId: 'tx-1', paidAt: new Date() }),
    ]);
    assert.ok(paidGrants.every((item) => item.paidQuotaRemaining === 10));
    const purchaseLedgers = await database.db.query.quotaLedgers.findMany({
      where: eq(quotaLedgers.type, 'PURCHASE_GRANT'),
    });
    assert.equal(purchaseLedgers.length, 1);

    const [paidMessage] = await database.db.insert(messages).values({
      conversationId: conversation.id,
      userId: user.id,
      voiceProfileId: voice.id,
      idempotencyKey: 'paid-message',
      mode: 'EXACT_SPEECH',
      status: 'PROCESSING',
      inputText: '付费生成',
    }).returning();
    const afterPaidConsume = await quota.completeMessage({
      userId: user.id,
      voiceId: voice.id,
      messageId: paidMessage.id,
      outputText: '付费生成',
    });
    assert.equal(afterPaidConsume.paidQuotaRemaining, 9);

    const [secondOrder] = await database.db.insert(orders).values({
      orderNo: 'quota-order-2',
      userId: user.id,
      voiceProfileId: voice.id,
      productCode: 'VOICE_QUOTA_10',
      amountFen: 990,
      quota: 10,
    }).returning();
    const afterSecondPurchase = await quota.grantPaidQuota({
      userId: user.id,
      orderId: secondOrder.id,
      transactionId: 'tx-2',
      paidAt: new Date(),
    });
    assert.equal(afterSecondPurchase.paidQuotaRemaining, 19);
    const purchaseLedgersAfterSecondOrder = await database.db.query.quotaLedgers.findMany({
      where: eq(quotaLedgers.type, 'PURCHASE_GRANT'),
    });
    assert.equal(purchaseLedgersAfterSecondOrder.length, 2);

    const [failedMessage] = await database.db.insert(messages).values({
      conversationId: conversation.id,
      userId: user.id,
      voiceProfileId: voice.id,
      idempotencyKey: 'failed-message',
      mode: 'EXACT_SPEECH',
      status: 'PROCESSING',
      inputText: '失败不扣次',
    }).returning();
    await quota.failMessage({ userId: user.id, messageId: failedMessage.id, code: 'PROVIDER_FAILED', message: 'test failure' });
    const finalQuota = await quota.getQuota(user.id, voice.id);
    assert.equal(finalQuota.paidQuotaRemaining, 19);

    const created = await messageService.create({
      userId: user.id,
      voiceId: voice.id,
      idempotencyKey: 'idempotent-create',
      text: '保留草稿并生成',
      mode: 'EXACT_SPEECH',
    });
    const repeated = await messageService.create({
      userId: user.id,
      voiceId: voice.id,
      idempotencyKey: 'idempotent-create',
      text: '被同一幂等键忽略',
      mode: 'EXACT_SPEECH',
    });
    assert.equal(repeated.messageId, created.messageId);
    await assert.rejects(
      messageService.create({
        userId: user.id,
        voiceId: voice.id,
        idempotencyKey: 'concurrent-create',
        text: '同一声音同时只能一个任务',
        mode: 'EXACT_SPEECH',
      }),
      /GENERATION_IN_PROGRESS/,
    );

    const [emptyVoice] = await database.db.insert(voiceProfiles).values({
      userId: user.id,
      name: 'Empty quota voice',
      status: 'READY',
      acceptedAt: new Date(),
    }).returning();
    await assert.rejects(
      messageService.create({
        userId: user.id,
        voiceId: emptyVoice.id,
        idempotencyKey: 'zero-quota',
        text: '余额为零',
        mode: 'EXACT_SPEECH',
      }),
      (error: unknown) => {
        const response = (error as { response?: { code?: string } }).response;
        return response?.code === 'QUOTA_EXHAUSTED';
      },
    );
  } finally {
    await database.onModuleDestroy();
  }
});
