import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { scf } from 'tencentcloud-sdk-nodejs-scf';
import { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';

const state = JSON.parse(fs.readFileSync('D:/lyh/secrets/aivoice/cloudbase/deployment-state.json', 'utf8'));
const credentials = parseDotEnv(fs.readFileSync(
  'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env',
));
const client = new CloudBaseRuntimeClient(state.envId, state.runtimeApiKey);
const manager = new CloudBase({
  envId: state.envId,
  region: 'ap-shanghai',
  secretId: credentials.TENCENTCLOUD_SECRETID,
  secretKey: credentials.TENCENTCLOUD_SECRETKEY,
});
const scfClient = new scf.v20180416.Client({
  credential: { secretId: credentials.TENCENTCLOUD_SECRETID, secretKey: credentials.TENCENTCLOUD_SECRETKEY },
  region: 'ap-shanghai',
  profile: { httpProfile: { reqTimeout: 300 } },
});

const latest = await manager.database.executePGSql({
  Sql: `SELECT u.id, v.id
        FROM users u JOIN voice_profiles v ON v.user_id=u.id
        WHERE u.openid LIKE 'cb-full-flow-%'
        ORDER BY u.created_at DESC LIMIT 1`,
});
if (!latest.Rows?.[0]) throw new Error('full-flow probe user is missing');
const [userId, voiceId] = JSON.parse(latest.Rows[0]);
const evidence = {
  checkedAt: new Date().toISOString(),
  envId: state.envId,
  userId,
  voiceId,
  processStatus: 'READY',
  preview: {},
  exact: {},
  chat: {},
  delete: {},
  cleanup: 'PENDING',
  status: 'FAIL',
};

const invokeSync = async (jobId, type) => {
  const response = await scfClient.InvokeFunction({
    FunctionName: state.workerFunctionName || 'aivoice-worker',
    Namespace: state.envId,
    Event: JSON.stringify({ jobId, type }),
    LogType: 'None',
  });
  return {
    requestId: response.Result?.FunctionRequestId,
    invokeResult: response.Result?.InvokeResult,
    retMsg: response.Result?.RetMsg,
    errMsg: response.Result?.ErrMsg,
  };
};

const poll = async (read, done, timeoutMs = 8 * 60_000) => {
  const started = Date.now();
  let value;
  while (Date.now() - started < timeoutMs) {
    value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`poll timeout: ${JSON.stringify(value)}`);
};

const waitForMessage = async (messageId, jobId, type) => {
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  let job = await client.selectOne('jobs', { filters: { id: jobId } });
  let fallback = null;
  if (job?.status === 'QUEUED') fallback = await invokeSync(jobId, type);
  const message = await poll(
    () => client.selectOne('messages', { filters: { id: messageId } }),
    (row) => ['READY', 'FAILED', 'BLOCKED'].includes(row?.status),
  );
  job = await client.selectOne('jobs', { filters: { id: jobId } });
  return { message, job, fallback };
};

let safeToDelete = false;
try {
  const preview = await client.selectOne('media_assets', {
    filters: { voiceProfileId: voiceId, kind: 'PREVIEW_AUDIO', status: 'READY' },
    order: [{ column: 'createdAt', ascending: false }],
  });
  if (!preview?.objectKey) throw new Error('preview media is missing');
  const previewOutput = path.resolve('outputs/cloudbase-e2e-preview.wav');
  await fsp.mkdir(path.dirname(previewOutput), { recursive: true });
  await client.downloadFile('aivoice-audio', preview.objectKey, previewOutput);
  evidence.preview = { mediaId: preview.id, bytes: fs.statSync(previewOutput).size, output: previewOutput };
  await client.update('voice_profiles', {
    previewPlaybackStartedAt: new Date(Date.now() - Number(preview.durationMs || 0) - 2_000).toISOString(),
  }, { filters: { id: voiceId, userId } });
  await client.rpc('rpc_voice_mark_preview_played', { pUserId: userId, pVoiceId: voiceId, pMinElapsedMs: 0 });
  await client.rpc('rpc_voice_accept_preview', { pUserId: userId, pVoiceId: voiceId });

  const exactQueued = await client.rpc('rpc_message_create', {
    pUserId: userId,
    pVoiceId: voiceId,
    pIdempotencyKey: crypto.randomUUID(),
    pMode: 'EXACT_SPEECH',
    pInputText: '今天也要好好吃饭，照顾好自己。',
    pGenerationCost: 1,
  });
  const exact = await waitForMessage(exactQueued.messageId, exactQueued.jobId, 'GENERATE_MESSAGE');
  if (exact.message.status !== 'READY') throw new Error(`exact generation failed: ${exact.message.errorMessage}`);
  const exactAsset = await client.selectOne('media_assets', {
    filters: { messageId: exact.message.id, kind: 'GENERATED_AUDIO', status: 'READY' },
  });
  const exactOutput = path.resolve('outputs/cloudbase-e2e-exact.wav');
  await client.downloadFile('aivoice-audio', exactAsset.objectKey, exactOutput);
  const afterExact = await client.selectOne('point_accounts', { filters: { userId } });
  evidence.exact = {
    messageId: exact.message.id,
    status: exact.message.status,
    jobStatus: exact.job.status,
    balance: afterExact.balance,
    output: exactOutput,
    bytes: fs.statSync(exactOutput).size,
    fallback: exact.fallback,
  };

  const chatQueued = await client.rpc('rpc_message_create', {
    pUserId: userId,
    pVoiceId: voiceId,
    pIdempotencyKey: crypto.randomUUID(),
    pMode: 'CHAT',
    pInputText: '最近总是忘记休息，你会怎么提醒我？',
    pGenerationCost: 1,
  });
  const chat = await waitForMessage(chatQueued.messageId, chatQueued.jobId, 'GENERATE_MESSAGE');
  if (chat.message.status !== 'READY') throw new Error(`chat generation failed: ${chat.message.errorMessage}`);
  const chatAsset = await client.selectOne('media_assets', {
    filters: { messageId: chat.message.id, kind: 'GENERATED_AUDIO', status: 'READY' },
  });
  const chatOutput = path.resolve('outputs/cloudbase-e2e-chat.wav');
  await client.downloadFile('aivoice-audio', chatAsset.objectKey, chatOutput);
  const afterChat = await client.selectOne('point_accounts', { filters: { userId } });
  evidence.chat = {
    messageId: chat.message.id,
    status: chat.message.status,
    outputText: chat.message.outputText,
    jobStatus: chat.job.status,
    balance: afterChat.balance,
    output: chatOutput,
    bytes: fs.statSync(chatOutput).size,
    fallback: chat.fallback,
  };

  const deleting = await client.rpc('rpc_account_delete_request', { pUserId: userId });
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  let deleteJob = await client.selectOne('jobs', { filters: { id: deleting.jobId } });
  let fallback = null;
  if (deleteJob.status === 'QUEUED') fallback = await invokeSync(deleting.jobId, 'DELETE_ACCOUNT');
  deleteJob = await poll(
    () => client.selectOne('jobs', { filters: { id: deleting.jobId } }),
    (row) => ['SUCCEEDED', 'FAILED'].includes(row?.status),
  );
  const [models, assets] = await Promise.all([
    client.select('voice_models', { filters: { voiceProfileId: voiceId } }),
    client.select('media_assets', { filters: { userId } }),
  ]);
  evidence.delete = {
    jobId: deleting.jobId,
    jobStatus: deleteJob.status,
    modelStatuses: models.map((item) => item.status),
    assetStatuses: assets.map((item) => item.status),
    fallback,
  };
  safeToDelete = deleteJob.status === 'SUCCEEDED'
    && models.every((item) => item.status === 'DELETED')
    && assets.every((item) => item.status === 'DELETED');
  evidence.status = evidence.preview.bytes > 0
    && evidence.exact.status === 'READY' && evidence.exact.balance === 9
    && evidence.chat.status === 'READY' && evidence.chat.balance === 8
    && safeToDelete
    ? 'PASS'
    : 'FAIL';
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (safeToDelete) {
    await manager.database.executePGSql({ Sql: `DELETE FROM public.users WHERE id='${userId}'::uuid` });
    evidence.cleanup = 'HARD_DELETED_AFTER_PROVIDER_AND_STORAGE_FINALIZATION';
  } else {
    evidence.cleanup = 'LEFT_FOR_REPAIR';
  }
  const outputPath = 'docs/auto-execute/results/cloudbase-full-flow.json';
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ...evidence, outputPath }, null, 2));
}

if (evidence.status !== 'PASS') process.exitCode = 1;
