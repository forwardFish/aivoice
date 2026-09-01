const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

interface PcmFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
}

interface WavChunk {
  id: string;
  payload: Buffer;
}

function parseChunks(wav: Buffer): { format: PcmFormat | null; chunks: WavChunk[] } | null {
  if (
    wav.length < RIFF_HEADER_BYTES
    || wav.toString('ascii', 0, 4) !== 'RIFF'
    || wav.toString('ascii', 8, 12) !== 'WAVE'
  ) return null;
  const chunks: WavChunk[] = [];
  let format: PcmFormat | null = null;
  for (let offset = RIFF_HEADER_BYTES; offset + CHUNK_HEADER_BYTES <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const payloadStart = offset + CHUNK_HEADER_BYTES;
    const payloadEnd = payloadStart + size;
    if (payloadEnd > wav.length) return null;
    const payload = wav.subarray(payloadStart, payloadEnd);
    chunks.push({ id, payload });
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: payload.readUInt16LE(0),
        channels: payload.readUInt16LE(2),
        sampleRate: payload.readUInt32LE(4),
        blockAlign: payload.readUInt16LE(12),
        bitsPerSample: payload.readUInt16LE(14),
      };
    }
    offset = payloadEnd + (size % 2);
  }
  return { format, chunks };
}

function chunkBuffer(chunk: WavChunk): Buffer {
  const padding = chunk.payload.length % 2;
  const buffer = Buffer.alloc(CHUNK_HEADER_BYTES + chunk.payload.length + padding);
  buffer.write(chunk.id, 0, 4, 'ascii');
  buffer.writeUInt32LE(chunk.payload.length, 4);
  chunk.payload.copy(buffer, CHUNK_HEADER_BYTES);
  return buffer;
}

function rebuildWav(header: Buffer, chunks: WavChunk[]): Buffer {
  const body = Buffer.concat(chunks.map(chunkBuffer));
  const result = Buffer.concat([header.subarray(0, RIFF_HEADER_BYTES), body]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

/** Downmixes PCM16 WAV to mono before the worker's storage contract check. */
export function downmixPcm16WavToMono(wav: Buffer): Buffer {
  const parsed = parseChunks(wav);
  const format = parsed?.format;
  if (!parsed || !format || format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels <= 1) {
    return wav;
  }
  const formatIndex = parsed.chunks.findIndex((chunk) => chunk.id === 'fmt ');
  const dataIndex = parsed.chunks.findIndex((chunk) => chunk.id === 'data');
  if (formatIndex < 0 || dataIndex < 0 || format.blockAlign !== format.channels * 2) return wav;

  const source = parsed.chunks[dataIndex]!.payload;
  const frames = Math.floor(source.length / format.blockAlign);
  const mono = Buffer.alloc(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      sum += source.readInt16LE(frame * format.blockAlign + channel * 2);
    }
    mono.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(sum / format.channels))), frame * 2);
  }
  const formatPayload = Buffer.from(parsed.chunks[formatIndex]!.payload);
  formatPayload.writeUInt16LE(1, 2);
  formatPayload.writeUInt32LE(format.sampleRate * 2, 8);
  formatPayload.writeUInt16LE(2, 12);
  parsed.chunks[formatIndex] = { id: 'fmt ', payload: formatPayload };
  parsed.chunks[dataIndex] = { id: 'data', payload: mono };
  return rebuildWav(wav, parsed.chunks);
}

/**
 * Removes only an excessive silent tail from 16-bit PCM WAV audio. Internal
 * pauses and the final 120 ms are preserved, so delivery timing is untouched.
 */
export function trimTrailingPcmSilence(
  wav: Buffer,
  options: { thresholdDb?: number; minimumTailMs?: number; keepTailMs?: number } = {},
): Buffer {
  const parsed = parseChunks(wav);
  const format = parsed?.format;
  if (
    !parsed
    || !format
    || format.audioFormat !== 1
    || format.bitsPerSample !== 16
    || format.channels < 1
    || format.sampleRate < 8_000
    || format.blockAlign !== format.channels * 2
  ) return wav;
  const dataIndex = parsed.chunks.findIndex((chunk) => chunk.id === 'data');
  if (dataIndex < 0) return wav;
  const data = parsed.chunks[dataIndex]!.payload;
  const totalFrames = Math.floor(data.length / format.blockAlign);
  if (!totalFrames) return wav;

  const thresholdDb = options.thresholdDb ?? -45;
  const threshold = Math.max(1, Math.round(32_767 * 10 ** (thresholdDb / 20)));
  let lastAudibleFrame = -1;
  for (let frame = totalFrames - 1; frame >= 0; frame -= 1) {
    const frameOffset = frame * format.blockAlign;
    for (let channel = 0; channel < format.channels; channel += 1) {
      if (Math.abs(data.readInt16LE(frameOffset + channel * 2)) > threshold) {
        lastAudibleFrame = frame;
        break;
      }
    }
    if (lastAudibleFrame >= 0) break;
  }
  if (lastAudibleFrame < 0) return wav;

  const trailingFrames = totalFrames - lastAudibleFrame - 1;
  const minimumTailFrames = Math.round(format.sampleRate * (options.minimumTailMs ?? 500) / 1_000);
  if (trailingFrames < minimumTailFrames) return wav;
  const keepFrames = Math.round(format.sampleRate * (options.keepTailMs ?? 120) / 1_000);
  const retainedFrames = Math.min(totalFrames, lastAudibleFrame + 1 + keepFrames);
  parsed.chunks[dataIndex] = { id: 'data', payload: data.subarray(0, retainedFrames * format.blockAlign) };

  return rebuildWav(wav, parsed.chunks);
}
