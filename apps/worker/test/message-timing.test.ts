import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('production worker records every message generation stage with correlation ids', () => {
  const runner = fs.readFileSync(new URL('../src/cloudbase-job-runner.ts', import.meta.url), 'utf8');
  const quality = fs.readFileSync(new URL('../src/chat/generation-quality.ts', import.meta.url), 'utf8');
  const provider = fs.readFileSync(new URL('../src/providers/aliyun-cosyvoice.ts', import.meta.url), 'utf8');

  assert.match(runner, /message_generation_timing/);
  for (const stage of [
    'load_input',
    'chat_reply',
    'content_safety',
    'publish_text',
    'voice_synthesis_download',
    'write_audio',
    'embed_metadata',
    'inspect_audio',
    'upload_audio',
    'complete_message',
    'mark_job_succeeded',
  ]) {
    assert.match(runner, new RegExp(`['"]${stage}['"]`));
  }
  assert.match(runner, /failedStage:\s*activeStage/);
  assert.match(runner, /generationStage:\s*activeStage/);
  assert.match(runner, /MESSAGE_\$\{generationStage[\s\S]*_FAILED/);
  assert.match(quality, /hasForbiddenAssistantIdentityDisclosure\(outputText\)[\s\S]*IDENTITY_DISCLOSURE_BLOCKED/);
  assert.match(runner, /chat_reply_retry/);
  assert.match(runner, /maxAttempts:\s*1/);
  assert.match(runner, /slowestStage\(stages\)/);
  assert.match(runner, /overThreeSecondTarget/);
  assert.match(runner, /jobId:\s*job\.id[\s\S]*messageId:\s*job\.messageId/);
  assert.match(provider, /cosyvoice_synthesis_timing/);
  assert.match(provider, /requestMs[\s\S]*downloadMs[\s\S]*totalMs/);
  assert.match(provider, /provider_synthesis_request[\s\S]*provider_audio_download/);
  assert.doesNotMatch(runner, /inputText:\s*message\.inputText[\s\S]*message_generation_timing/);
});

test('worker deployment uses stable native-storage credentials instead of incomplete temporary signing state', () => {
  const deploy = fs.readFileSync(new URL('../../../scripts/deploy/cloudbase-worker-function.mjs', import.meta.url), 'utf8');
  assert.match(deploy, /CLOUDBASE_NATIVE_STORAGE_SECRET_ID:\s*secretId/);
  assert.match(deploy, /CLOUDBASE_NATIVE_STORAGE_SECRET_KEY:\s*secretKey/);
});
