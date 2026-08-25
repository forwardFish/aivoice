import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv, parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseEnvId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const resourceEnvId = process.env.CLOUDBASE_RESOURCE_ENV_ID || 'aiassistant-0517-d6en8tw82f2f7fc';
const runEnvId = process.env.CLOUDBASE_RUN_ENV_ID || resourceEnvId;
const serviceName = process.env.CLOUDBASE_SERVICE_NAME || 'aivoice-api';
const baseLocalEnv = fs.existsSync(path.join(projectRoot, '.env.local'))
  ? parseDotEnv(fs.readFileSync(path.join(projectRoot, '.env.local')))
  : {};
const wechatEnvPath = process.env.AIVOICE_WECHAT_ENV_FILE || 'D:/lyh/secrets/aivoice/wechat.env';
const wechatEnv = fs.existsSync(wechatEnvPath) ? parseDotEnv(fs.readFileSync(wechatEnvPath)) : {};
const virtualPayEnvPath = process.env.AIVOICE_VIRTUAL_PAY_ENV_FILE || 'D:/lyh/secrets/aivoice/virtual-pay.env';
const virtualPayEnv = fs.existsSync(virtualPayEnvPath) ? parseDotEnv(fs.readFileSync(virtualPayEnvPath)) : {};
const localEnv = { ...baseLocalEnv, ...wechatEnv, ...virtualPayEnv };

loadDotEnv({ path: path.join(projectRoot, '.env.local'), quiet: true });

const preferredCredentialFile = 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || (fs.existsSync(preferredCredentialFile)
    ? preferredCredentialFile
    : 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env');
const credentials = fs.existsSync(credentialFile)
  ? parseDotEnv(fs.readFileSync(credentialFile))
  : {};
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
await fsp.mkdir(secretsDir, { recursive: true });
let state = {};
if (fs.existsSync(statePath)) state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
state.envId = databaseEnvId;
state.databaseEnvId = databaseEnvId;
state.resourceEnvId = resourceEnvId;
state.runEnvId = runEnvId;
state.serviceName = serviceName;
state.mediaSigningSecret ||= crypto.randomBytes(32).toString('hex');
state.providerEncryptionKey ||= crypto.randomBytes(32).toString('base64');
if (/^[0-9a-f]{64}$/i.test(state.providerEncryptionKey)) {
  state.providerEncryptionKey = Buffer.from(state.providerEncryptionKey, 'hex').toString('base64');
}

if (process.env.CLOUDBASE_DEPLOY_DRY_RUN === 'true') {
  console.log(JSON.stringify({
    success: true,
    dryRun: true,
    databaseEnvId,
    resourceEnvId,
    runEnvId,
    serviceName,
    databaseTransport: 'CloudBase PostgreSQL REST/RPC',
    clientTransport: 'shared wx.cloud.Cloud + callContainer',
    storageTransport: 'shared native CloudBase storage',
  }, null, 2));
  process.exit(0);
}

const databaseApp = new CloudBase({ envId: databaseEnvId, region: 'ap-shanghai', secretId, secretKey });
const runApp = new CloudBase({ envId: runEnvId, region: 'ap-shanghai', secretId, secretKey });

async function query(sql) {
  return databaseApp.database.executePGSql({ Sql: sql });
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const server = await query('select current_database() as db');
const [dbName] = JSON.parse(server.Rows[0]);
state.database = dbName;

await query(`
CREATE TABLE IF NOT EXISTS public._aivoice_migrations (
  name text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)
`);
const appliedResult = await query('select name from public._aivoice_migrations order by name');
const applied = new Set((appliedResult.Rows || []).map((row) => JSON.parse(row)[0]));
const migrationsDir = path.join(projectRoot, 'apps/api/drizzle');
const migrations = (await fsp.readdir(migrationsDir))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
for (const name of migrations) {
  if (applied.has(name)) continue;
  const source = await fsp.readFile(path.join(migrationsDir, name), 'utf8');
  const sql = source.replaceAll('--> statement-breakpoint', '');
  const checksum = crypto.createHash('sha256').update(source).digest('hex');
  await query(`BEGIN;\n${sql}\nINSERT INTO public._aivoice_migrations(name, checksum) VALUES (${sqlString(name)}, ${sqlString(checksum)});\nCOMMIT;`);
  console.log(`migration applied ${name}`);
}

const cloudbaseSqlDir = path.join(projectRoot, 'apps/api/cloudbase');
if (fs.existsSync(cloudbaseSqlDir)) {
  const files = (await fsp.readdir(cloudbaseSqlDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    await query(await fsp.readFile(path.join(cloudbaseSqlDir, name), 'utf8'));
    console.log(`cloudbase RPC applied ${name}`);
  }
}

const runtimeProduct = {
  code: localEnv.POINTS_PACKAGE_CODE || 'POINTS_50',
  amountFen: Math.max(1, Number(localEnv.POINTS_PACKAGE_PRICE_FEN || 990)),
  points: Math.max(1, Number(localEnv.POINTS_PACKAGE_AMOUNT || 50)),
  validityDays: Math.max(1, Number(localEnv.POINTS_VALIDITY_DAYS || 180)),
};
await query(`
  INSERT INTO runtime_products(product_code,amount_fen,points,validity_days,active,updated_at)
  VALUES (${sqlString(runtimeProduct.code)},${runtimeProduct.amountFen},${runtimeProduct.points},${runtimeProduct.validityDays},true,now())
  ON CONFLICT(product_code) DO UPDATE SET amount_fen=EXCLUDED.amount_fen,points=EXCLUDED.points,
    validity_days=EXCLUDED.validity_days,active=true,updated_at=now()
`);

const publicBaseUrl = state.publicBaseUrl
  || 'https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com';
state.publicBaseUrl = publicBaseUrl;
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

function secretFromFile(valueName, pathName) {
  if (localEnv[valueName]) return localEnv[valueName];
  const filePath = localEnv[pathName];
  return filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

if (!state.runtimeApiKey) {
  throw new Error('CloudBase runtime API key is missing; run scripts/deploy/provision-cloudbase-runtime.mjs first');
}
const envParams = {
  NODE_ENV: 'production',
  PORT: '80',
  DATABASE_BACKEND: 'cloudbase',
  CLOUDBASE_ENV_ID: databaseEnvId,
  CLOUDBASE_API_KEY: state.runtimeApiKey,
  CLOUDBASE_STORAGE_MODE: 'native',
  CLOUDBASE_STORAGE_ENV_ID: resourceEnvId,
  CLOUDBASE_SOURCE_BUCKET: 'aivoice-source',
  CLOUDBASE_AUDIO_BUCKET: 'aivoice-audio',
  CLOUDBASE_JOB_EVENT_BUCKET: 'aivoice-jobs',
  CLOUDBASE_WORKER_FUNCTION_NAME: 'aivoice-worker',
  CLOUDBASE_WORKER_DISPATCHER: 'false',
  CLOUDBASE_FUNCTION_NAMESPACE: resourceEnvId,
  CLOUDBASE_SCF_REGION: 'ap-shanghai',
  CLOUDBASE_SCF_SECRET_ID: localEnv.CLOUDBASE_SCF_SECRET_ID || secretId,
  CLOUDBASE_SCF_SECRET_KEY: localEnv.CLOUDBASE_SCF_SECRET_KEY || secretKey,
  CLOUDBASE_NATIVE_STORAGE_SECRET_ID: localEnv.CLOUDBASE_SCF_SECRET_ID || secretId,
  CLOUDBASE_NATIVE_STORAGE_SECRET_KEY: localEnv.CLOUDBASE_SCF_SECRET_KEY || secretKey,
  SESSION_TTL_DAYS: localEnv.SESSION_TTL_DAYS || '30',
  PUBLIC_BASE_URL: publicBaseUrl,
  MEDIA_SIGNING_SECRET: localEnv.MEDIA_SIGNING_SECRET || state.mediaSigningSecret,
  PROVIDER_ID_ENCRYPTION_KEY: localEnv.PROVIDER_ID_ENCRYPTION_KEY || state.providerEncryptionKey,
  WECHAT_APP_ID: localEnv.WECHAT_APP_ID || '',
  WECHAT_APP_SECRET: localEnv.WECHAT_APP_SECRET || '',
  WECHAT_MOCK_LOGIN: 'false',
  WECHAT_PAY_MCH_ID: localEnv.WECHAT_PAY_MCH_ID || '',
  WECHAT_PAY_SERIAL_NO: localEnv.WECHAT_PAY_SERIAL_NO || '',
  WECHAT_PAY_PRIVATE_KEY: secretFromFile('WECHAT_PAY_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY_PATH'),
  WECHAT_PAY_MERCHANT_CERT: secretFromFile('WECHAT_PAY_MERCHANT_CERT', 'WECHAT_PAY_MERCHANT_CERT_PATH'),
  WECHAT_PAY_API_V3_KEY: localEnv.WECHAT_PAY_API_V3_KEY || '',
  WECHAT_PAY_PLATFORM_CERT: secretFromFile('WECHAT_PAY_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT_PATH'),
  WECHAT_PAY_PUBLIC_KEY_ID: localEnv.WECHAT_PAY_PUBLIC_KEY_ID || '',
  WECHAT_PAY_PUBLIC_KEY: secretFromFile('WECHAT_PAY_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY_PATH'),
  WECHAT_PAY_NOTIFY_URL: `${publicBaseUrl}/v1/payments/wechat/notify`,
  WECHAT_PAY_DESCRIPTION: localEnv.WECHAT_PAY_DESCRIPTION || '那年的TA-50积分包',
  WECHAT_PAY_TEST_MODE: 'false',
  WECHAT_PAYMENT_MODE: localEnv.WECHAT_PAYMENT_MODE || (localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID ? 'virtual' : 'standard'),
  WECHAT_VIRTUAL_PAY_ENV: localEnv.WECHAT_VIRTUAL_PAY_ENV || '0',
  WECHAT_VIRTUAL_PAY_OFFER_ID: localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID || '',
  WECHAT_VIRTUAL_PAY_APP_KEY: localEnv.WECHAT_VIRTUAL_PAY_APP_KEY || '',
  WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY: localEnv.WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY || '',
  WECHAT_VIRTUAL_PAY_MCH_ID: localEnv.WECHAT_VIRTUAL_PAY_MCH_ID || localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID || '',
  WECHAT_VIRTUAL_PAY_PRODUCT_ID: localEnv.WECHAT_VIRTUAL_PAY_PRODUCT_ID || 'POINTS_50',
  SIGNUP_BONUS_POINTS: localEnv.SIGNUP_BONUS_POINTS || '10',
  GENERATION_POINT_COST: localEnv.GENERATION_POINT_COST || '1',
  POINTS_PACKAGE_AMOUNT: localEnv.POINTS_PACKAGE_AMOUNT || '50',
  POINTS_PACKAGE_PRICE_FEN: localEnv.POINTS_PACKAGE_PRICE_FEN || '990',
  POINTS_VALIDITY_DAYS: localEnv.POINTS_VALIDITY_DAYS || '180',
  POINTS_PACKAGE_CODE: localEnv.POINTS_PACKAGE_CODE || 'POINTS_50',
};

const stagingRoot = path.join(projectRoot, '.aivoice-tmp', 'cloudbase-combined');
const relative = path.relative(projectRoot, stagingRoot);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe staging path');
await fsp.rm(stagingRoot, { recursive: true, force: true });
await fsp.mkdir(stagingRoot, { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'tsconfig.base.json', 'Dockerfile']) {
  await fsp.copyFile(path.join(projectRoot, file), path.join(stagingRoot, file));
}
for (const dir of ['packages/contracts', 'packages/cloudbase-runtime', 'apps/api', 'scripts/runtime']) {
  const destination = path.join(stagingRoot, dir);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.cp(path.join(projectRoot, dir), destination, {
    recursive: true,
    filter: (source) => !/(^|[\\/])(node_modules|dist|test|\.runtime)([\\/]|$)/.test(source)
      && !/(^|[\\/])\.env(?:\.|$)/.test(source)
      && !/\.(?:mp4|mov|avi|wav|mp3|pem|key|p12|pfx)$/i.test(source),
  });
}

const deployResult = await runApp.cloudrun.deploy({
  serverName: serviceName,
  targetPath: stagingRoot,
  deployInfo: { ReleaseType: 'FULL' },
  serverConfig: {
    OpenAccessTypes: ['OA', 'PUBLIC', 'MINIAPP'],
    Cpu: 0.25,
    Mem: 0.5,
    MinNum: 1,
    MaxNum: 2,
    Port: 80,
    Dockerfile: 'Dockerfile',
    BuildDir: '',
    InitialDelaySeconds: 30,
    CustomLogs: 'stdout',
    EnvParams: JSON.stringify(envParams),
    InstallDependency: true,
  },
});

console.log(JSON.stringify({
  success: true,
  databaseEnvId,
  resourceEnvId,
  runEnvId,
  serviceName,
  deployRequestId: deployResult.RequestId || '',
  statePath,
  missingRuntimeValues: Object.entries({
    WECHAT_APP_SECRET: envParams.WECHAT_APP_SECRET,
    WECHAT_PAY_PUBLIC_KEY_ID: envParams.WECHAT_PAY_PUBLIC_KEY_ID,
    WECHAT_PAY_PUBLIC_KEY: envParams.WECHAT_PAY_PUBLIC_KEY,
  }).filter(([, value]) => !value).map(([name]) => name),
}, null, 2));
