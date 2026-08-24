import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';
import { CloudBaseRuntimeClient } from '../../packages/cloudbase-runtime/dist/index.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const statePath = process.env.CLOUDBASE_STATE_FILE || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
const inputPath = process.env.AIVOICE_AUTHORIZED_VIDEO
  || 'D:/lyh/agent/agent-frame/aivoice/.runtime/backend-e2e/authorized-12s.mp4';
if (!fs.existsSync(inputPath)) throw new Error(`Authorized risk-test video is missing: ${inputPath}`);
if (!fs.existsSync(statePath)) throw new Error('CloudBase deployment state is missing');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
if (!state.runtimeApiKey) throw new Error('CloudBase runtime API key is missing');
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env';
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Native storage credentials are missing');

const runtime = new CloudBaseRuntimeClient(envId, state.runtimeApiKey, {
  storageMode: 'native',
  secretId,
  secretKey,
});
const suffix = crypto.randomUUID();
const cloudPath = `risk-first/authorized/${suffix}.mp4`;
const tempRoot = path.join(projectRoot, '.aivoice-tmp', 'native-storage-risk');
const downloadPath = path.join(tempRoot, `${suffix}.mp4`);
const evidencePath = path.join(projectRoot, 'docs/auto-execute/results/pure-cloud-native-storage.json');
await fsp.mkdir(tempRoot, { recursive: true });
await fsp.mkdir(path.dirname(evidencePath), { recursive: true });

const sha256 = async (filePath) => crypto.createHash('sha256').update(await fsp.readFile(filePath)).digest('hex');
const startedAt = new Date().toISOString();
const started = Date.now();
let fileID = '';
const evidence = { status: 'FAIL', envId, cloudPath, startedAt, inputBytes: (await fsp.stat(inputPath)).size };
try {
  const uploadStarted = Date.now();
  fileID = await runtime.uploadFile('native', cloudPath, inputPath, 'video/mp4');
  evidence.uploadMs = Date.now() - uploadStarted;
  evidence.fileIdScheme = fileID.split(':')[0];

  const info = await runtime.objectInfo('native', fileID);
  evidence.info = { size: info.size, contentType: info.contentType, name: info.name };
  if (info.size !== evidence.inputBytes) throw new Error(`Native storage size mismatch: ${info.size} != ${evidence.inputBytes}`);

  const playbackStarted = Date.now();
  const tempUrl = await runtime.signDownload('native', fileID, 600);
  const response = await fetch(tempUrl, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30_000) });
  evidence.firstPlaybackAccessMs = Date.now() - playbackStarted;
  evidence.playbackHttpStatus = response.status;
  if (!response.ok && response.status !== 206) throw new Error(`Native playback URL failed: ${response.status}`);

  const downloadStarted = Date.now();
  await runtime.downloadFile('native', fileID, downloadPath);
  evidence.downloadMs = Date.now() - downloadStarted;
  evidence.hashMatches = await sha256(downloadPath) === await sha256(inputPath);
  if (!evidence.hashMatches) throw new Error('Native storage download hash mismatch');

  await runtime.deleteObject('native', fileID);
  let deleted = false;
  try {
    await runtime.objectInfo('native', fileID);
  } catch {
    deleted = true;
  }
  evidence.deleted = deleted;
  if (!deleted) throw new Error('Native storage test object still exists after delete');
  evidence.status = 'PASS';
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (fileID && evidence.status !== 'PASS') await runtime.deleteObject('native', fileID).catch(() => undefined);
  await fsp.rm(downloadPath, { force: true });
  evidence.totalMs = Date.now() - started;
  evidence.finishedAt = new Date().toISOString();
  await fsp.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
