import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env';
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
if (!fs.existsSync(statePath)) throw new Error('CloudBase deployment state is missing');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
if (!state.runtimeApiKey || !state.runtimeApiKeyId) throw new Error('Current CloudBase runtime API key is missing');

const app = new CloudBase({ envId, region: 'ap-shanghai', secretId, secretKey });
if (!state.runtimeApiKeyRotationPending) {
  const created = await app.env.createApiKey({
    KeyType: 'api_key',
    KeyName: `aivoice-runtime-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
    ExpireIn: 0,
  });
  if (!created.ApiKey || !created.KeyId) throw new Error('CloudBase returned incomplete API key material');
  state.previousRuntimeApiKeyId = state.runtimeApiKeyId;
  state.previousRuntimeApiKeyCreatedAt = state.runtimeApiKeyCreatedAt || null;
  state.runtimeApiKey = created.ApiKey;
  state.runtimeApiKeyId = created.KeyId;
  state.runtimeApiKeyCreatedAt = created.CreateAt || new Date().toISOString();
  state.runtimeApiKeyRotationPending = true;
  state.runtimeApiKeyRotationStartedAt = new Date().toISOString();
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

const probeUrl = `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/runtime_products?select=product_code&limit=1`;
const probe = await fetch(probeUrl, {
  headers: { Authorization: `Bearer ${state.runtimeApiKey}` },
  signal: AbortSignal.timeout(15_000),
});
if (!probe.ok) throw new Error(`New CloudBase API key probe failed with HTTP ${probe.status}`);
state.runtimeApiKeyRotationVerifiedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  success: true,
  envId,
  newKeyConfigured: true,
  newKeyVerified: true,
  previousKeyPreserved: Boolean(state.previousRuntimeApiKeyId),
  oldKeyDisabled: false,
  statePath,
}, null, 2));
