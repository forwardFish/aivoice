import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { recoverExpiredLeases } from '../src/lease-recovery.js';

test('lease recovery requeues retryable work and fails exhausted work', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql.replace(/\s+/gu, ' ').trim());
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;

  await recoverExpiredLeases(client);

  assert.equal(statements.length, 4);
  assert.match(statements[0], /attempts >= max_attempts/u);
  assert.match(statements[1], /UPDATE voice_profiles/u);
  assert.match(statements[2], /UPDATE messages/u);
  assert.match(statements[3], /status='QUEUED'/u);
  assert.match(statements[3], /attempts < max_attempts/u);
});

test('job failure retry casts status parameters to the PostgreSQL enum', () => {
  const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(workerRoot, 'src/job-runner.ts'), 'utf8');
  assert.match(source, /status = \$1::job_status/u);
  assert.match(source, /\$1::job_status = 'QUEUED'::job_status/u);
});
