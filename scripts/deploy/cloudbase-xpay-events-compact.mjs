import crypto from 'node:crypto';
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
const functionName = process.env.CLOUDBASE_XPAY_EVENTS_FUNCTION_NAME || 'aivoice-xpay-events';
const credentials = parseDotEnv(fs.readFileSync(process.env.CLOUDBASE_CREDENTIALS_FILE || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env'));
const baseEnvPath = process.env.AIVOICE_RUNTIME_ENV_FILE || 'D:/lyh/agent/agent-frame/aivoice/.env.local';
const baseEnv = fs.existsSync(baseEnvPath) ? parseDotEnv(fs.readFileSync(baseEnvPath)) : {};
const wechatEnv = parseDotEnv(fs.readFileSync(process.env.AIVOICE_WECHAT_ENV_FILE || 'D:/lyh/secrets/aivoice/wechat.env'));
const virtualPayEnv = parseDotEnv(fs.readFileSync(process.env.AIVOICE_VIRTUAL_PAY_ENV_FILE || 'D:/lyh/secrets/aivoice/virtual-pay.env'));
const localEnv = { ...baseEnv, ...wechatEnv, ...virtualPayEnv };
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Rotated Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
if (!state.runtimeApiKey) throw new Error('Rotated CloudBase runtime API key is missing');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const stagingRoot = path.join(projectRoot, '.aivoice-tmp', 'cloudbase-xpay-events-compact');
await fsp.rm(stagingRoot, { recursive: true, force: true });
await fsp.mkdir(stagingRoot, { recursive: true });
await fsp.copyFile(path.join(projectRoot, 'cloudfunctions/aivoice-xpay-events/package.json'), path.join(stagingRoot, 'package.json'));
await run('npx', [
  '--no-install', 'esbuild', 'cloudfunctions/aivoice-xpay-events/event.mjs',
  '--bundle', '--platform=node', '--format=esm', '--target=node20',
  `--outfile=${path.join(stagingRoot, 'index.mjs')}`,
  '--external:@cloudbase/node-sdk',
]);
const zipPath = path.join(projectRoot, '.aivoice-tmp', 'aivoice-xpay-events.zip');
await fsp.rm(zipPath, { force: true });
await run('tar', ['-a', '-c', '-f', zipPath, '-C', stagingRoot, 'index.mjs', 'package.json']);
const zipBytes = (await fsp.stat(zipPath)).size;
if (zipBytes > 1.5 * 1024 * 1024) throw new Error(`Payment events zip is too large: ${zipBytes}`);
const base64Code = await fsp.readFile(zipPath, 'base64');

const messageToken = localEnv.WECHAT_MESSAGE_TOKEN || state.virtualPayMessageToken || crypto.randomBytes(24).toString('hex');
const encodingAesKey = localEnv.WECHAT_MESSAGE_ENCODING_AES_KEY || state.virtualPayEncodingAesKey
  || crypto.randomBytes(32).toString('base64').replace(/=/g, '').slice(0, 43);
const envVariables = {
  NODE_ENV: 'production',
  PORT: '9000',
  CLOUDBASE_ENV_ID: databaseEnvId,
  CLOUDBASE_API_KEY: state.runtimeApiKey,
  WECHAT_APP_ID: localEnv.WECHAT_APP_ID || '',
  WECHAT_VIRTUAL_PAY_MCH_ID: localEnv.WECHAT_VIRTUAL_PAY_MCH_ID || localEnv.WECHAT_VIRTUAL_PAY_OFFER_ID || '',
  WECHAT_VIRTUAL_PAY_PRODUCT_ID: localEnv.WECHAT_VIRTUAL_PAY_PRODUCT_ID || 'POINTS_50',
  WECHAT_MESSAGE_TOKEN: messageToken,
  WECHAT_MESSAGE_ENCODING_AES_KEY: encodingAesKey,
};
if (!envVariables.WECHAT_APP_ID || !envVariables.WECHAT_VIRTUAL_PAY_MCH_ID || encodingAesKey.length !== 43) {
  throw new Error('Virtual-payment event credentials are incomplete');
}
const callbackBase = `https://${functionEnvId}-1434074357.ap-shanghai.app.tcloudbase.com/${functionName}`;

if (process.env.CLOUDBASE_DEPLOY_DRY_RUN === 'true') {
  console.log(JSON.stringify({
    success: true,
    dryRun: true,
    databaseEnvId,
    functionEnvId,
    functionName,
    callbackBase,
    zipBytes,
    messageTokenConfigured: true,
    encodingAesKeyConfigured: true,
  }, null, 2));
  process.exit(0);
}

const app = new CloudBase({ envId: functionEnvId, region: 'ap-shanghai', secretId, secretKey });
const common = {
  name: functionName,
  description: '那时的TA虚拟支付发货退款与投诉事件',
  type: 'Event',
  handler: 'index.main',
  runtime: 'Nodejs20.19',
  timeout: 10,
  memorySize: 512,
  installDependency: true,
  envVariables,
};
const result = await app.functions.createFunction({
  func: common,
  base64Code,
  force: process.env.CLOUDBASE_CREATE_ONLY !== 'true',
});
try {
  await app.access.createAccess({
    name: functionName,
    path: `/${functionName}`,
    type: 1,
    auth: false,
  });
} catch (error) {
  if (error?.code !== 'InvalidParameter.APICreated') throw error;
}
state.virtualPayEventsFunctionName = functionName;
state.virtualPayEventsFunctionEnvId = functionEnvId;
state.virtualPayEventsCallbackBase = callbackBase;
state.virtualPayMessageToken = messageToken;
state.virtualPayEncodingAesKey = encodingAesKey;
state.virtualPayEventsDeployedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  success: true,
  databaseEnvId,
  functionEnvId,
  functionName,
  callbackBase,
  requestId: result?.RequestId || '',
  statePath,
}, null, 2));
