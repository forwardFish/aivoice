import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import type { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';
import { buildSelectionScopedSourceSpeakerCheck, CloudBaseJobRunner } from '../src/cloudbase-job-runner.js';
import { observedPersonEvidenceFromQualityReport } from '../src/observed-person-evidence.js';
import type { SpeakerDiarizationReport } from '../src/providers/aliyun-speaker-diarization.js';

const execFileAsync = promisify(execFile);

async function videoFixture(): Promise<{ root: string; bytes: Buffer }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-source-check-'));
  const target = path.join(root, 'source.mp4');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x120:r=15:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000:duration=1',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', target,
  ], { timeout: 30_000 });
  return { root, bytes: await fs.readFile(target) };
}

const fakeVoiceProvider = {
  providerName: 'fake',
  targetModel: 'fake',
  async enroll() { return 'unused'; },
  async synthesize() { return Buffer.alloc(0); },
  async deleteVoice() { return undefined; },
};

async function runSourceCheck(report: SpeakerDiarizationReport) {
  const fixture = await videoFixture();
  const jobId = '11111111-1111-4111-8111-111111111111';
  const voiceId = '22222222-2222-4222-8222-222222222222';
  const mediaId = '33333333-3333-4333-8333-333333333333';
  const sourceKey = 'source/user/voice/source.mp4';
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deleted: Array<{ bucket: string; key: string }> = [];
  const runtime = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'rpc_job_acquire') {
        return {
          id: jobId,
          userId: 'user-id',
          voiceProfileId: voiceId,
          messageId: null,
          type: 'PROCESS_VOICE',
          attempts: 1,
          maxAttempts: 3,
          payload: { phase: 'SOURCE_SPEAKER_CHECK', sourceMediaId: mediaId },
        };
      }
      if (name === 'rpc_job_get_voice_input') {
        return {
          jobId,
          userId: 'user-id',
          voiceId,
          clipStartMs: null,
          clipEndMs: null,
          sourceMediaId: mediaId,
          sourceObjectKey: sourceKey,
          sourceMimeType: 'video/mp4',
          ageYears: null,
          gender: null,
          userAgeYears: null,
          relationshipType: null,
          existingProviderVoiceIdEncrypted: null,
          existingProviderStatus: null,
        };
      }
      return { status: name.endsWith('rejected') ? 'FAILED' : 'DRAFT' };
    },
    signDownload: async (_bucket: string, key: string) => key === sourceKey
      ? 'https://source-check.test/source.mp4'
      : 'https://source-check.test/check.wav',
    uploadFile: async (_bucket: string, key: string) => key,
    deleteObject: async (bucket: string, key: string) => { deleted.push({ bucket, key }); },
  } as unknown as CloudBaseRuntimeClient;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input) === 'https://source-check.test/source.mp4') return new Response(fixture.bytes, { status: 200 });
    throw new Error(`unexpected fetch ${String(input)}`);
  }) as typeof fetch;
  try {
    const runner = new CloudBaseJobRunner({
      runtime,
      voiceProvider: fakeVoiceProvider,
      registeredVoiceProvider: fakeVoiceProvider,
      chatProvider: { async reply() { return 'unused'; } },
      speakerDetector: { providerName: 'fake-speaker', async inspect() { return report; } },
      temporaryRoot: path.join(fixture.root, 'worker'),
    });
    const result = await runner.runJob(jobId);
    return { result, calls, deleted, sourceKey };
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

test('source speaker precheck keeps a single-speaker source and marks the check passed', async () => {
  const outcome = await runSourceCheck({
    version: 'observed-evidence/2', model: 'fake', asrTaskId: 'asr-task-1', speakerCount: 1, segmentCount: 1, speechMs: 900,
    overlapMs: 0, overlapRatio: 0, acceptable: true,
    segments: [{ speakerId: '0', beginMs: 0, endMs: 900, text: '你好' }],
    speechEvidence: {
      version: 'speech-evidence/2', countDefinition: 'HAN_CODEPOINTS', transcriptExcerpt: '你好', transcriptTruncated: false,
      characterCount: 2, lexicalCodePointCount: 2, speechSpanMs: 900, charactersPerSecond: 2.222,
      sentenceCharacterCounts: [2], clauseCharacterCounts: [2],
      pauses: { method: 'ASR_GAP_V1', durationsMs: [], coverage: 0, boundaryAlignedCount: 0, longGapCount: 0, analyzedSpanMs: 900 },
      recurringParticles: [],
    },
  });
  assert.equal(outcome.result.status, 'SUCCEEDED');
  assert.ok(outcome.calls.some((call) => call.name === 'rpc_voice_source_speaker_check_passed'));
  const persisted = outcome.calls.find((call) => call.name === 'rpc_voice_source_speaker_check_passed')?.args.pReport as Record<string, any>;
  assert.equal(persisted.version, 'observed-evidence/2');
  assert.equal(persisted.speechEvidence.version, 'speech-evidence/2');
  assert.equal(persisted.scope.assetId, '33333333-3333-4333-8333-333333333333');
  assert.equal(persisted.scope.originalTimeline, true);
  assert.ok(!outcome.deleted.some((item) => item.key === outcome.sourceKey));
  assert.ok(outcome.deleted.some((item) => item.key.includes('quality/source-check/')));
});

test('source speaker precheck deletes a multi-speaker source and marks the check rejected', async () => {
  const outcome = await runSourceCheck({
    version: 'observed-evidence/2', model: 'fake', asrTaskId: 'asr-task-2', speakerCount: 2, segmentCount: 2, speechMs: 900,
    overlapMs: 0, overlapRatio: 0, acceptable: false, failureCode: 'MULTIPLE_SPEAKERS',
    segments: [
      { speakerId: '0', beginMs: 0, endMs: 400, text: '你好' },
      { speakerId: '1', beginMs: 500, endMs: 1000, text: '好的' },
    ],
  });
  assert.equal(outcome.result.status, 'FAILED');
  assert.ok(outcome.calls.some((call) => call.name === 'rpc_voice_source_speaker_check_rejected'));
  assert.ok(outcome.deleted.some((item) => item.key === outcome.sourceKey));
  assert.ok(outcome.deleted.some((item) => item.key.includes('quality/source-check/')));
});

test('formal processing crops retained ASR sentences to the selected clip without another ASR call', () => {
  const selected = buildSelectionScopedSourceSpeakerCheck({
    version: 'observed-evidence/2', passed: true, acceptable: true,
    provider: 'aliyun', model: 'fun-asr', asrTaskId: 'existing-task', speakerCount: 1,
    segments: [
      { speakerId: '0', beginMs: 0, endMs: 3_000, text: '边界外面的第一句话内容。' },
      { speakerId: '0', beginMs: 3_100, endMs: 7_000, text: '这是完整保留的一句话啊。' },
      { speakerId: '0', beginMs: 7_100, endMs: 11_000, text: '这个事情还是慢慢处理呀。' },
      { speakerId: '0', beginMs: 11_100, endMs: 15_000, text: '你先不用着急等我一下。' },
      { speakerId: '0', beginMs: 15_100, endMs: 19_000, text: '有结果以后我马上告诉你。' },
      { speakerId: '0', beginMs: 19_100, endMs: 23_000, text: '边界外面的最后一句内容。' },
    ],
  }, {
    voiceId: 'voice-1', sourceMediaId: 'asset-1', clipStartMs: 2_000, clipEndMs: 22_000,
    sourceSpeakerCheckPassed: true,
  });
  assert.equal(selected.version, 'observed-evidence/2');
  assert.equal(selected.boundaryCrossed, true);
  assert.equal((selected.segments as unknown[]).length, 4);
  assert.equal((selected.speechEvidence as Record<string, unknown>).version, 'speech-evidence/2');
  const fingerprint = observedPersonEvidenceFromQualityReport({ sourceSpeakerCheck: selected });
  assert.ok(fingerprint);
  assert.equal(fingerprint?.source.selectionStartMs, 2_000);
  assert.equal(fingerprint?.source.selectionEndMs, 22_000);
});
