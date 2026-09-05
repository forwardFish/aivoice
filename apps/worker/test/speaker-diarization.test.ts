import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cropSpeakerSegments,
  evaluateSpeakerDiarization,
  storedSpeakerSegments,
  summarizeObservedSpeech,
} from '../src/providers/aliyun-speaker-diarization.js';

test('single speaker produces versioned auditable speech evidence before excerpt truncation', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{
      sentences: [
        { begin_time: 100, end_time: 4_100, speaker_id: 0, text: '你先等一下呀，我马上回来。' },
        { begin_time: 4_400, end_time: 10_200, speaker_id: 0, text: '这件事情别着急呀，我会处理。' },
      ],
    }],
  }, 'fun-asr', 'task-1');
  assert.equal(report.version, 'observed-evidence/2');
  assert.equal(report.asrTaskId, 'task-1');
  assert.equal(report.acceptable, true);
  assert.equal(report.speakerCount, 1);
  assert.equal(report.speechEvidence?.version, 'speech-evidence/2');
  assert.equal(report.speechEvidence?.countDefinition, 'HAN_CODEPOINTS');
  assert.equal(report.speechEvidence?.speechSpanMs, 10_100);
  assert.equal(report.speechEvidence?.pauses.method, 'ASR_GAP_V1');
  assert.deepEqual(report.speechEvidence?.pauses.durationsMs, [300]);
  assert.ok((report.speechEvidence?.sentenceCharacterCounts.length || 0) >= 2);
  assert.ok((report.speechEvidence?.clauseCharacterCounts.length || 0) >= 4);
  assert.deepEqual(report.speechEvidence?.recurringParticles, [{
    text: '呀',
    position: 'FINAL',
    count: 2,
    clauseIndices: [0, 2],
    opportunities: 4,
  }]);
  assert.equal('affectCues' in (report.speechEvidence || {}), false);
  assert.equal('recurringPhrases' in (report.speechEvidence || {}), false);
});

test('statistics use the full transcript even when the private excerpt is truncated', () => {
  const longText = '这是完整统计内容。'.repeat(80);
  const evidence = summarizeObservedSpeech([
    { speakerId: '0', beginMs: 0, endMs: 20_000, text: longText },
  ], 0, 20_000);
  assert.ok(evidence);
  assert.equal(Array.from(evidence?.transcriptExcerpt || '').length, 300);
  assert.equal(evidence?.transcriptTruncated, true);
  assert.ok((evidence?.characterCount || 0) > 300);
});

test('stored segments accept known camel and snake aliases and crop only complete sentences', () => {
  const stored = storedSpeakerSegments({ segments: [
    { speaker_id: '0', begin_ms: 0, end_ms: 4_000, text: '第一句内容。' },
    { speakerId: '0', beginMs: 4_100, endMs: 8_000, text: '第二句内容。' },
    { speakerId: '0', beginMs: 8_100, endMs: 12_000, text: '第三句内容。' },
  ] });
  const cropped = cropSpeakerSegments(stored, 2_000, 10_000);
  assert.equal(cropped.boundaryCrossed, true);
  assert.deepEqual(cropped.segments.map((row) => row.text), ['第二句内容。']);
});

test('speaker diarization rejects multiple speakers', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [
      { begin_time: 0, end_time: 4_000, speaker_id: 0, text: '你好。' },
      { begin_time: 4_100, end_time: 9_000, speaker_id: 1, text: '好的。' },
    ] }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.speakerCount, 2);
  assert.equal(report.failureCode, 'MULTIPLE_SPEAKERS');
});

test('speaker diarization rejects overlapping speakers', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [
      { begin_time: 0, end_time: 5_000, speaker_id: 'A', text: '你好。' },
      { begin_time: 4_000, end_time: 8_000, speaker_id: 'B', text: '好的。' },
    ] }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.failureCode, 'OVERLAPPING_SPEECH');
  assert.equal(report.overlapMs, 1_000);
});

test('speaker diarization fails closed when speaker labels are missing', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [{ begin_time: 0, end_time: 8_000, text: '你好。' }] }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.failureCode, 'SPEAKER_UNCERTAIN');
});
