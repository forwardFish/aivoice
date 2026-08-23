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
  assert.equal('text' in (report.segments[0] || {}), false);
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
