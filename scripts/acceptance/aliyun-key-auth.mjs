import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotEnv } from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseEnvPath = process.env.AIVOICE_RUNTIME_ENV_FILE || 'D:/lyh/agent/agent-frame/aivoice/.env.local';
const aliyunEnvPath = process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env';
const baseEnv = fs.existsSync(baseEnvPath) ? parseDotEnv(fs.readFileSync(baseEnvPath)) : {};
const aliyunEnv = fs.existsSync(aliyunEnvPath) ? parseDotEnv(fs.readFileSync(aliyunEnvPath)) : {};
const apiKey = String(aliyunEnv.DASHSCOPE_API_KEY || '').trim();
const configuredHost = String(baseEnv.DASHSCOPE_API_HOST || '').trim().replace(/\/$/, '');
if (!/^sk-[A-Za-z0-9._-]{20,}$/.test(apiKey)) throw new Error('New Bailian API key is missing or malformed');
if (!configuredHost) throw new Error('DASHSCOPE_API_HOST is missing');

const candidates = [
  `${configuredHost}/api/v1/uploads`,
  'https://dashscope.aliyuncs.com/api/v1/uploads',
];
let passed = null;
const attempts = [];
for (const candidate of candidates) {
  const url = new URL(candidate);
  url.searchParams.set('action', 'getPolicy');
  url.searchParams.set('model', 'voice-enrollment');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  const data = body && typeof body === 'object' ? body.data : null;
  const valid = response.ok && data && data.upload_host && data.policy && data.signature;
  attempts.push({ host: url.host, status: response.status, valid: Boolean(valid) });
  if (valid) {
    passed = { host: url.host, status: response.status };
    break;
  }
  if ([401, 403].includes(response.status)) break;
}

const result = {
  checkedAt: new Date().toISOString(),
  status: passed ? 'PASS' : 'FAIL',
  keyConfigured: true,
  keyPrefixValid: true,
  voiceEnrollmentUploadPolicyAuthorized: Boolean(passed),
  endpointHost: passed?.host || null,
  attempts,
  modelInferencePerformed: false,
};
const evidencePath = path.join(projectRoot, 'docs/auto-execute/results/aliyun-rotated-key-auth.json');
await fsp.writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!passed) process.exitCode = 1;
