import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const oldCredentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env';
const newCredentialFile = process.env.AIVOICE_TENCENTCLOUD_CREDENTIALS_FILE
  || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const oldCredentials = fs.existsSync(oldCredentialFile) ? parseDotEnv(fs.readFileSync(oldCredentialFile)) : {};
const currentSecretId = process.env.TENCENTCLOUD_SECRETID || oldCredentials.TENCENTCLOUD_SECRETID;
const currentSecretKey = process.env.TENCENTCLOUD_SECRETKEY || oldCredentials.TENCENTCLOUD_SECRETKEY;
if (!currentSecretId || !currentSecretKey) throw new Error('Current Tencent Cloud credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
const state = fs.existsSync(statePath) ? JSON.parse(await fsp.readFile(statePath, 'utf8')) : {};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

async function camRequest(action, body, secretId, secretKey) {
  const host = 'cam.tencentcloudapi.com';
  const service = 'cam';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify(body);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(payload)}`;
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`;
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': '2019-01-16',
    },
    body: payload,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || data.Response?.Error) {
    throw new Error(data.Response?.Error?.Code || `Tencent CAM HTTP ${response.status}`);
  }
  return data.Response;
}

let nextCredentials;
if (fs.existsSync(newCredentialFile)) {
  const saved = parseDotEnv(fs.readFileSync(newCredentialFile));
  if (!saved.TENCENTCLOUD_SECRETID || !saved.TENCENTCLOUD_SECRETKEY) {
    throw new Error('Saved Tencent Cloud rotation file is incomplete');
  }
  nextCredentials = {
    secretId: saved.TENCENTCLOUD_SECRETID,
    secretKey: saved.TENCENTCLOUD_SECRETKEY,
  };
} else {
  const listed = await camRequest('ListAccessKeys', {}, currentSecretId, currentSecretKey);
  const keys = Array.isArray(listed.AccessKeys) ? listed.AccessKeys : [];
  if (keys.length >= 2) throw new Error('ACCESS_KEY_LIMIT_REACHED');
  const created = await camRequest('CreateAccessKey', {
    Description: `aivoice-rotation-${new Date().toISOString().slice(0, 10)}`,
  }, currentSecretId, currentSecretKey);
  const accessKey = created.AccessKey;
  if (!accessKey?.AccessKeyId || !accessKey?.SecretAccessKey) {
    throw new Error('Tencent CAM returned incomplete access key material');
  }
  nextCredentials = {
    secretId: accessKey.AccessKeyId,
    secretKey: accessKey.SecretAccessKey,
  };
  await fsp.mkdir(path.dirname(newCredentialFile), { recursive: true });
  await fsp.writeFile(newCredentialFile, [
    `TENCENTCLOUD_SECRETID=${nextCredentials.secretId}`,
    `TENCENTCLOUD_SECRETKEY=${nextCredentials.secretKey}`,
    '',
  ].join('\n'), { mode: 0o600 });
  state.previousTencentCloudSecretId = currentSecretId;
  state.tencentCloudSecretId = nextCredentials.secretId;
  state.tencentCloudAccessKeyRotationPending = true;
  state.tencentCloudAccessKeyRotationStartedAt = new Date().toISOString();
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

const verify = new CloudBase({
  envId,
  region: 'ap-shanghai',
  secretId: nextCredentials.secretId,
  secretKey: nextCredentials.secretKey,
});
await verify.database.executePGSql({ Sql: 'select 1 as ok' });
state.tencentCloudAccessKeyRotationVerifiedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  success: true,
  newCredentialFile,
  newKeyConfigured: true,
  newKeyVerified: true,
  previousKeyPreserved: true,
  oldKeyDisabled: false,
}, null, 2));
