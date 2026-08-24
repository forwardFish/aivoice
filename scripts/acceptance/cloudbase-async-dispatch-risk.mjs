import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { scf } from 'tencentcloud-sdk-nodejs-scf';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const functionName = process.env.CLOUDBASE_WORKER_FUNCTION_NAME || 'aivoice-worker';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env';
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Tencent Cloud dispatch credentials are missing');
const client = new scf.v20180416.Client({
  credential: { secretId, secretKey },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com' } },
});

const jobId = crypto.randomUUID();
const startedAt = new Date().toISOString();
const started = Date.now();
const response = await client.Invoke({
  FunctionName: functionName,
  Namespace: envId,
  InvocationType: 'Event',
  ClientContext: JSON.stringify({ jobId, type: 'RISK_TEST_NONEXISTENT_JOB' }),
  LogType: 'None',
});
const acceptedMs = Date.now() - started;
const invokeRequestId = response.Result?.FunctionRequestId || '';
let asyncStatus = '';
let asyncStatusCode = -1;
let logRetCode = -1;
let logInvokeFinished = 0;
let executionDurationMs = null;
if (invokeRequestId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      const statusResponse = await client.GetAsyncEventStatus({ InvokeRequestId: invokeRequestId });
      asyncStatus = statusResponse.Result?.Status || '';
      asyncStatusCode = Number(statusResponse.Result?.StatusCode ?? -1);
      if (['FINISHED', 'FAILED', 'ABORTED'].includes(asyncStatus)) break;
    } catch (error) {
      if (error?.code !== 'ResourceNotFound.AsyncEvent') throw error;
    }
    const logs = await client.GetFunctionLogs({
      FunctionName: functionName,
      Namespace: envId,
      FunctionRequestId: invokeRequestId,
      Limit: 1,
    });
    const log = logs.Data?.[0];
    if (log) {
      logRetCode = Number(log.RetCode ?? -1);
      logInvokeFinished = Number(log.InvokeFinished ?? 0);
      executionDurationMs = log.Duration ?? null;
      if (logInvokeFinished === 1) break;
    }
  }
}
const executionConfirmed = asyncStatus === 'FINISHED' || (logInvokeFinished === 1 && logRetCode === 0);
let synchronousProbeStatus = '';
let synchronousProbeDurationMs = null;
if (!executionConfirmed) {
  const syncStarted = Date.now();
  const syncResponse = await client.InvokeFunction({
    FunctionName: functionName,
    Namespace: envId,
    Event: JSON.stringify({ jobId: crypto.randomUUID(), type: 'RISK_TEST_NONEXISTENT_JOB' }),
    LogType: 'None',
  });
  synchronousProbeDurationMs = Date.now() - syncStarted;
  try {
    synchronousProbeStatus = JSON.parse(syncResponse.Result?.RetMsg || '{}').status || '';
  } catch {
    synchronousProbeStatus = '';
  }
}
const callableConfirmed = executionConfirmed || synchronousProbeStatus === 'SKIPPED';
const evidence = {
  status: acceptedMs < 3_000 && Boolean(invokeRequestId) && callableConfirmed
    ? executionConfirmed ? 'PASS' : 'PASS_WITH_LIMITATION'
    : 'FAIL',
  envId,
  functionName,
  invocationType: 'Event',
  acceptedMs,
  invokeRequestId,
  asyncStatus,
  asyncStatusCode,
  logRetCode,
  logInvokeFinished,
  executionDurationMs,
  synchronousProbeStatus,
  synchronousProbeDurationMs,
  synchronousDurationReturned: response.Result?.Duration ?? null,
  synchronousPayloadReturned: response.Result?.RetMsg ?? null,
  startedAt,
  finishedAt: new Date().toISOString(),
};
const outputPath = path.join(projectRoot, 'docs/auto-execute/results/pure-cloud-async-dispatch.json');
await fsp.mkdir(path.dirname(outputPath), { recursive: true });
await fsp.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!String(evidence.status).startsWith('PASS')) process.exitCode = 1;
