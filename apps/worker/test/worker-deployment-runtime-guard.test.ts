import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const deployScripts = [
  '../../../scripts/deploy/cloudbase-worker-function.mjs',
  '../../../scripts/deploy/cloudbase-worker-compact.mjs',
];

test('worker deployment fails closed on missing Bailian runtime config and probes the deployed function', () => {
  for (const relative of deployScripts) {
    const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /requiredWorkerEnvKeys = \['DASHSCOPE_API_KEY', 'DASHSCOPE_API_HOST', 'DASHSCOPE_WORKSPACE_ID'\]/);
    assert.match(source, /missingLocalWorkerEnv\.length/);
    assert.match(source, /Set AIVOICE_RUNTIME_ENV_FILE to the approved runtime env file/);
    assert.match(source, /getFunctionDetail\(functionName\)/);
    assert.match(source, /missingDeployedWorkerEnv\.length/);
    assert.match(source, /invokeFunction\(functionName, \{/);
    assert.match(source, /type: 'DEPLOYMENT_STARTUP_PROBE'/);
    assert.match(source, /startupProbeResult\.status !== 'SKIPPED'/);
    assert.match(source, /runtimeEnvVerified: true/);
  }
});
