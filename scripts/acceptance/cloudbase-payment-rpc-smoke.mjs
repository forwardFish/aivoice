import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { CloudBaseHttpError, CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';

const statePath = process.env.AIVOICE_CLOUDBASE_STATE
  || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const credentials = parseDotEnv(fs.readFileSync(credentialFile));
const client = new CloudBaseRuntimeClient(state.envId, state.runtimeApiKey);
const manager = new CloudBase({
  envId: state.envId,
  region: 'ap-shanghai',
  secretId: process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID,
  secretKey: process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY,
});

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const openid = `cb-payment-probe-${suffix}`;
const orderNo = `cbpay${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
const transactionId = `cbtx${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
const appid = 'cb-probe-appid';
const mchid = 'cb-probe-mchid';
let userId = '';
const evidence = {
  checkedAt: new Date().toISOString(),
  envId: state.envId,
  scenario: 'duplicate-and-concurrent-payment-rpc',
  signupBalance: null,
  rollbackAfterInvalidAmount: null,
  concurrentCalls: 8,
  sameOrderIdempotent: null,
  creditedTrueCount: null,
  finalBalance: null,
  purchaseLedgerCount: null,
  status: 'FAIL',
};

try {
  const login = await client.rpc('rpc_auth_login_wechat', {
    p_openid: openid,
    p_unionid: null,
    p_nickname: 'CloudBase payment probe',
    p_avatar_url: '',
    p_signup_bonus_points: 8,
  });
  userId = login.user.id;
  evidence.signupBalance = login.points.balance;

  const firstOrder = await client.rpc('rpc_order_create', {
    p_user_id: userId,
    p_voice_profile_id: null,
    p_product_code: 'POINTS_50',
    p_amount_fen: 990,
    p_points: 50,
    p_order_no: orderNo,
    p_idempotency_key: `probe-${suffix}`,
    p_appid: appid,
    p_mchid: mchid,
    p_payer_openid: openid,
  });
  const repeatedOrder = await client.rpc('rpc_order_create', {
    p_user_id: userId,
    p_voice_profile_id: null,
    p_product_code: 'POINTS_50',
    p_amount_fen: 990,
    p_points: 50,
    p_order_no: `${orderNo}retry`,
    p_idempotency_key: `probe-${suffix}`,
    p_appid: appid,
    p_mchid: mchid,
    p_payer_openid: openid,
  });
  evidence.sameOrderIdempotent = firstOrder.id === repeatedOrder.id;

  let rejectedInvalidAmount = false;
  try {
    await client.rpc('rpc_payment_apply_success', {
      p_order_no: orderNo,
      p_transaction_id: transactionId,
      p_paid_at: new Date().toISOString(),
      p_notify_digest: 'invalid-amount-probe',
      p_appid: appid,
      p_mchid: mchid,
      p_payer_openid: openid,
      p_amount_fen: 1,
    });
  } catch (error) {
    rejectedInvalidAmount = error instanceof CloudBaseHttpError;
  }
  const before = await client.selectOne('point_accounts', { filters: { userId } });
  evidence.rollbackAfterInvalidAmount = rejectedInvalidAmount && before?.balance === 10;

  const results = await Promise.all(Array.from({ length: evidence.concurrentCalls }, () => client.rpc(
    'rpc_payment_apply_success',
    {
      p_order_no: orderNo,
      p_transaction_id: transactionId,
      p_paid_at: new Date().toISOString(),
      p_notify_digest: 'duplicate-concurrency-probe',
      p_appid: appid,
      p_mchid: mchid,
      p_payer_openid: openid,
      p_amount_fen: 990,
    },
  )));
  evidence.creditedTrueCount = results.filter((result) => result.credited === true).length;
  const account = await client.selectOne('point_accounts', { filters: { userId } });
  const ledgers = await client.select('point_ledgers', {
    filters: { userId, type: 'PURCHASE_GRANT' },
  });
  evidence.finalBalance = account?.balance ?? null;
  evidence.purchaseLedgerCount = ledgers.length;
  evidence.status = evidence.signupBalance === 10
    && evidence.rollbackAfterInvalidAmount === true
    && evidence.sameOrderIdempotent === true
    && evidence.creditedTrueCount === 1
    && evidence.finalBalance === 60
    && evidence.purchaseLedgerCount === 1
    ? 'PASS'
    : 'FAIL';
} finally {
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    await manager.database.executePGSql({
      Sql: `DELETE FROM public.users WHERE id = '${userId}'::uuid`,
    });
  }
}

const outputPath = 'docs/auto-execute/results/cloudbase-payment-rpc-smoke.json';
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ...evidence, outputPath }, null, 2));
if (evidence.status !== 'PASS') process.exitCode = 1;
