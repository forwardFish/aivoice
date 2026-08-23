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
await fsp.mkdir(secretsDir, { recursive: true });
const state = fs.existsSync(statePath) ? JSON.parse(await fsp.readFile(statePath, 'utf8')) : {};

const app = new CloudBase({ envId, region: 'ap-shanghai', secretId, secretKey });
if (!state.runtimeApiKey) {
  const created = await app.env.createApiKey({
    KeyType: 'api_key',
    KeyName: 'aivoice-runtime',
    ExpireIn: 0,
  });
  if (!created.ApiKey) throw new Error('CloudBase returned no API key material');
  state.runtimeApiKey = created.ApiKey;
  state.runtimeApiKeyId = created.KeyId;
  state.runtimeApiKeyCreatedAt = created.CreateAt || new Date().toISOString();
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const query = (sql) => app.database.executePGSql({ Sql: sql });

const buckets = [
  {
    id: 'aivoice-source',
    limit: 100 * 1024 * 1024,
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
  },
  {
    id: 'aivoice-audio',
    limit: 25 * 1024 * 1024,
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4'],
  },
  {
    id: 'aivoice-jobs',
    limit: 1024 * 1024,
    mimeTypes: ['application/json'],
  },
  {
    id: 'aivoice-runtime',
    limit: 100 * 1024 * 1024,
    mimeTypes: ['application/octet-stream'],
  },
];

for (const bucket of buckets) {
  await query(`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      ${sqlString(bucket.id)},
      ${sqlString(bucket.id)},
      false,
      ${bucket.limit},
      ARRAY[${bucket.mimeTypes.map(sqlString).join(',')}]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types
  `);
}

const cloudbaseSqlDir = path.join(projectRoot, 'apps/api/cloudbase');
const applied = [];
if (fs.existsSync(cloudbaseSqlDir)) {
  const files = (await fsp.readdir(cloudbaseSqlDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    await query(await fsp.readFile(path.join(cloudbaseSqlDir, name), 'utf8'));
    applied.push(name);
  }
}

state.envId = envId;
state.databaseApiBase = `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest`;
state.storageApiBase = `https://${envId}.api.tcloudbasegateway.com/v1/storages`;
state.storageBuckets = buckets.map((bucket) => bucket.id);
state.runtimeProvisionedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  success: true,
  envId,
  apiKeyId: state.runtimeApiKeyId,
  bucketCount: buckets.length,
  appliedSql: applied,
  statePath,
}, null, 2));
