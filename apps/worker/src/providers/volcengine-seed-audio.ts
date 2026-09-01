import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { VoiceRelationshipType } from '../chat/voice-chat-context.js';
import {
  VoiceGenerationError,
  type VoiceDeliveryMode,
  type VoiceObservedDeliveryBaseline,
  type VoiceProviderPort,
  type VoiceSpeechAct,
  type VoiceSynthesisOptions,
} from './voice-provider.js';

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

interface SeedAudioResponse {
  code?: number | string;
  message?: string;
  audio?: string;
  url?: string;
  duration?: number;
  original_duration?: number;
}

export class SeedAudioGenerationError extends VoiceGenerationError {
  constructor(
    message: string,
    readonly code = 'SEED_AUDIO_FAILED',
    readonly httpStatus: number | null = null,
    readonly requestId = '',
  ) {
    super(message, code, httpStatus, requestId, false);
    this.name = 'SeedAudioGenerationError';
  }
}

function counterpartDescription(relationship: VoiceRelationshipType | null | undefined): string {
  const values: Record<VoiceRelationshipType, string> = {
    SELF: '熟悉的人',
    MOTHER: '孩子',
    FATHER: '孩子',
    GRANDMOTHER: '晚辈',
    GRANDFATHER: '晚辈',
    CHILD: '父母',
    PARTNER: '伴侣',
    FRIEND: '朋友',
    OTHER: '熟悉的人',
  };
  return relationship ? values[relationship] : '熟悉的人';
}

const DELIVERY_INSTRUCTIONS: Record<VoiceDeliveryMode, string> = {
  CASUAL: '连贯地说，句尾干净',
  BRIGHT_LIGHT: '自然开心，带一点笑意，不夸张',
  DIRECT_TENSE: '轻微不满，关键词稍重，句尾短，不喊不拖',
  QUIET_UNEASY: '声音稍收，少停顿，连着说，不用气声',
  SOFT_HURT: '有点难受，声音放轻，句尾收住，不用哭腔',
  PLAYFUL_LIGHT: '带一点笑意，不故意扬尾，不搞怪',
  PRACTICAL_CARE: '认真但自然，不用安慰腔，不说教',
};

function speechActInstruction(act: VoiceSpeechAct, counterpart: string): string {
  const values: Record<VoiceSpeechAct, string> = {
    REPLY: `直接回应${counterpart}`,
    AGREE: `接住${counterpart}的话并自然回应`,
    ASK: `顺口问${counterpart}一句`,
    EXPLAIN: `直接向${counterpart}补一句原因`,
    NEGOTIATE: `直接和${counterpart}说清自己的想法`,
    TEASE: `顺口调侃${counterpart}一句`,
    REMIND: `顺口提醒${counterpart}一句`,
    SHARE: `和${counterpart}分享一句`,
  };
  return values[act];
}

function observedBaselineInstruction(baseline: VoiceObservedDeliveryBaseline | null | undefined): string {
  if (!baseline) return '保持本人原来的说话节奏。';
  const cues = [
    baseline.speechRate === 'FAST' ? '语速偏快' : baseline.speechRate === 'SLOW' ? '语速偏慢' : '',
    baseline.pauseStyle === 'LOW' ? '少停顿' : baseline.pauseStyle === 'HIGH' ? '停顿稍多' : '',
    baseline.pitchStyle === 'NARROW' ? '语调起伏较小' : baseline.pitchStyle === 'WIDE' ? '语调自然起伏' : '',
    baseline.sentenceEndingStyle === 'FALLING' ? '句尾下收' : baseline.sentenceEndingStyle === 'RISING' ? '句尾微扬' : baseline.sentenceEndingStyle === 'LEVEL' ? '句尾平稳' : '',
    baseline.volumeDynamicsStyle === 'FLAT' ? '音量较稳' : baseline.volumeDynamicsStyle === 'DYNAMIC' ? '保留自然强弱' : '',
  ].filter(Boolean).slice(0, 3);
  const corrections = {
    SPEAK_SLOWER: '语速放慢一点',
    SPEAK_FASTER: '语速快一点',
    PAUSE_MORE: '停顿多一点',
    PAUSE_LESS: '停顿少一点',
    VOLUME_SOFTER: '情绪起来时音量不要变大',
    VOLUME_STRONGER: '情绪起来时音量可以稍强',
    PITCH_FLATTER: '语调起伏小一点',
    PITCH_MORE_DYNAMIC: '语调起伏自然一些',
  } as const;
  const habit = cues.length ? `保持本人${cues.join('、')}的说话习惯。` : '保持本人原来的说话节奏。';
  return baseline.correction ? `${habit}${corrections[baseline.correction]}。` : habit;
}

export function seedAudioSynthesisText(text: string, options: VoiceSynthesisOptions = {}): string {
  const normalized = String(text || '').trim();
  if (options.deliveryMode === 'DIRECT_TENSE' && options.speechAct === 'EXPLAIN') {
    return normalized.replace(/(?:……|…{2,})/gu, '，');
  }
  return normalized;
}

export function buildSeedAudioPrompt(text: string, options: VoiceSynthesisOptions = {}): string {
  const exactText = seedAudioSynthesisText(text, options);
  if (!exactText) throw new SeedAudioGenerationError('Seed Audio text is empty', 'SEED_AUDIO_TEXT_EMPTY');
  const deliveryMode = options.deliveryMode || 'CASUAL';
  const speechAct = options.speechAct || 'REPLY';
  const counterpart = counterpartDescription(options.relationshipType);
  const baseline = observedBaselineInstruction(options.observedBaseline);
  const act = speechActInstruction(speechAct, counterpart);
  const delivery = DELIVERY_INSTRUCTIONS[deliveryMode];
  return `使用@Audio1的声音。${baseline}${act}。${delivery}。只说：『${exactText}』自然说，不播报不表演；只生成人声。`;
}

function apiKey(): string {
  return String(
    process.env.VOLCENGINE_SEED_AUDIO_API_KEY
    || process.env.BYTEPLUS_SEED_AUDIO_API_KEY
    || '',
  ).trim();
}

export function seedAudioUsdPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(String(env.BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE || '0.15').trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('BYTEPLUS_SEED_AUDIO_USD_PER_MINUTE must be a positive number');
  }
  return value;
}

export function estimateSeedAudioCostUsd(
  billingSeconds: number,
  usdPerMinute: number = seedAudioUsdPerMinute(),
): number {
  if (!Number.isFinite(usdPerMinute) || usdPerMinute <= 0) {
    throw new Error('Seed Audio USD price per minute must be a positive number');
  }
  const seconds = Number.isFinite(billingSeconds) ? Math.max(0, billingSeconds) : 0;
  return Number((seconds * usdPerMinute / 60).toFixed(6));
}

function seedAudioEndpoint(configured: string): string {
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'openspeech.bytedance.com') {
    throw new SeedAudioGenerationError('Untrusted Volcengine Seed Audio API host', 'SEED_AUDIO_HOST_INVALID');
  }
  return url.toString().replace(/\/+$/u, '');
}

async function responseBody(response: Response): Promise<SeedAudioResponse> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as SeedAudioResponse;
  } catch {
    throw new SeedAudioGenerationError(
      `Seed Audio returned invalid JSON: ${raw.slice(0, 300)}`,
      'SEED_AUDIO_INVALID_RESPONSE',
      response.status,
      response.headers.get('x-tt-logid') || '',
    );
  }
}

export class VolcengineSeedAudioProvider implements VoiceProviderPort {
  readonly providerName = 'volcengine-seed-audio';
  readonly targetModel = process.env.SEED_AUDIO_MODEL?.trim() || 'seed-audio-1.0';
  readonly referenceMode = 'REFERENCE_AUDIO' as const;
  private readonly baseUrl = seedAudioEndpoint(String(
    process.env.VOLCENGINE_SEED_AUDIO_BASE_URL || 'https://openspeech.bytedance.com',
  ).trim());

  async enroll(referencePath: string): Promise<string> {
    await fs.access(referencePath);
    return referencePath;
  }

  async synthesize(referencePath: string, text: string, options: VoiceSynthesisOptions = {}): Promise<Buffer> {
    const key = apiKey();
    if (!key) throw new SeedAudioGenerationError('VOLCENGINE_SEED_AUDIO_API_KEY is required', 'SEED_AUDIO_KEY_MISSING');
    const pricingUsdPerMinute = seedAudioUsdPerMinute();
    let reference: Buffer;
    try {
      reference = await fs.readFile(referencePath);
    } catch (error) {
      throw new SeedAudioGenerationError(
        `Seed Audio reference cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        'SEED_AUDIO_REFERENCE_UNAVAILABLE',
      );
    }
    if (!reference.length || reference.length > MAX_REFERENCE_BYTES) {
      throw new SeedAudioGenerationError(
        `Seed Audio reference must be between 1 and ${MAX_REFERENCE_BYTES} bytes`,
        'SEED_AUDIO_REFERENCE_INVALID',
      );
    }
    const requestId = /^[0-9a-f-]{36}$/iu.test(String(options.messageId || ''))
      ? String(options.messageId)
      : /^[0-9a-f-]{36}$/iu.test(String(options.jobId || ''))
        ? String(options.jobId)
        : crypto.randomUUID();
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v3/tts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': key,
          'X-Api-Request-Id': requestId,
        },
        body: JSON.stringify({
          model: this.targetModel,
          text_prompt: buildSeedAudioPrompt(text, options),
          references: [{ audio_data: reference.toString('base64'), mime_type: 'audio/wav' }],
          audio_config: {
            format: 'wav',
            sample_rate: 24_000,
            speech_rate: 0,
            loudness_rate: 0,
            pitch_rate: 0,
          },
          watermark: {},
        }),
        signal: AbortSignal.timeout(Math.max(10_000, Number(process.env.SEED_AUDIO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)),
      });
    } catch (error) {
      throw new SeedAudioGenerationError(
        `Seed Audio request failed: ${error instanceof Error ? error.message : String(error)}`,
        'SEED_AUDIO_REQUEST_FAILED',
        null,
        requestId,
      );
    }
    const providerRequestId = response.headers.get('x-tt-logid') || requestId;
    const result = await responseBody(response);
    if (!response.ok || (result.code != null && Number(result.code) !== 0)) {
      throw new SeedAudioGenerationError(
        result.message || `Seed Audio failed with HTTP ${response.status}`,
        String(result.code || 'SEED_AUDIO_HTTP_ERROR'),
        response.status,
        providerRequestId,
      );
    }
    let audio: Buffer;
    if (result.audio) {
      audio = Buffer.from(result.audio, 'base64');
    } else if (result.url) {
      let download: Response;
      try {
        download = await fetch(result.url, { signal: AbortSignal.timeout(60_000) });
      } catch (error) {
        throw new SeedAudioGenerationError(
          `Seed Audio download failed: ${error instanceof Error ? error.message : String(error)}`,
          'SEED_AUDIO_DOWNLOAD_FAILED',
          null,
          providerRequestId,
        );
      }
      if (!download.ok) {
        throw new SeedAudioGenerationError(
          `Seed Audio download failed with HTTP ${download.status}`,
          'SEED_AUDIO_DOWNLOAD_FAILED',
          download.status,
          providerRequestId,
        );
      }
      audio = Buffer.from(await download.arrayBuffer());
    } else {
      throw new SeedAudioGenerationError(
        'Seed Audio returned no audio or download URL',
        'SEED_AUDIO_OUTPUT_MISSING',
        response.status,
        providerRequestId,
      );
    }
    const billingSeconds = Number(result.original_duration ?? result.duration ?? 0);
    console.info('seed_audio_generation', JSON.stringify({
      event: 'seed_audio_generation',
      status: 'SUCCEEDED',
      model: this.targetModel,
      messageId: options.messageId || '',
      requestId: providerRequestId,
      elapsedMs: Date.now() - startedAt,
      durationSeconds: Number(result.duration || 0),
      billingDurationSeconds: billingSeconds,
      pricingCurrency: 'USD',
      pricingUsdPerMinute,
      estimatedCostUsd: estimateSeedAudioCostUsd(billingSeconds, pricingUsdPerMinute),
      referenceBytes: reference.length,
      outputBytes: audio.length,
    }));
    return audio;
  }

  async deleteVoice(): Promise<void> {
    // Seed Audio uses the stored reference audio directly and creates no remote voice resource.
  }
}
