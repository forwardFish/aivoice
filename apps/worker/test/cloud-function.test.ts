import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';
import { handleWorkerEvent, jobIdFromEvent } from '../src/cloud-function.js';
import { CloudBaseJobRunner } from '../src/cloudbase-job-runner.js';

const jobId = '11111111-2222-4333-8444-555555555555';

test('worker event accepts a direct jobId', () => {
  assert.equal(jobIdFromEvent({ jobId }), jobId);
});

test('worker event extracts jobId from a COS object-created event', () => {
  assert.equal(jobIdFromEvent({
    Records: [{ cos: { cosObject: { key: `aivoice-jobs%2Fjob-events%2F${jobId}.json` } } }],
  }), jobId);
});

test('duplicate worker event is skipped when the job lease cannot be acquired', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const runtime = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return null;
    },
  } as unknown as CloudBaseRuntimeClient;
  const runner = new CloudBaseJobRunner({
    runtime,
    voiceProvider: {
      targetModel: 'test',
      async enroll() { throw new Error('not called'); },
      async synthesize() { throw new Error('not called'); },
      async deleteVoice() { throw new Error('not called'); },
    },
    chatProvider: { async reply() { throw new Error('not called'); } },
  });
  assert.deepEqual(await runner.runJob(jobId), { jobId, status: 'SKIPPED' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, 'rpc_job_acquire');
  assert.equal(calls[0]?.args.pJobId, jobId);
  assert.equal(typeof calls[0]?.args.pWorkerId, 'string');
});

test('timer event requeues stalled work and claims the next durable job', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const runtime = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return name === 'rpc_job_requeue_stalled' ? { requeued: 0 } : null;
    },
  } as unknown as CloudBaseRuntimeClient;
  const result = await handleWorkerEvent({}, {
    runtime,
    voiceProvider: {
      targetModel: 'test',
      async enroll() { throw new Error('not called'); },
      async synthesize() { throw new Error('not called'); },
      async deleteVoice() { throw new Error('not called'); },
    },
    chatProvider: { async reply() { throw new Error('not called'); } },
  });
  assert.deepEqual(result, { jobId: '', status: 'SKIPPED' });
  assert.deepEqual(calls.map((item) => item.name), ['rpc_job_requeue_stalled', 'rpc_job_acquire']);
  assert.equal(calls[1]?.args.pJobId, null);
});
