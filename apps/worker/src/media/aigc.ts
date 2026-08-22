import fs from 'node:fs/promises';

export interface AigcAudioMetadata {
  AIGC: {
    Label: '1';
    ContentProducer: '那时的TA';
    ProduceID: string;
    ReservedCode1: '';
    ContentPropagator: '那时的TA';
    PropagateID: string;
    ReservedCode2: '';
  };
}

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const AIGC_CHUNK_ID = 'AIGC';

export function createAigcAudioMetadata(messageId: string): AigcAudioMetadata {
  if (!messageId) throw new Error('messageId is required for AIGC audio metadata');
  return {
    AIGC: {
      Label: '1',
      ContentProducer: '那时的TA',
      ProduceID: messageId,
      ReservedCode1: '',
      ContentPropagator: '那时的TA',
      PropagateID: messageId,
      ReservedCode2: '',
    },
  };
}

function assertWave(buffer: Buffer): void {
  if (
    buffer.length < RIFF_HEADER_BYTES
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('AIGC metadata can only be embedded in RIFF/WAVE audio');
  }
}

interface ChunkRange {
  id: string;
  start: number;
  end: number;
  payloadStart: number;
  payloadEnd: number;
  declaredPayloadLength: number;
}

function chunkRanges(buffer: Buffer): ChunkRange[] {
  assertWave(buffer);
  const declaredRiffLength = buffer.readUInt32LE(4);
  const streamingPlaceholder = declaredRiffLength >= 0x7fff0000;
  const declaredEnd = declaredRiffLength + 8;
  if (!streamingPlaceholder && declaredEnd !== buffer.length) {
    throw new Error('RIFF size does not match WAV file length');
  }

  const ranges: ChunkRange[] = [];
  for (let offset = RIFF_HEADER_BYTES; offset < buffer.length;) {
    if (offset + CHUNK_HEADER_BYTES > buffer.length) throw new Error('WAV contains a truncated chunk header');
    const id = buffer.toString('ascii', offset, offset + 4);
    const declaredPayloadLength = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + CHUNK_HEADER_BYTES;
    let payloadEnd = payloadStart + declaredPayloadLength;
    let end = payloadEnd + (declaredPayloadLength % 2);
    if (payloadEnd > buffer.length || end > buffer.length) {
      const isFinalStreamingData = streamingPlaceholder
        && id === 'data'
        && declaredPayloadLength >= 0x7fff0000;
      if (!isFinalStreamingData) throw new Error(`WAV chunk ${id} exceeds file length`);
      payloadEnd = buffer.length;
      end = buffer.length;
    }
    ranges.push({ id, start: offset, end, payloadStart, payloadEnd, declaredPayloadLength });
    offset = end;
  }
  return ranges;
}

export function embedAigcChunk(wav: Buffer, messageId: string): Buffer {
  const ranges = chunkRanges(wav);
  const payload = Buffer.from(JSON.stringify(createAigcAudioMetadata(messageId)), 'utf8');
  const chunk = Buffer.alloc(CHUNK_HEADER_BYTES + payload.length + (payload.length % 2));
  chunk.write(AIGC_CHUNK_ID, 0, 4, 'ascii');
  chunk.writeUInt32LE(payload.length, 4);
  payload.copy(chunk, CHUNK_HEADER_BYTES);

  const retainedChunks = ranges
    .filter((range) => range.id !== AIGC_CHUNK_ID)
    .map((range) => {
      const retained = Buffer.from(wav.subarray(range.start, range.end));
      const actualPayloadLength = range.payloadEnd - range.payloadStart;
      if (range.declaredPayloadLength !== actualPayloadLength) {
        retained.writeUInt32LE(actualPayloadLength, 4);
      }
      return retained;
    });
  const result = Buffer.concat([wav.subarray(0, RIFF_HEADER_BYTES), ...retainedChunks, chunk]);
  if (result.length - 8 > 0xffffffff) throw new Error('WAV is too large for a RIFF container');
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

export function readAigcChunks(wav: Buffer): AigcAudioMetadata[] {
  return chunkRanges(wav)
    .filter((range) => range.id === AIGC_CHUNK_ID)
    .map((range) => {
      const text = wav.toString('utf8', range.payloadStart, range.payloadEnd);
      return JSON.parse(text) as AigcAudioMetadata;
    });
}

export async function embedAigcMetadata(filePath: string, messageId: string): Promise<void> {
  const original = await fs.readFile(filePath);
  const tagged = embedAigcChunk(original, messageId);
  await fs.writeFile(filePath, tagged);
}
