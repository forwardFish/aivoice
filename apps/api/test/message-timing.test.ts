import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('message API records create, lookup and worker dispatch latency without message text', () => {
  const source = fs.readFileSync(new URL('../src/messages/message.service.ts', import.meta.url), 'utf8');

  assert.match(source, /message_dispatch_timing/);
  assert.match(source, /createMessageMs[\s\S]*lookupJobMs[\s\S]*dispatchWorkerMs[\s\S]*totalMs/);
  assert.match(source, /slowestStage[\s\S]*slowestStageMs[\s\S]*overThreeSecondTarget/);
  assert.match(source, /messageId:\s*result\.messageId[\s\S]*jobId:\s*jobId/);
  assert.doesNotMatch(source, /message_dispatch_timing[\s\S]{0,500}inputText/);
});

test('CloudBase worker can publish safe assistant text without completing or charging the message', () => {
  const migration = fs.readFileSync(new URL('../cloudbase/0011_publish_message_text.sql', import.meta.url), 'utf8');

  assert.match(migration, /CREATE OR REPLACE FUNCTION rpc_message_publish_text/);
  assert.match(migration, /type='GENERATE_MESSAGE' AND status='PROCESSING'/);
  assert.match(migration, /lease_owner=p_worker_id AND leased_until>now\(\)/);
  assert.match(migration, /UPDATE messages[\s\S]*SET output_text=v_text,updated_at=now\(\)/);
  assert.doesNotMatch(migration, /ready_at|point_accounts|point_ledgers|balance/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION rpc_message_publish_text[\s\S]*TO worker_rpc_role/);
});

test('terminal audio failure preserves published text and never debits points', () => {
  const migration = fs.readFileSync(new URL('../cloudbase/0007_cloudbase_runtime_rpc.sql', import.meta.url), 'utf8');
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION rpc_message_complete_failure');
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION rpc_message_complete_blocked', start);
  const failureFunction = migration.slice(start, end);

  assert.match(failureFunction, /UPDATE messages SET status='FAILED'/);
  assert.doesNotMatch(failureFunction, /output_text\s*=/);
  assert.doesNotMatch(failureFunction, /point_accounts|point_ledgers|balance/);
});

test('job retry diagnostics survive a later successful attempt', () => {
  const migration = fs.readFileSync(new URL('../cloudbase/0012_job_retry_diagnostics.sql', import.meta.url), 'utf8');

  assert.match(migration, /payload=jsonb_set[\s\S]*retryDiagnostics[\s\S]*jsonb_build_array\(v_diagnostic\)/);
  assert.match(migration, /'attempt',v_job\.attempts[\s\S]*'errorCode'[\s\S]*'errorMessage'[\s\S]*'recordedAt'/);
  assert.doesNotMatch(migration, /point_accounts|point_ledgers|balance/);
});
