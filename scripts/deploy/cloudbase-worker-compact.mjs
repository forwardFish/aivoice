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
const functionName = process.env.CLOUDBASE_WORKER_FUNCTION_NAME || 'aivoice-worker';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const runtimeEnvPath = process.env.AIVOICE_RUNTIME_ENV_FILE || 'D:/lyh/agent/agent-frame/aivoice/.env.local';
const baseEnv = fs.existsSync(runtimeEnvPath) ? parseDotEnv(fs.readFileSync(runtimeEnvPath)) : {};
const aliyunEnvPath = process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env';
const aliyunEnv = fs.existsSync(aliyunEnvPath) ? parseDotEnv(fs.readFileSync(aliyunEnvPath)) : {};
const volcengineEnvPath = process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env';
const volcengineEnv = fs.existsSync(volcengineEnvPath) ? parseDotEnv(fs.readFileSync(volcengineEnvPath)) : {};
const deepseekEnvPath = process.env.AIVOICE_DEEPSEEK_ENV_FILE || 'D:/lyh/secrets/aivoice/deepseek.env';
const deepseekEnv = fs.existsSync(deepseekEnvPath) ? parseDotEnv(fs.readFileSync(deepseekEnvPath)) : {};
const localEnv = { ...baseEnv, ...aliyunEnv, ...volcengineEnv, ...deepseekEnv };
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Rotated Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
const state = fs.existsSync(statePath) ? JSON.parse(await fsp.readFile(statePath, 'utf8')) : {};
if (!state.runtimeApiKey || !state.providerEncryptionKey) throw new Error('Rotated runtime state is incomplete');
if (!localEnv.DASHSCOPE_API_KEY || !localEnv.DASHSCOPE_API_HOST || !localEnv.DASHSCOPE_WORKSPACE_ID) {
  throw new Error('Rotated Bailian credentials are incomplete');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const stagingRoot = path.join(projectRoot, '.aivoice-tmp', 'cloudbase-worker-compact');
await fsp.rm(stagingRoot, { recursive: true, force: true });
await fsp.mkdir(stagingRoot, { recursive: true });
await fsp.copyFile(path.join(projectRoot, 'cloudfunctions/aivoice-worker/package.json'), path.join(stagingRoot, 'package.json'));
await run('npx', [
  '--no-install', 'esbuild', 'apps/worker/src/cloud-function.ts',
  '--bundle', '--platform=node', '--format=esm', '--target=node20',
  `--outfile=${path.join(stagingRoot, 'index.mjs')}`,
  '--external:@cloudbase/node-sdk',
]);
const zipPath = path.join(projectRoot, '.aivoice-tmp', 'aivoice-worker.zip');
await fsp.rm(zipPath, { force: true });
await run('tar', ['-a', '-c', '-f', zipPath, '-C', stagingRoot, 'index.mjs', 'package.json']);
const zipBytes = (await fsp.stat(zipPath)).size;
if (zipBytes > 1.5 * 1024 * 1024) throw new Error(`Worker zip is too large for direct upload: ${zipBytes}`);
const base64Code = await fsp.readFile(zipPath, 'base64');

const envVariables = {
  NODE_ENV: 'production',
  DATABASE_BACKEND: 'cloudbase',
  CLOUDBASE_ENV_ID: databaseEnvId,
  CLOUDBASE_API_KEY: state.runtimeApiKey,
  CLOUDBASE_APIKEY: state.runtimeApiKey,
  CLOUDBASE_STORAGE_MODE: 'native',
  CLOUDBASE_STORAGE_ENV_ID: functionEnvId,
  CLOUDBASE_NATIVE_STORAGE_SECRET_ID: secretId,
  CLOUDBASE_NATIVE_STORAGE_SECRET_KEY: secretKey,
  CLOUDBASE_SOURCE_BUCKET: 'aivoice-source',
  CLOUDBASE_AUDIO_BUCKET: 'aivoice-audio',
  CLOUDBASE_JOBS_BUCKET: 'aivoice-jobs',
  WORKER_TEMP_ROOT: '/tmp/aivoice',
  FFMPEG_PATH: '/tmp/aivoice-bin/ffmpeg',
  BUNDLED_FFMPEG_PATH: 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg',
  CLOUDBASE_FFMPEG_OBJECT_KEY: '',
  PROVIDER_ID_ENCRYPTION_KEY: state.providerEncryptionKey,
  DASHSCOPE_API_KEY: localEnv.DASHSCOPE_API_KEY,
  DASHSCOPE_API_HOST: localEnv.DASHSCOPE_API_HOST,
  DASHSCOPE_WORKSPACE_ID: localEnv.DASHSCOPE_WORKSPACE_ID,
  AIVOICE_CHAT_PROVIDER: localEnv.AIVOICE_CHAT_PROVIDER || 'dashscope',
  DEEPSEEK_API_KEY: localEnv.DEEPSEEK_API_KEY || '',
  DEEPSEEK_API_HOST: localEnv.DEEPSEEK_API_HOST || 'https://api.deepseek.com',
  DEEPSEEK_CHAT_MODEL: localEnv.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
  AIVOICE_VOICE_PROVIDER: localEnv.AIVOICE_VOICE_PROVIDER || 'aliyun-cosyvoice',
  AIVOICE_VOICE_STRATEGY: process.env.AIVOICE_VOICE_STRATEGY || localEnv.AIVOICE_VOICE_STRATEGY || 'single',
  AIVOICE_DUAL_VOICE_ENABLED: localEnv.AIVOICE_DUAL_VOICE_ENABLED || '',
  AIVOICE_SEED_AUDIO_BUDGET_WINDOW: process.env.AIVOICE_SEED_AUDIO_BUDGET_WINDOW || localEnv.AIVOICE_SEED_AUDIO_BUDGET_WINDOW || '50',
  AIVOICE_SEED_AUDIO_BUDGET_LIMIT: process.env.AIVOICE_SEED_AUDIO_BUDGET_LIMIT || localEnv.AIVOICE_SEED_AUDIO_BUDGET_LIMIT || '15',
  BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE: localEnv.BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE || '0.15',
  VOLCENGINE_SEED_AUDIO_API_KEY: localEnv.VOLCENGINE_SEED_AUDIO_API_KEY || localEnv.BYTEPLUS_SEED_AUDIO_API_KEY || '',
  VOLCENGINE_SEED_AUDIO_BASE_URL: localEnv.VOLCENGINE_SEED_AUDIO_BASE_URL || 'https://openspeech.bytedance.com',
  SEED_AUDIO_MODEL: localEnv.SEED_AUDIO_MODEL || 'seed-audio-1.0',
  SEED_AUDIO_TIMEOUT_MS: localEnv.SEED_AUDIO_TIMEOUT_MS || '120000',
  AIVOICE_SPEAKER_ANALYSIS_PROVIDER: localEnv.AIVOICE_SPEAKER_ANALYSIS_PROVIDER || 'aliyun',
  AIVOICE_TARGET_MODEL: localEnv.AIVOICE_TARGET_MODEL || 'cosyvoice-v3.5-plus',
  AIVOICE_STABLE_EMOTION_MODE: process.env.AIVOICE_STABLE_EMOTION_MODE || localEnv.AIVOICE_STABLE_EMOTION_MODE || 'SAFE_ONLY',
  AIVOICE_SPEAKER_DIARIZATION_ENABLED: localEnv.AIVOICE_SPEAKER_DIARIZATION_ENABLED || 'true',
  AIVOICE_DIARIZATION_MODEL: localEnv.AIVOICE_DIARIZATION_MODEL || 'fun-asr',
  CHAT_MODEL: localEnv.CHAT_MODEL || 'qwen3.8-max',
  AIVOICE_QWEN_EXPLICIT_PROMPT_CACHE: localEnv.AIVOICE_QWEN_EXPLICIT_PROMPT_CACHE || 'false',
  VOICE_PREVIEW_TEXT: localEnv.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。',
  GENERATION_POINT_COST: localEnv.GENERATION_POINT_COST || '1',
};

if (process.env.CLOUDBASE_DEPLOY_DRY_RUN === 'true') {
  console.log(JSON.stringify({
    success: true,
    dryRun: true,
    databaseEnvId,
    functionEnvId,
    functionName,
    zipBytes,
    timeoutSeconds: 900,
    memoryMb: 2048,
    ffmpegDelivery: 'cloud-installed-linux-x64',
  }, null, 2));
  process.exit(0);
}

const app = new CloudBase({ envId: functionEnvId, region: 'ap-shanghai', secretId, secretKey });
const common = {
  name: functionName,
  description: '那年的TA按任务启动声音处理Worker',
  type: 'Event',
  handler: 'index.main',
  runtime: 'Nodejs20.19',
  timeout: 900,
  memorySize: 2048,
  installDependency: true,
  envVariables,
  triggers: [{
    name: 'aivoice-worker-recovery',
    type: 'timer',
    config: '0 */1 * * * * *',
  }],
};
const result = await app.functions.createFunction({ func: common, base64Code, force: true });
state.workerFunctionName = functionName;
state.workerFunctionEnvId = functionEnvId;
state.workerFunctionTimeoutSeconds = 900;
state.workerFunctionMemoryMb = 2048;
state.workerFunctionAsync = true;
state.workerFfmpegDelivery = 'cloud-installed-linux-x64';
state.workerFunctionDeployedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  success: true,
  databaseEnvId,
  functionEnvId,
  functionName,
  requestId: result?.RequestId || '',
  statePath,
}, null, 2));
