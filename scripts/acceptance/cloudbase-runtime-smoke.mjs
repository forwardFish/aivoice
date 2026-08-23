import fs from 'node:fs';
import path from 'node:path';
import { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';

const statePath = process.env.AIVOICE_CLOUDBASE_STATE
  || 'D:/lyh/secrets/aivoice/cloudbase/deployment-state.json';
if (!fs.existsSync(statePath)) throw new Error(`CloudBase deployment state is missing: ${statePath}`);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const client = new CloudBaseRuntimeClient(state.envId, state.runtimeApiKey);
const evidence = {
  checkedAt: new Date().toISOString(),
  envId: state.envId,
  rest: { status: 'PENDING', request: 'users?select=id&limit=1' },
  storage: { status: 'PENDING', bucket: 'aivoice-jobs' },
};

const users = await client.select('users', { select: 'id', limit: 1 });
evidence.rest = { ...evidence.rest, status: 'PASS', rows: users.length };

const objectKey = `probes/runtime-smoke-${Date.now()}.json`;
try {
  await client.uploadJson('aivoice-jobs', objectKey, { smoke: true });
  const info = await client.objectInfo('aivoice-jobs', objectKey);
  evidence.storage = {
    ...evidence.storage,
    status: info.size > 0 && info.contentType === 'application/json' ? 'PASS' : 'FAIL',
    bytes: info.size,
    contentType: info.contentType,
  };
} finally {
  await client.deleteObject('aivoice-jobs', objectKey).catch(() => undefined);
}

const outputPath = process.env.AIVOICE_CLOUDBASE_SMOKE_OUTPUT
  || 'docs/auto-execute/results/cloudbase-runtime-smoke.json';
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ...evidence, outputPath }, null, 2));
if (evidence.rest.status !== 'PASS' || evidence.storage.status !== 'PASS') process.exitCode = 1;
