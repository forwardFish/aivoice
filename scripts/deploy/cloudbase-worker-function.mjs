import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseEnvId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const functionEnvId = process.env.CLOUDBASE_RESOURCE_ENV_ID || 'aiassistant-0517-d6en8tw82f2f7fc';
const functionName = process.env.CLOUDBASE_WORKER_FUNCTION_NAME || 'aivoice-worker';
const preferredCredentialFile = 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || (fs.existsSync(preferredCredentialFile)
    ? preferredCredentialFile
    : 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env');
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const localEnvPath = process.env.AIVOICE_RUNTIME_ENV_FILE || path.join(projectRoot, '.env.local');
const baseLocalEnv = fs.existsSync(localEnvPath) ? parseDotEnv(fs.readFileSync(localEnvPath)) : {};
const aliyunEnvPath = process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env';
const aliyunEnv = fs.existsSync(aliyunEnvPath) ? parseDotEnv(fs.readFileSync(aliyunEnvPath)) : {};
const localEnv = { ...baseLocalEnv, ...aliyunEnv };
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
if (!fs.existsSync(statePath)) throw new Error('CloudBase deployment state is missing; provision runtime first');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
if (!state.runtimeApiKey) throw new Error('CloudBase runtime API key is missing; provision runtime first');
if (/^[0-9a-f]{64}$/i.test(state.providerEncryptionKey || '')) {
  state.providerEncryptionKey = Buffer.from(state.providerEncryptionKey, 'hex').toString('base64');
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await run('npm', ['run', 'build', '-w', '@aivoice/contracts']);
await run('npm', ['run', 'build', '-w', '@aivoice/cloudbase-runtime']);
await run('npm', ['run', 'build', '-w', '@aivoice/worker']);

const stagingRoot = path.join(projectRoot, '.aivoice-tmp', 'cloudbase-worker-function');
const relative = path.relative(projectRoot, stagingRoot);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe worker staging path');
await fsp.rm(stagingRoot, { recursive: true, force: true });
await fsp.mkdir(stagingRoot, { recursive: true });
await fsp.cp(path.join(projectRoot, 'cloudfunctions/aivoice-worker'), stagingRoot, { recursive: true });
await run('npm', [
  'install', '--prefix', stagingRoot, '--omit=dev', '--ignore-scripts', '--workspaces=false',
  '--force', '--os=linux', '--cpu=x64',
]);
const workspaceLink = path.join(stagingRoot, 'node_modules/aivoice-workspace');
if (fs.existsSync(workspaceLink)) await fsp.rmdir(workspaceLink);

for (const workspace of [
  ['@aivoice/contracts', 'packages/contracts'],
  ['@aivoice/cloudbase-runtime', 'packages/cloudbase-runtime'],
  ['@aivoice/worker', 'apps/worker'],
]) {
  const [packageName, sourceDir] = workspace;
  const destination = path.join(stagingRoot, 'node_modules', ...packageName.split('/'));
  await fsp.mkdir(destination, { recursive: true });
  await fsp.copyFile(path.join(projectRoot, sourceDir, 'package.json'), path.join(destination, 'package.json'));
  await fsp.cp(path.join(projectRoot, sourceDir, 'dist'), path.join(destination, 'dist'), { recursive: true });
}

const bundledFfmpegPath = path.join(stagingRoot, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
if (!fs.existsSync(bundledFfmpegPath)) throw new Error('bundled Linux FFmpeg is missing');
await fsp.chmod(bundledFfmpegPath, 0o755);
const junctions = (await fsp.readdir(path.join(stagingRoot, 'node_modules'), { withFileTypes: true }))
  .filter((entry) => entry.isSymbolicLink());
if (fs.existsSync(path.join(stagingRoot, 'node_modules/aivoice-workspace'))) {
  throw new Error('worker staging unexpectedly links the workspace root');
}
if (junctions.length) throw new Error(`worker staging contains links: ${junctions.map((entry) => entry.name).join(',')}`);

const ffmpegLayerName = process.env.CLOUDBASE_FFMPEG_LAYER_NAME || localEnv.CLOUDBASE_FFMPEG_LAYER_NAME || '';
const ffmpegLayerVersion = Number(process.env.CLOUDBASE_FFMPEG_LAYER_VERSION || localEnv.CLOUDBASE_FFMPEG_LAYER_VERSION || 0);
const layers = ffmpegLayerName && Number.isSafeInteger(ffmpegLayerVersion) && ffmpegLayerVersion > 0
  ? [{ name: ffmpegLayerName, version: ffmpegLayerVersion }]
  : [];

const envVariables = {
  NODE_ENV: 'production',
  DATABASE_BACKEND: 'cloudbase',
  CLOUDBASE_ENV_ID: databaseEnvId,
  CLOUDBASE_API_KEY: state.runtimeApiKey,
  CLOUDBASE_APIKEY: state.runtimeApiKey,
  CLOUDBASE_STORAGE_MODE: process.env.CLOUDBASE_STORAGE_MODE || 'native',
  CLOUDBASE_STORAGE_ENV_ID: functionEnvId,
  CLOUDBASE_SOURCE_BUCKET: 'aivoice-source',
  CLOUDBASE_AUDIO_BUCKET: 'aivoice-audio',
  CLOUDBASE_JOBS_BUCKET: 'aivoice-jobs',
  WORKER_TEMP_ROOT: '/tmp/aivoice',
  FFMPEG_PATH: layers.length ? '/opt/bin/ffmpeg' : '/tmp/aivoice-bin/ffmpeg',
  BUNDLED_FFMPEG_PATH: layers.length ? '' : 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
  CLOUDBASE_FFMPEG_OBJECT_KEY: '',
  PROVIDER_ID_ENCRYPTION_KEY: localEnv.PROVIDER_ID_ENCRYPTION_KEY || state.providerEncryptionKey,
  DASHSCOPE_API_KEY: localEnv.DASHSCOPE_API_KEY || '',
  DASHSCOPE_API_HOST: localEnv.DASHSCOPE_API_HOST || '',
  DASHSCOPE_WORKSPACE_ID: localEnv.DASHSCOPE_WORKSPACE_ID || '',
  AIVOICE_TARGET_MODEL: localEnv.AIVOICE_TARGET_MODEL || 'cosyvoice-v3.5-flash',
  AIVOICE_SPEAKER_DIARIZATION_ENABLED: localEnv.AIVOICE_SPEAKER_DIARIZATION_ENABLED || 'true',
  AIVOICE_DIARIZATION_MODEL: localEnv.AIVOICE_DIARIZATION_MODEL || 'fun-asr',
  CHAT_MODEL: localEnv.CHAT_MODEL || 'qwen3.8-max',
  VOICE_PREVIEW_TEXT: localEnv.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。',
  GENERATION_POINT_COST: localEnv.GENERATION_POINT_COST || '1',
};

if (process.env.CLOUDBASE_DEPLOY_DRY_RUN === 'true') {
  const entry = await import(pathToFileURL(path.join(stagingRoot, 'index.mjs')).href);
  if (typeof entry.main !== 'function') throw new Error('staged worker function does not export main');
  console.log(JSON.stringify({
    success: true,
    dryRun: true,
    databaseEnvId,
    functionEnvId,
    storageEnvId: functionEnvId,
    functionName,
    stagedEntrypoint: path.join(stagingRoot, 'index.mjs'),
    asyncExecution: true,
    timeoutSeconds: 900,
    memoryMb: 2048,
    ffmpegDelivery: layers.length === 1 ? 'layer' : 'bundled-linux-x64',
  }, null, 2));
  process.exit(0);
}

const app = new CloudBase({ envId: functionEnvId, region: 'ap-shanghai', secretId, secretKey });
const functions = await app.functions.listFunctions();
const exists = functions.some((item) => String(item.FunctionName || item.name) === functionName);
const common = {
  name: functionName,
  description: '那年的TA按任务启动声音处理Worker',
  type: 'Event',
  handler: 'index.main',
  runtime: 'Nodejs20.19',
  timeout: 900,
  memorySize: 2048,
  installDependency: false,
  envVariables,
  layers,
  triggers: [{
    name: 'aivoice-worker-recovery',
    type: 'timer',
    config: '0 */1 * * * * *',
  }],
};

let result;
if (!exists) {
  result = await app.functions.createFunction({
    func: common,
    functionRootPath: projectRoot,
    functionPath: stagingRoot,
  });
} else {
  result = await app.functions.updateFunctionWithProgress({
    name: functionName,
    code: { functionRootPath: projectRoot, functionPath: stagingRoot },
    config: common,
  });
}

state.workerFunctionName = functionName;
state.workerFunctionEnvId = functionEnvId;
state.workerFunctionTimeoutSeconds = 900;
state.workerFunctionMemoryMb = 2048;
state.workerFunctionAsync = true;
state.workerFfmpegLayer = layers[0] || null;
state.workerFfmpegObjectKey = null;
state.workerFunctionDeployedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  success: true,
  databaseEnvId,
  functionEnvId,
  functionName,
  asyncExecution: true,
  timeoutSeconds: 900,
  memoryMb: 2048,
  ffmpegLayerConfigured: layers.length === 1,
  ffmpegDelivery: layers.length === 1 ? 'layer' : 'bundled-linux-x64',
  requestId: result?.RequestId || '',
  statePath,
}, null, 2));
