import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseEnvId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const functionEnvId = process.env.CLOUDBASE_RESOURCE_ENV_ID || 'aiassistant-0517-d6en8tw82f2f7fc';
const functionName = process.env.CLOUDBASE_API_EVENT_FUNCTION_NAME || 'aivoice-api-event';
const credentials = parseDotEnv(fs.readFileSync(process.env.CLOUDBASE_CREDENTIALS_FILE || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env'));
const baseEnv = parseDotEnv(fs.readFileSync(process.env.AIVOICE_RUNTIME_ENV_FILE || 'D:/lyh/agent/agent-frame/aivoice/.env.local'));
const wechatEnv = parseDotEnv(fs.readFileSync(process.env.AIVOICE_WECHAT_ENV_FILE || 'D:/lyh/secrets/aivoice/wechat.env'));
const virtualPayEnv = parseDotEnv(fs.readFileSync(process.env.AIVOICE_VIRTUAL_PAY_ENV_FILE || 'D:/lyh/secrets/aivoice/virtual-pay.env'));
const localEnv = { ...baseEnv, ...wechatEnv, ...virtualPayEnv };
const secretId = credentials.TENCENTCLOUD_SECRETID;
const secretKey = credentials.TENCENTCLOUD_SECRETKEY;
const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
if (!secretId || !secretKey || !state.runtimeApiKey) throw new Error('Rotated deployment state is incomplete');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const stage = path.join(projectRoot, '.aivoice-tmp', 'cloudbase-api-event');
await fsp.rm(stage, { recursive: true, force: true });
await fsp.mkdir(stage, { recursive: true });
await fsp.copyFile(path.join(projectRoot, 'cloudfunctions/aivoice-api-event/package.json'), path.join(stage, 'package.json'));
await run('npx', [
  '--no-install', 'esbuild', 'cloudfunctions/aivoice-api-event/index.ts',
  '--bundle', '--platform=node', '--format=cjs', '--target=node20', '--minify',
  `--outfile=${path.join(stage, 'api.cjs')}`,
  '--external:pg-native', '--external:bufferutil', '--external:utf-8-validate',
  '--external:@nestjs/websockets/socket-module',
  '--external:@nestjs/microservices/microservices-module', '--external:@nestjs/microservices',
]);
await fsp.copyFile(path.join(projectRoot, 'cloudfunctions/aivoice-api-event/entry.mjs'), path.join(stage, 'index.mjs'));
const zipPath = path.join(projectRoot, '.aivoice-tmp', 'aivoice-api-event.zip');
await fsp.rm(zipPath, { force: true });
await run('tar', ['-a', '-c', '-f', zipPath, '-C', stage, 'index.mjs', 'api.cjs', 'package.json']);
const zipBytes = (await fsp.stat(zipPath)).size;
if (zipBytes > 1.5 * 1024 * 1024) throw new Error(`API event zip too large: ${zipBytes}`);
const base64Code = await fsp.readFile(zipPath, 'base64');

const envVariables = {
  NODE_ENV: 'production', DATABASE_BACKEND: 'cloudbase', CLOUDBASE_ENV_ID: databaseEnvId,
  MEDIA_LOCAL_ROOT: '/tmp/aivoice-api/media',
  CLOUDBASE_API_KEY: state.runtimeApiKey, CLOUDBASE_STORAGE_MODE: 'native', CLOUDBASE_STORAGE_ENV_ID: functionEnvId,
  CLOUDBASE_SOURCE_BUCKET: 'aivoice-source', CLOUDBASE_AUDIO_BUCKET: 'aivoice-audio', CLOUDBASE_JOB_EVENT_BUCKET: 'aivoice-jobs',
  CLOUDBASE_WORKER_FUNCTION_NAME: 'aivoice-worker', CLOUDBASE_WORKER_DISPATCHER: 'false', CLOUDBASE_FUNCTION_NAMESPACE: functionEnvId,
  CLOUDBASE_SCF_REGION: 'ap-shanghai', CLOUDBASE_SCF_SECRET_ID: secretId, CLOUDBASE_SCF_SECRET_KEY: secretKey,
  CLOUDBASE_NATIVE_STORAGE_SECRET_ID: secretId, CLOUDBASE_NATIVE_STORAGE_SECRET_KEY: secretKey,
  SESSION_TTL_DAYS: localEnv.SESSION_TTL_DAYS || '30', MEDIA_SIGNING_SECRET: state.mediaSigningSecret,
  PROVIDER_ID_ENCRYPTION_KEY: state.providerEncryptionKey, WECHAT_APP_ID: localEnv.WECHAT_APP_ID,
  WECHAT_APP_SECRET: localEnv.WECHAT_APP_SECRET, WECHAT_MOCK_LOGIN: 'false', WECHAT_PAYMENT_MODE: 'virtual',
  WECHAT_VIRTUAL_PAY_ENV: localEnv.WECHAT_VIRTUAL_PAY_ENV || '1', WECHAT_VIRTUAL_PAY_OFFER_ID: localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID,
  WECHAT_VIRTUAL_PAY_APP_KEY: localEnv.WECHAT_VIRTUAL_PAY_APP_KEY || '', WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY: localEnv.WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY,
  WECHAT_VIRTUAL_PAY_MCH_ID: localEnv.WECHAT_VIRTUAL_PAY_MCH_ID || localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID,
  WECHAT_VIRTUAL_PAY_PRODUCT_ID: localEnv.WECHAT_VIRTUAL_PAY_PRODUCT_ID || 'POINTS_50',
  SIGNUP_BONUS_POINTS: '8', GENERATION_POINT_COST: '1', POINTS_PACKAGE_AMOUNT: '50', POINTS_PACKAGE_PRICE_FEN: '990',
  POINTS_VALIDITY_DAYS: '180', POINTS_PACKAGE_CODE: 'POINTS_50',
};

if (process.env.CLOUDBASE_DEPLOY_DRY_RUN === 'true') {
  console.log(JSON.stringify({ success: true, dryRun: true, databaseEnvId, functionEnvId, functionName, zipBytes }, null, 2));
  process.exit(0);
}
const app = new CloudBase({ envId: functionEnvId, region: 'ap-shanghai', secretId, secretKey });
const result = await app.functions.createFunction({
  func: {
    name: functionName, description: '那年的TA NestJS 事件 API', type: 'Event', handler: 'index.main', runtime: 'Nodejs20.19',
    timeout: 30, memorySize: 1024, installDependency: false, envVariables,
  },
  base64Code,
  force: true,
});
state.apiEventFunctionName = functionName;
state.apiEventFunctionEnvId = functionEnvId;
state.apiEventFunctionDeployedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ success: true, databaseEnvId, functionEnvId, functionName, requestId: result?.RequestId || '' }, null, 2));
