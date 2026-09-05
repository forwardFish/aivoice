import { trustedAliyunUrl } from './aliyun-cosyvoice.js';
import type {
  SpeechEvidenceV2,
  SpeechParticleEvidenceV2,
} from '../speech-habit-fingerprint.js';

export type SpeakerDiarizationFailureCode =
  | 'MULTIPLE_SPEAKERS'
  | 'OVERLAPPING_SPEECH'
  | 'SPEAKER_UNCERTAIN';

export interface SpeakerDiarizationSegment {
  speakerId: string;
  beginMs: number;
  endMs: number;
  text: string;
}

export interface SpeakerDiarizationReport {
  version: 'observed-evidence/2';
  model: string;
  asrTaskId: string;
  speakerCount: number;
  segmentCount: number;
  speechMs: number;
  overlapMs: number;
  overlapRatio: number;
  acceptable: boolean;
  segments: SpeakerDiarizationSegment[];
  speechEvidence?: SpeechEvidenceV2;
  failureCode?: SpeakerDiarizationFailureCode;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function rounded(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function hanCount(value: string): number {
  return Array.from(value).filter((character) => /\p{Script=Han}/u.test(character)).length;
}

function lexicalCount(value: string): number {
  return Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
}

function clausesFromSegments(segments: readonly SpeakerDiarizationSegment[]): string[] {
  return segments.flatMap((segment) => segment.text
    .split(/[，,。！？!?；;：:]+/u)
    .map((clause) => clause.trim())
    .filter((clause) => hanCount(clause) >= 2));
}

function recurringParticlesFromClauses(clauses: readonly string[]): SpeechParticleEvidenceV2[] {
  const candidates = ['嗯', '哦', '啊', '呀', '呢', '吧'] as const;
  const evidence: SpeechParticleEvidenceV2[] = [];
  for (const particle of candidates) {
    for (const position of ['INITIAL', 'FINAL'] as const) {
      const clauseIndices = clauses.flatMap((clause, index) => {
        const compact = clause.replace(/[“”"'‘’（）()【】\[\]\s]/gu, '');
        if (!compact) return [];
        const matched = position === 'INITIAL'
          ? compact.startsWith(particle)
          : compact.endsWith(particle);
        return matched ? [index] : [];
      });
      if (new Set(clauseIndices).size < 2) continue;
      evidence.push({
        text: particle,
        position,
        count: clauseIndices.length,
        clauseIndices,
        opportunities: clauses.length,
      });
    }
  }
  return evidence.slice(0, 6);
}

export function summarizeObservedSpeech(
  segments: readonly SpeakerDiarizationSegment[],
  windowStartMs: number,
  windowEndMs: number,
): SpeechEvidenceV2 | undefined {
  const ordered = [...segments]
    .filter((segment) => segment.endMs > segment.beginMs && segment.text.trim())
    .sort((left, right) => left.beginMs - right.beginMs || left.endMs - right.endMs);
  if (!ordered.length || windowEndMs <= windowStartMs) return undefined;
  const fullTranscript = ordered.map((segment) => segment.text.trim()).filter(Boolean).join(' ');
  const characterCount = hanCount(fullTranscript);
  const lexicalCodePointCount = lexicalCount(fullTranscript);
  const speechSpanMs = Math.max(0, ordered[ordered.length - 1].endMs - ordered[0].beginMs);
  if (!characterCount || !speechSpanMs) return undefined;
  const sentenceCharacterCounts = ordered.map((segment) => hanCount(segment.text)).filter((count) => count >= 2);
  const clauses = clausesFromSegments(ordered);
  const clauseCharacterCounts = clauses.map(hanCount).filter((count) => count >= 2);
  const internalGaps = ordered.slice(1).map((segment, index) => Math.max(0, segment.beginMs - ordered[index].endMs));
  const pauses = internalGaps.filter((gap) => gap >= 200 && gap <= 2_000);
  const excerptCharacters = Array.from(fullTranscript);
  return {
    version: 'speech-evidence/2',
    countDefinition: 'HAN_CODEPOINTS',
    transcriptExcerpt: excerptCharacters.slice(0, 300).join(''),
    transcriptTruncated: excerptCharacters.length > 300,
    characterCount,
    lexicalCodePointCount,
    speechSpanMs,
    charactersPerSecond: rounded(characterCount / (speechSpanMs / 1000), 3),
    sentenceCharacterCounts,
    clauseCharacterCounts,
    pauses: {
      method: 'ASR_GAP_V1',
      durationsMs: pauses,
      coverage: ordered.length >= 2 ? 1 : 0,
      boundaryAlignedCount: pauses.length,
      longGapCount: internalGaps.filter((gap) => gap > 2_000).length,
      analyzedSpanMs: Math.max(0, windowEndMs - windowStartMs),
    },
    recurringParticles: recurringParticlesFromClauses(clauses),
  };
}

export function storedSpeakerSegments(value: unknown): SpeakerDiarizationSegment[] {
  const row = object(value);
  const rawSegments = Array.isArray(row.segments) ? row.segments : [];
  return rawSegments.flatMap((item): SpeakerDiarizationSegment[] => {
    const segment = object(item);
    const beginMs = Number(segment.beginMs ?? segment.begin_ms);
    const endMs = Number(segment.endMs ?? segment.end_ms);
    const speakerId = String(segment.speakerId ?? segment.speaker_id ?? '').trim();
    const segmentText = String(segment.text ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!Number.isFinite(beginMs) || !Number.isFinite(endMs) || endMs <= beginMs || !speakerId || !segmentText) return [];
    return [{ speakerId, beginMs, endMs, text: Array.from(segmentText).slice(0, 300).join('') }];
  }).sort((left, right) => left.beginMs - right.beginMs || left.endMs - right.endMs).slice(0, 100);
}

export function cropSpeakerSegments(
  segments: readonly SpeakerDiarizationSegment[],
  startMs: number,
  endMs: number,
): { segments: SpeakerDiarizationSegment[]; boundaryCrossed: boolean } {
  const overlapping = segments.filter((segment) => segment.endMs > startMs && segment.beginMs < endMs);
  const contained = overlapping.filter((segment) => segment.beginMs >= startMs && segment.endMs <= endMs);
  return { segments: contained, boundaryCrossed: contained.length !== overlapping.length };
}

export function evaluateSpeakerDiarization(
  input: unknown,
  model = 'fun-asr',
  asrTaskId = '',
): SpeakerDiarizationReport {
  const raw = object(input);
  const transcripts = Array.isArray(raw.transcripts) ? raw.transcripts : [];
  const sentences = transcripts.flatMap((transcript) => {
    const row = object(transcript);
    return Array.isArray(row.sentences) ? row.sentences : [];
  });
  let missingSpeakerId = false;
  const segments = sentences.flatMap((sentence): SpeakerDiarizationSegment[] => {
    const row = object(sentence);
    const beginMs = Number(row.begin_time ?? row.beginTime);
    const endMs = Number(row.end_time ?? row.endTime);
    const rawSpeaker = row.speaker_id ?? row.speakerId;
    if (rawSpeaker === undefined || rawSpeaker === null || rawSpeaker === '') missingSpeakerId = true;
    if (!Number.isFinite(beginMs) || !Number.isFinite(endMs) || endMs <= beginMs || rawSpeaker === undefined || rawSpeaker === null || rawSpeaker === '') {
      return [];
    }
    return [{
      speakerId: String(rawSpeaker),
      beginMs,
      endMs,
      text: String(row.text ?? row.transcript ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim(),
    }];
  }).sort((left, right) => left.beginMs - right.beginMs || left.endMs - right.endMs);

  const speakerIds = new Set(segments.map((segment) => segment.speakerId));
  const speechMs = segments.reduce((sum, segment) => sum + segment.endMs - segment.beginMs, 0);
  const windowStartMs = segments[0]?.beginMs ?? 0;
  const windowEndMs = segments[segments.length - 1]?.endMs ?? 0;
  const speechEvidence = summarizeObservedSpeech(segments, windowStartMs, windowEndMs);
  let overlapMs = 0;
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (previous.speakerId !== current.speakerId && current.beginMs < previous.endMs) {
      overlapMs += Math.max(0, Math.min(previous.endMs, current.endMs) - current.beginMs);
    }
  }

  let failureCode: SpeakerDiarizationFailureCode | undefined;
  if (!segments.length || missingSpeakerId || speakerIds.size === 0) failureCode = 'SPEAKER_UNCERTAIN';
  else if (speakerIds.size > 1 && overlapMs > 0) failureCode = 'OVERLAPPING_SPEECH';
  else if (speakerIds.size > 1) failureCode = 'MULTIPLE_SPEAKERS';

  return {
    version: 'observed-evidence/2',
    model,
    asrTaskId,
    speakerCount: speakerIds.size,
    segmentCount: segments.length,
    speechMs,
    overlapMs,
    overlapRatio: rounded(overlapMs / Math.max(1, speechMs), 5),
    acceptable: !failureCode,
    segments: segments.slice(0, 100),
    speechEvidence,
    failureCode,
  };
}

export class AliyunSpeakerDiarizationProvider {
  readonly providerName = 'aliyun';
  readonly model = process.env.AIVOICE_DIARIZATION_MODEL?.trim() || 'fun-asr';

  private config(): { apiKey: string; apiHost: string } {
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim() || '';
    const configuredHost = process.env.DASHSCOPE_API_HOST?.trim() || '';
    if (!apiKey || !configuredHost) throw new Error('DASHSCOPE_API_KEY and DASHSCOPE_API_HOST are required for speaker diarization');
    const apiHost = trustedAliyunUrl(configuredHost).toString().replace(/\/$/, '').replace(/\/api\/v1$/i, '');
    return { apiKey, apiHost };
  }

  private headers(apiKey: string, asynchronous = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (asynchronous) headers['X-DashScope-Async'] = 'enable';
    return headers;
  }

  async inspect(fileUrl: string): Promise<SpeakerDiarizationReport> {
    const source = new URL(fileUrl);
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('speaker diarization requires a trusted HTTPS audio URL');
    const { apiKey, apiHost } = this.config();
    const submit = await fetch(`${apiHost}/api/v1/services/audio/asr/transcription`, {
      method: 'POST',
      headers: this.headers(apiKey, true),
      body: JSON.stringify({
        model: this.model,
        input: { file_urls: [fileUrl] },
        parameters: {
          channel_id: [0],
          language_hints: ['zh'],
          diarization_enabled: true,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const submitted = object(await submit.json().catch(() => ({})));
    const taskId = String(object(submitted.output).task_id || '');
    if (!submit.ok || !taskId) throw new Error(`Aliyun speaker diarization submit failed: ${JSON.stringify(submitted).slice(0, 800)}`);

    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`${apiHost}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        headers: this.headers(apiKey),
        signal: AbortSignal.timeout(30_000),
      });
      const body = object(await response.json().catch(() => ({})));
      if (!response.ok) throw new Error(`Aliyun speaker diarization query failed: ${JSON.stringify(body).slice(0, 800)}`);
      const output = object(body.output);
      const status = String(output.task_status || '').toUpperCase();
      if (status === 'FAILED' || status === 'UNKNOWN') {
        throw new Error(`Aliyun speaker diarization failed: ${JSON.stringify(output).slice(0, 800)}`);
      }
      if (status !== 'SUCCEEDED') continue;
      const results = Array.isArray(output.results) ? output.results : [];
      const succeeded = results.find((item) => String(object(item).subtask_status || '').toUpperCase() === 'SUCCEEDED') || results[0];
      const transcriptionUrl = String(object(succeeded).transcription_url || '');
      if (!transcriptionUrl) throw new Error('Aliyun speaker diarization returned no transcription URL');
      const transcriptionResponse = await fetch(trustedAliyunUrl(transcriptionUrl), { signal: AbortSignal.timeout(30_000) });
      if (!transcriptionResponse.ok) throw new Error(`Aliyun speaker diarization result download failed: ${transcriptionResponse.status}`);
      return evaluateSpeakerDiarization(await transcriptionResponse.json(), this.model, taskId);
    }
    throw new Error('Aliyun speaker diarization timed out');
  }
}
