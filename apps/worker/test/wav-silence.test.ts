import assert from 'node:assert/strict';
import test from 'node:test';
import { downmixPcm16WavToMono, trimTrailingPcmSilence } from '../src/media/wav-silence.js';

function wav(samples: number[], sampleRate = 24_000): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const output = Buffer.alloc(44 + data.length);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(data.length, 40);
  data.copy(output, 44);
  return output;
}

function stereoWav(left: number[], right: number[], sampleRate = 24_000): Buffer {
  const interleaved = left.flatMap((sample, index) => [sample, right[index] || 0]);
  const output = wav(interleaved, sampleRate);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(sampleRate * 4, 28);
  output.writeUInt16LE(4, 32);
  return output;
}

test('trims only a long silent tail and preserves a natural ending', () => {
  const speech = Array.from({ length: 24_000 }, (_, index) => index % 2 ? 2_000 : -2_000);
  const source = wav([...speech, ...new Array(24_000).fill(0)]);
  const trimmed = trimTrailingPcmSilence(source);
  assert.equal(trimmed.length, 44 + (24_000 + 2_880) * 2);
  assert.equal(trimmed.readUInt32LE(4), trimmed.length - 8);
  assert.equal(trimmed.readUInt32LE(40), trimmed.length - 44);
});

test('does not trim a normal short tail, internal pause, unsupported or all-silent audio', () => {
  const speech = new Array(12_000).fill(2_000);
  const shortTail = wav([...speech, ...new Array(4_800).fill(0)]);
  assert.strictEqual(trimTrailingPcmSilence(shortTail), shortTail);

  const internalPause = wav([...speech, ...new Array(16_000).fill(0), ...speech]);
  assert.strictEqual(trimTrailingPcmSilence(internalPause), internalPause);

  const invalid = Buffer.from('not-wav');
  assert.strictEqual(trimTrailingPcmSilence(invalid), invalid);
  const silent = wav(new Array(24_000).fill(0));
  assert.strictEqual(trimTrailingPcmSilence(silent), silent);
});

test('downmixes Seed stereo PCM to the worker mono WAV contract', () => {
  const source = stereoWav([2_000, -2_000, 10_000], [2_000, 2_000, -10_000]);
  const mono = downmixPcm16WavToMono(source);
  assert.equal(mono.readUInt16LE(22), 1);
  assert.equal(mono.readUInt32LE(28), 48_000);
  assert.equal(mono.readUInt16LE(32), 2);
  assert.equal(mono.readUInt32LE(40), 6);
  assert.deepEqual([mono.readInt16LE(44), mono.readInt16LE(46), mono.readInt16LE(48)], [2_000, 0, 0]);
});
