import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { embedAigcChunk, embedAigcMetadata, readAigcChunks } from '../src/media/aigc.js';
import { probeWav } from '../src/media/ffmpeg.js';

const execFileAsync = promisify(execFile);

function silentPcmWav(durationMs = 100): Buffer {
  const sampleRate = 24_000;
  const sampleCount = Math.round(sampleRate * durationMs / 1000);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

test('embeds the required AIGC JSON in a padded RIFF chunk and is idempotent', () => {
  const messageId = 'message-123';
  const once = embedAigcChunk(silentPcmWav(), messageId);
  const twice = embedAigcChunk(once, messageId);

  assert.equal(once.readUInt32LE(4), once.length - 8);
  assert.equal(twice.readUInt32LE(4), twice.length - 8);
  assert.equal(twice.length % 2, 0);
  assert.deepEqual(readAigcChunks(twice), [{
    AIGC: {
      Label: '1',
      ContentProducer: '那年的TA',
      ProduceID: messageId,
      ReservedCode1: '',
      ContentPropagator: '那年的TA',
      PropagateID: messageId,
      ReservedCode2: '',
    },
  }]);
  assert.equal(readAigcChunks(twice).length, 1);
});

test('tagged WAV remains probeable with unchanged duration', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aivoice-aigc-'));
  const filePath = path.join(directory, 'tagged.wav');
  try {
    await fs.writeFile(filePath, silentPcmWav(250));
    const before = await probeWav(filePath);
    await embedAigcMetadata(filePath, 'message-probe');
    const after = await probeWav(filePath);
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostdin', '-loglevel', 'error', '-i', filePath, '-f', 'null', '-',
    ], { timeout: 20_000 });
    assert.equal(after.durationMs, before.durationMs);
    assert.ok(after.bytes > before.bytes);
    assert.equal(readAigcChunks(await fs.readFile(filePath)).length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('normalizes Aliyun-style streaming RIFF length placeholders before tagging', () => {
  const streaming = silentPcmWav(100);
  streaming.writeUInt32LE(0x7fffffbf, 4);
  streaming.writeUInt32LE(0x7fffff9b, 40);

  const tagged = embedAigcChunk(streaming, 'message-streaming');

  assert.equal(tagged.readUInt32LE(4), tagged.length - 8);
  assert.equal(tagged.readUInt32LE(40), streaming.length - 44);
  assert.equal(readAigcChunks(tagged)[0]?.AIGC.ProduceID, 'message-streaming');
});

test('rejects malformed/non-WAV input instead of producing a mislabeled file', () => {
  assert.throws(() => embedAigcChunk(Buffer.from('not a wav'), 'message-invalid'), /RIFF\/WAVE/);
});
