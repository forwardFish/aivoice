import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observedPersonEvidenceFromQualityReport,
  observedPersonEvidencePrompt,
  observedSpeechPlanBaseline,
  persistedPersonCorrectionsFromQualityReport,
  speechPlanBaselineWithCorrections,
  voiceObservedDeliveryBaselineWithCorrections,
} from '../src/observed-person-evidence.js';

test('quality report becomes bounded observable person evidence without personality inference', () => {
  const evidence = observedPersonEvidenceFromQualityReport({
    durationSeconds: 12,
    silentRatio: 0.2,
    averageDbfs: -16,
    acousticEvidence: {
      pitchMedianHz: 238,
      pitchRangeSemitones: 7.2,
      volumeDynamicRangeDb: 16,
      voicedWindowRatio: 0.8,
      sentenceFinalPitchDeltaSemitones: -1.4,
      sentenceFinalEnergyDeltaDb: -3.2,
      sentenceFinalPitchSampleCount: 4,
      sentenceFinalEnergySampleCount: 4,
    },
    speakerDiarization: {
      speechMs: 10_000,
      speechEvidence: {
        transcript: '你先等一下，我马上就过来。',
        charactersPerSecond: 5.8,
        medianSentenceCharacters: 12,
        pauseCount: 1,
        averagePauseMs: 180,
        affectCues: ['担心'],
        recurringPhrases: ['其实', '有点'],
      },
    },
  });
  assert.ok(evidence);
  assert.equal(evidence?.speechRate, 'FAST');
  assert.equal(evidence?.pauseStyle, 'LOW');
  assert.equal(evidence?.volumeStyle, 'STRONG');
  assert.equal(evidence?.pitchStyle, 'WIDE');
  assert.equal(evidence?.volumeDynamicsStyle, 'DYNAMIC');
  assert.equal(evidence?.sentenceEndingStyle, 'FALLING');
  assert.equal(evidence?.sentenceEndingEnergyStyle, 'SOFTER');
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /音高起伏较大；句尾常下收；句尾力度常收弱；音量起伏明显/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /当时情绪线索：担心/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /有效语音占比：80%/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /重复出现的用词：其实、有点/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /不得自动认定为长期口头禅/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /不得迁移成新对话的默认情绪/);
  assert.match(observedPersonEvidencePrompt(evidence).join('\n'), /不得根据这段短视频自动推断嘴硬心软/);
  assert.deepEqual(observedSpeechPlanBaseline(evidence), {
    rateFactor: 1.06,
    pauseFactor: 0.82,
    volumeOffset: 2,
    instructionFragment: '原口音咬字；快语、少停顿、自然起伏、降尾、保留自然强弱',
  });
  assert.deepEqual(voiceObservedDeliveryBaselineWithCorrections(evidence, {}), {
    speechRate: 'FAST',
    pauseStyle: 'LOW',
    pitchStyle: 'WIDE',
    sentenceEndingStyle: 'FALLING',
    volumeDynamicsStyle: 'DYNAMIC',
  });
});

test('legacy quality reports keep missing acoustic dimensions unknown instead of inventing a flat voice', () => {
  const evidence = observedPersonEvidenceFromQualityReport({
    durationSeconds: 10,
    speakerDiarization: {
      speechEvidence: { transcript: '我马上回来。', charactersPerSecond: 4, medianSentenceCharacters: 6, pauseCount: 1, averagePauseMs: 300 },
    },
  });
  assert.equal(evidence?.pitchStyle, 'UNKNOWN');
  assert.equal(evidence?.volumeDynamicsStyle, 'UNKNOWN');
  assert.equal(evidence?.sentenceEndingStyle, 'UNKNOWN');
  assert.equal(evidence?.sentenceEndingEnergyStyle, 'UNKNOWN');
  assert.equal(observedSpeechPlanBaseline(evidence)?.instructionFragment, '原口音咬字；中速、中停顿');
});

test('missing transcript does not create synthetic evidence', () => {
  assert.equal(observedPersonEvidenceFromQualityReport({ speakerDiarization: { speechEvidence: {} } }), null);
});

test('persisted person corrections are deduplicated and bounded to the newest four', () => {
  const corrections = persistedPersonCorrectionsFromQualityReport({
    passiveCorrections: [
      { instruction: '旧校准一' },
      { instruction: '旧校准二' },
      { instruction: 'TA说话更短' },
      { instruction: 'TA说话更直接' },
      { instruction: 'TA说话更短' },
      { instruction: 'TA生气时声音更低' },
      { instruction: 'TA很少讲大道理' },
    ],
  });
  assert.deepEqual(corrections, ['TA说话更直接', 'TA说话更短', 'TA生气时声音更低', 'TA很少讲大道理']);
});

test('latest explicit tone correction adjusts the TTS baseline without another model call', () => {
  const evidence = observedPersonEvidenceFromQualityReport({
    durationSeconds: 12,
    averageDbfs: -20,
    acousticEvidence: { pitchMedianHz: 230, pitchRangeSemitones: 8, volumeDynamicRangeDb: 15 },
    speakerDiarization: {
      speechEvidence: { transcript: '我马上回来。', charactersPerSecond: 4, medianSentenceCharacters: 6, pauseCount: 2, averagePauseMs: 300 },
    },
  });
  const baseline = speechPlanBaselineWithCorrections(evidence, {
    passiveCorrections: [
      { reason: 'TONE_NOT_LIKE', instruction: '用户明确纠正TA的语气：她生气时声音反而会更低' },
    ],
  });
  assert.equal(baseline?.volumeOffset, -2);
  assert.match(baseline?.instructionFragment || '', /原口音咬字/);
  assert.match(baseline?.instructionFragment || '', /校准：情绪时音量更低/);
  assert.match(baseline?.instructionFragment || '', /中速、中停顿、自然起伏/);
  assert.equal(voiceObservedDeliveryBaselineWithCorrections(evidence, {
    passiveCorrections: [
      { reason: 'TONE_NOT_LIKE', instruction: '用户明确纠正TA的语气：她生气时声音反而会更低' },
    ],
  })?.correction, 'VOLUME_SOFTER');
});
