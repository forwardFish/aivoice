import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSpeakerDiarization } from '../src/providers/aliyun-speaker-diarization.js';

test('speaker diarization accepts one speaker', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{
      sentences: [
        { begin_time: 100, end_time: 4_100, speaker_id: 0, text: 'first' },
        { begin_time: 4_200, end_time: 10_200, speaker_id: 0, text: 'second' },
      ],
    }],
  });
  assert.equal(report.acceptable, true);
  assert.equal(report.speakerCount, 1);
  assert.equal(report.failureCode, undefined);
  assert.equal(report.segments[0]?.text, 'first');
  assert.equal(report.speechEvidence?.transcript, 'first second');
  assert.equal(report.speechEvidence?.characterCount, 11);
  assert.equal(report.speechEvidence?.pauseCount, 0);
  assert.equal(report.speechEvidence?.charactersPerSecond, 1.1);
  assert.deepEqual(report.speechEvidence?.affectCues, []);
  assert.deepEqual(report.speechEvidence?.recurringPhrases, []);
});

test('speaker transcript keeps only explicit sample-time affect cues', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [{ begin_time: 0, end_time: 3_000, speaker_id: 0, text: '刚开始有点难过，后来其实也蛮开心的。' }] }],
  });
  assert.deepEqual(report.speechEvidence?.affectCues, ['开心', '难过']);
});

test('speaker transcript extracts repeated sample phrases without declaring a permanent habit', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [{ begin_time: 0, end_time: 3_000, speaker_id: 0, text: '其实我有点担心，其实我也说不清，就是有点担心。' }] }],
  });
  assert.ok(report.speechEvidence?.recurringPhrases.includes('其实'));
  assert.ok(report.speechEvidence?.recurringPhrases.includes('有点'));
});

test('speaker diarization rejects multiple speakers', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{
      sentences: [
        { begin_time: 0, end_time: 4_000, speaker_id: 0 },
        { begin_time: 4_100, end_time: 9_000, speaker_id: 1 },
      ],
    }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.speakerCount, 2);
  assert.equal(report.failureCode, 'MULTIPLE_SPEAKERS');
});

test('speaker diarization rejects overlapping speakers', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{
      sentences: [
        { begin_time: 0, end_time: 5_000, speaker_id: 'A' },
        { begin_time: 4_000, end_time: 8_000, speaker_id: 'B' },
      ],
    }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.failureCode, 'OVERLAPPING_SPEECH');
  assert.equal(report.overlapMs, 1_000);
});

test('speaker diarization fails closed when speaker labels are missing', () => {
  const report = evaluateSpeakerDiarization({
    transcripts: [{ sentences: [{ begin_time: 0, end_time: 8_000 }] }],
  });
  assert.equal(report.acceptable, false);
  assert.equal(report.failureCode, 'SPEAKER_UNCERTAIN');
});
