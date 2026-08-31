import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanupUnpersistedReference, inspectReferenceQuality, inspectSentenceFinalProsody } from '../src/media/quality.js';

function pcmWav(durationSeconds: number, amplitude: number, activeSeconds = durationSeconds, frequency = 220): Buffer {
  const sampleRate = 24_000;
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  const activeSamples = Math.round(activeSeconds * sampleRate);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = index < activeSamples
      ? Math.round(amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate))
      : 0;
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  return wav;
}

async function withWav(buffer: Buffer, action: (filePath: string) => Promise<void>): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-quality-'));
  const filePath = path.join(directory, 'reference.wav');
  try {
    await fs.writeFile(filePath, buffer);
    await action(filePath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('reference quality accepts clear continuous speech-like PCM', async () => {
  await withWav(pcmWav(12, 4_000), async (filePath) => {
    const report = await inspectReferenceQuality(filePath);
    assert.equal(report.acceptable, true);
    assert.equal(report.activeSeconds, 12);
    assert.deepEqual(report.warnings, []);
    assert.ok(report.averageDbfs > -35);
    assert.ok((report.acousticEvidence?.pitchMedianHz || 0) > 210);
    assert.ok((report.acousticEvidence?.pitchMedianHz || 0) < 230);
    assert.ok((report.acousticEvidence?.pitchRangeSemitones || 0) < 0.5);
    assert.ok((report.acousticEvidence?.volumeDynamicRangeDb ?? 99) < 0.5, JSON.stringify(report.acousticEvidence));
  });
});

test('sentence-final prosody measures a rising tail from the existing PCM reference', async () => {
  const wav = pcmWav(8, 4_000, 8, 220);
  const sampleRate = 24_000;
  const tailSamples = Math.round(sampleRate * 0.28);
  const totalSamples = Math.round(sampleRate * 8);
  for (let index = totalSamples - tailSamples; index < totalSamples; index += 1) {
    wav.writeInt16LE(Math.round(4_000 * Math.sin(2 * Math.PI * 275 * index / sampleRate)), 44 + index * 2);
  }
  await withWav(wav, async (filePath) => {
    const ending = await inspectSentenceFinalProsody(filePath, [{ beginMs: 0, endMs: 8_000 }]);
    assert.equal(ending.sentenceFinalPitchSampleCount, 1);
    assert.equal(ending.sentenceFinalEnergySampleCount, 1);
    assert.ok((ending.sentenceFinalPitchDeltaSemitones || 0) > 2, JSON.stringify(ending));
  });
});

test('reference quality enforces the 8-20 second cloning contract', async () => {
  for (const durationSeconds of [8, 20]) {
    await withWav(pcmWav(durationSeconds, 4_000), async (filePath) => {
      const report = await inspectReferenceQuality(filePath);
      assert.equal(report.acceptable, true);
      assert.equal(report.durationSeconds, durationSeconds);
    });
  }

  for (const durationSeconds of [7.8, 20.2]) {
    await withWav(pcmWav(durationSeconds, 4_000), async (filePath) => {
      const report = await inspectReferenceQuality(filePath);
      assert.equal(report.acceptable, false);
      assert.equal(report.failureCode, 'AUDIO_DECODE_FAILED');
    });
  }
});

test('reference quality reports low volume and insufficient active speech', async () => {
  await withWav(pcmWav(12, 300), async (filePath) => {
    const report = await inspectReferenceQuality(filePath);
    assert.equal(report.acceptable, false);
    assert.equal(report.failureCode, 'LOW_VOLUME');
  });
  await withWav(pcmWav(12, 4_000, 5), async (filePath) => {
    const report = await inspectReferenceQuality(filePath);
    assert.equal(report.acceptable, false);
    assert.equal(report.failureCode, 'NO_VALID_SPEECH');
    assert.equal(report.silentRatio, 0.58333);
  });
});

test('rejected unpersisted reference files are deleted while persisted references remain', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-reference-cleanup-'));
  const filePath = path.join(directory, 'reference.wav');
  try {
    await fs.writeFile(filePath, 'sensitive reference');
    await cleanupUnpersistedReference(filePath, false);
    await assert.rejects(fs.access(filePath), { code: 'ENOENT' });

    await fs.writeFile(filePath, 'persisted reference');
    await cleanupUnpersistedReference(filePath, true);
    await fs.access(filePath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
