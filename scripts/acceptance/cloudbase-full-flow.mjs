import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { scf } from 'tencentcloud-sdk-nodejs-scf';
import { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';

const state = JSON.parse(fs.readFileSync(
  process.env.AIVOICE_CLOUDBASE_STATE || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json',
  'utf8',
));
const localEnv = parseDotEnv(fs.readFileSync('.env.local'));
const deployCredentials = parseDotEnv(fs.readFileSync(
  process.env.CLOUDBASE_CREDENTIALS_FILE
    || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env',
));
const client = new CloudBaseRuntimeClient(state.envId, state.runtimeApiKey);
const scfClient = new scf.v20180416.Client({
  credential: {
    secretId: deployCredentials.TENCENTCLOUD_SECRETID,
    secretKey: deployCredentials.TENCENTCLOUD_SECRETKEY,
  },
  region: 'ap-shanghai',
});
const manager = new CloudBase({
  envId: state.envId,
  region: 'ap-shanghai',
  secretId: deployCredentials.TENCENTCLOUD_SECRETID,
  secretKey: deployCredentials.TENCENTCLOUD_SECRETKEY,
});

const videoPath = path.resolve(process.env.AIVOICE_AUTHORIZED_VIDEO || '.aivoice-tmp/cloudbase-e2e-source.mp4');
const videoDurationMs = Number(process.env.AIVOICE_VIDEO_DURATION_MS || 25_000);
if (!fs.existsSync(videoPath)) throw new Error(`authorized test video is missing: ${videoPath}`);
if (videoDurationMs < 12_000 || videoDurationMs > 60_000) throw new Error('test video must be 12-60 seconds');
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const openid = `cb-full-flow-${suffix}`;
const consentText = '我同意使用我的声音样本创建私有 AI 声音。';
const consentVersion = 'voice-consent-v0.4';
const consentHash = crypto.createHash('sha256').update(consentText).digest('hex');
const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex');
const evidence = {
  checkedAt: new Date().toISOString(),
  envId: state.envId,
  source: { path: videoPath, bytes: fs.statSync(videoPath).size, durationMs: videoDurationMs },
  userId: '',
  voiceId: '',
  processJobId: '',
  processStatus: 'PENDING',
  previewMediaId: '',
  previewOutput: '',
  deleteJobId: '',
  deleteStatus: 'PENDING',
  cleanup: 'PENDING',
  status: 'FAIL',
  observations: [],
};

const invoke = async (jobId, type) => {
  const result = await scfClient.Invoke({
    FunctionName: state.workerFunctionName || 'aivoice-worker',
    Namespace: state.envId,
    InvocationType: 'Event',
    ClientContext: JSON.stringify({ jobId, type }),
  });
  if (!result.RequestId) throw new Error('SCF Event invocation returned no request id');
  return result.RequestId;
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

let safeToHardDelete = false;
try {
  const login = await client.rpc('rpc_auth_login_wechat', {
    pOpenid: openid,
    pUnionid: null,
    pNickname: 'CloudBase full flow probe',
    pAvatarUrl: '',
    pSignupBonusPoints: 10,
  });
  evidence.userId = login.user.id;
  const [voice] = await client.insert('voice_profiles', { userId: evidence.userId, name: '' });
  evidence.voiceId = voice.id;
  const objectKey = `source/${evidence.userId}/${evidence.voiceId}/${suffix}.mp4`;
  await client.uploadFile('aivoice-source', objectKey, videoPath, 'video/mp4');
  await client.rpc('rpc_voice_confirm_source_upload', {
    pUserId: evidence.userId,
    pVoiceId: evidence.voiceId,
    pObjectKey: objectKey,
    pMimeType: 'video/mp4',
    pBytes: evidence.source.bytes,
    pDurationMs: videoDurationMs,
    pSha256: sourceHash,
  });
  await client.rpc('rpc_voice_update_clip', {
    pUserId: evidence.userId,
    pVoiceId: evidence.voiceId,
    pStartMs: 0,
    pEndMs: 20_000,
  });
  await client.rpc('rpc_voice_update_profile', {
    pUserId: evidence.userId,
    pVoiceId: evidence.voiceId,
    pName: 'CloudBase真实闭环测试音色',
    pPermissionType: 'SELF',
  });
  await client.rpc('rpc_voice_confirm_consent', {
    pUserId: evidence.userId,
    pVoiceId: evidence.voiceId,
    pPermissionType: 'SELF',
    pConsentVersion: consentVersion,
    pConsentTextHash: consentHash,
    pConfirmedAt: new Date().toISOString(),
  });
  const queued = await client.rpc('rpc_voice_queue_processing', {
    pUserId: evidence.userId,
    pVoiceId: evidence.voiceId,
    pConsentVersion: consentVersion,
    pConsentTextHash: consentHash,
  });
  evidence.processJobId = queued.jobId;
  evidence.observations.push({ processInvokeRequestId: await invoke(queued.jobId, 'PROCESS_VOICE') });
  const processed = await poll(
    () => client.selectOne('voice_profiles', { filters: { id: evidence.voiceId } }),
    (row) => ['READY', 'FAILED'].includes(row?.status),
  );
  evidence.processStatus = processed.status;
  if (processed.status !== 'READY') throw new Error(`voice processing failed: ${processed.failureCode} ${processed.failureMessage}`);
  const preview = await client.selectOne('media_assets', {
    filters: { voiceProfileId: evidence.voiceId, kind: 'PREVIEW_AUDIO', status: 'READY' },
    order: [{ column: 'createdAt', ascending: false }],
  });
  if (!preview?.objectKey) throw new Error('preview audio is missing');
  evidence.previewMediaId = preview.id;
  evidence.previewOutput = path.resolve('outputs/cloudbase-e2e-preview.wav');
  await fsp.mkdir(path.dirname(evidence.previewOutput), { recursive: true });
  await client.downloadFile('aivoice-audio', preview.objectKey, evidence.previewOutput);

  const deleting = await client.rpc('rpc_account_delete_request', { pUserId: evidence.userId });
  evidence.deleteJobId = deleting.jobId;
  evidence.observations.push({ deleteInvokeRequestId: await invoke(deleting.jobId, 'DELETE_ACCOUNT') });
  const deletedJob = await poll(
    () => client.selectOne('jobs', { filters: { id: evidence.deleteJobId } }),
    (row) => ['SUCCEEDED', 'FAILED'].includes(row?.status),
  );
  evidence.deleteStatus = deletedJob.status;
  const [models, assets] = await Promise.all([
    client.select('voice_models', { filters: { voiceProfileId: evidence.voiceId } }),
    client.select('media_assets', { filters: { userId: evidence.userId } }),
  ]);
  evidence.observations.push({
    modelStatuses: models.map((item) => item.status),
    assetStatuses: assets.map((item) => item.status),
  });
  safeToHardDelete = deletedJob.status === 'SUCCEEDED'
    && models.every((item) => item.status === 'DELETED')
    && assets.every((item) => item.status === 'DELETED');
  evidence.cleanup = safeToHardDelete ? 'PROVIDER_STORAGE_FINALIZED' : 'INCOMPLETE';
  evidence.status = safeToHardDelete && evidence.processStatus === 'READY' && fs.statSync(evidence.previewOutput).size > 0
    ? 'PASS'
    : 'FAIL';
} catch (error) {
  evidence.observations.push({ error: error instanceof Error ? error.message : String(error) });
} finally {
  if (safeToHardDelete && evidence.userId) {
    await manager.database.executePGSql({ Sql: `DELETE FROM public.users WHERE id='${evidence.userId}'::uuid` });
    evidence.cleanup = 'HARD_DELETED_AFTER_FINALIZATION';
  }
  const outputPath = 'docs/auto-execute/results/cloudbase-full-flow.json';
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ...evidence, outputPath }, null, 2));
}

if (evidence.status !== 'PASS') process.exitCode = 1;
