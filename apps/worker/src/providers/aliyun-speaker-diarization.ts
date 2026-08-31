import { trustedAliyunUrl } from './aliyun-cosyvoice.js';

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

export interface ObservedSpeechEvidence {
  transcript: string;
  characterCount: number;
  charactersPerSecond: number;
  medianSentenceCharacters: number;
  pauseCount: number;
  averagePauseMs: number;
  affectCues: string[];
  recurringPhrases: string[];
}

export interface SpeakerDiarizationReport {
  model: string;
  speakerCount: number;
  segmentCount: number;
  speechMs: number;
  overlapMs: number;
  overlapRatio: number;
  acceptable: boolean;
  segments: SpeakerDiarizationSegment[];
  speechEvidence?: ObservedSpeechEvidence;
  failureCode?: SpeakerDiarizationFailureCode;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function rounded(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function occurrences(text: string, phrase: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(phrase, offset)) >= 0) {
    count += 1;
    offset += phrase.length;
  }
  return count;
}

function recurringPhrasesFromTranscript(transcript: string): string[] {
  const discourseMarkers = ['其实', '说实话', '就是', '然后', '真的', '我觉得', '你知道', '怎么说', '反正', '有点', '蛮', '还是'];
  const selected = discourseMarkers.filter((phrase) => occurrences(transcript, phrase) >= 2);
  const counts = new Map<string, number>();
  for (const sequence of transcript.match(/[\p{Script=Han}]{2,}/gu) || []) {
    for (const length of [4, 3, 2]) {
      for (let index = 0; index <= sequence.length - length; index += 1) {
        const phrase = sequence.slice(index, index + length);
        counts.set(phrase, (counts.get(phrase) || 0) + 1);
      }
    }
  }
  const stop = new Set(['我们', '你们', '他们', '我的', '你的', '他的', '一个', '这个', '那个', '没有', '可以', '是有']);
  const repeated = [...counts.entries()]
    .filter(([phrase, count]) => count >= 2 && !stop.has(phrase) && !selected.some((marker) => phrase.includes(marker)))
    .sort((left, right) => (right[1] * right[0].length) - (left[1] * left[0].length) || right[0].length - left[0].length)
    .map(([phrase]) => phrase)
    .filter((phrase, index, all) => !all.slice(0, index).some((prior) => prior.includes(phrase) || phrase.includes(prior)))
    .slice(0, Math.max(0, 6 - selected.length));
  return [...selected, ...repeated].slice(0, 6);
}

export function evaluateSpeakerDiarization(input: unknown, model = 'fun-asr'): SpeakerDiarizationReport {
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
      text: String(row.text ?? row.transcript ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 200),
    }];
  }).sort((left, right) => left.beginMs - right.beginMs || left.endMs - right.endMs);

  const speakerIds = new Set(segments.map((segment) => segment.speakerId));
  const speechMs = segments.reduce((sum, segment) => sum + segment.endMs - segment.beginMs, 0);
  const sentenceCharacterCounts = segments
    .map((segment) => Array.from(segment.text).filter((character) => /[\p{L}\p{N}]/u.test(character)).length)
    .filter((count) => count > 0)
    .sort((left, right) => left - right);
  const characterCount = sentenceCharacterCounts.reduce((sum, count) => sum + count, 0);
  const pauses = segments.slice(1).map((segment, index) => Math.max(0, segment.beginMs - segments[index].endMs)).filter((gap) => gap >= 150);
  const transcript = Array.from(segments.map((segment) => segment.text).filter(Boolean).join(' ')).slice(0, 600).join('');
  const affectCuePatterns: Array<[string, RegExp]> = [
    ['开心', /开心|高兴|兴奋|惊喜/u],
    ['难过', /难过|伤心|委屈|心疼/u],
    ['生气', /生气|不高兴|恼火|气愤/u],
    ['烦躁', /烦躁|很烦|烦死/u],
    ['担心', /担心|紧张|害怕|不安/u],
    ['疲惫', /疲惫|很累|困了|没精神/u],
  ];
  const affectCues = affectCuePatterns.filter(([, pattern]) => pattern.test(transcript)).map(([label]) => label).slice(0, 4);
  const recurringPhrases = recurringPhrasesFromTranscript(transcript);
  const speechEvidence = transcript && characterCount > 0 && speechMs > 0 ? {
    transcript,
    characterCount,
    charactersPerSecond: rounded(characterCount / (speechMs / 1000), 3),
    medianSentenceCharacters: sentenceCharacterCounts[Math.floor(sentenceCharacterCounts.length / 2)] || characterCount,
    pauseCount: pauses.length,
    averagePauseMs: pauses.length ? Math.round(pauses.reduce((sum, gap) => sum + gap, 0) / pauses.length) : 0,
    affectCues,
    recurringPhrases,
  } : undefined;
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
    model,
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
      return evaluateSpeakerDiarization(await transcriptionResponse.json(), this.model);
    }
    throw new Error('Aliyun speaker diarization timed out');
  }
}
