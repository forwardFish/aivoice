import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { VoiceRelationshipType } from '../chat/voice-chat-context.js';
import { downmixPcm16WavToMono, trimTrailingPcmSilence } from '../media/wav-silence.js';
import { buildInternalTtsText } from '../voice-delivery-plan.js';
import {
  VoiceGenerationError,
  type VoiceDeliveryPlan,
  type VoiceProviderPort,
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

export function seedAudioSynthesisText(text: string, options: VoiceSynthesisOptions = {}): string {
  return buildInternalTtsText(String(text || ''), options.deliveryPlan || legacyPlan(options));
}

function legacyPlan(options: VoiceSynthesisOptions): VoiceDeliveryPlan {
  if (options.deliveryMode === 'PLAYFUL_LIGHT') {
    return { act: 'PLAYFUL_PROBE', affect: 'PLAYFUL', intensity: 1, cadence: 'LIGHT_FINAL_RISE' };
  }
  if (options.deliveryMode === 'SOFT_HURT') {
    return { act: 'ADMIT_HURT', affect: 'HURT', intensity: 2, cadence: 'SOFT_FALL' };
  }
  if (options.deliveryMode === 'DIRECT_TENSE' && options.speechAct === 'EXPLAIN') {
    return { act: 'DENY_THEN_EXPLAIN', affect: 'IRRITATED', intensity: 1, cadence: 'NO_SLOWDOWN_AFTER_COMMA' };
  }
  if (options.deliveryMode === 'DIRECT_TENSE') {
    return { act: 'ASSERT_BOUNDARY', affect: 'IRRITATED', intensity: 2, cadence: 'FIRM_TWO_BEAT' };
  }
  return { act: 'CASUAL_EXPLAIN', affect: 'NEUTRAL', intensity: 0, cadence: 'CONNECTED_SHORT' };
}

function particleCue(text: string): string {
  return /[啦呀嘛呢啊](?=[，,。！？!?]|$)/u.test(text) ? '，语气词快速带过' : '';
}

function performanceDirection(plan: VoiceDeliveryPlan, counterpart: string, text: string): string {
  if (plan.act === 'DENY_THEN_EXPLAIN') {
    return `像被${counterpart}说中后，先急着否认，紧接着把原因说出来。逗号后保持同样速度，最后短收`;
  }
  if (plan.act === 'ASSERT_BOUNDARY') {
    return `妈妈正替她做决定，她马上顶回去。语速正常偏快，边界句说重，后半不放软，结尾短收`;
  }
  if (plan.act === 'PLAYFUL_PROBE') {
    return `妈妈今天反常好说话，她顺口逗一句。语气轻快${particleCue(text)}，试探意味落在问句后半，只在结尾轻轻上扬`;
  }
  if (plan.act === 'ADMIT_HURT') {
    return `像刚被${counterpart}一句话伤到，委屈但认真说出来。逗号处短停，后半声音收一点，中间表达真实感受的语义单元稍微加重，最后轻短收住`;
  }
  if (plan.act === 'EXPRESS_DELIGHT') {
    return `像突然听到好消息，眼睛一亮就接话。起句是真实惊喜，中间轻快，最后自然上扬后短收`;
  }
  if (plan.act === 'SHOW_PRACTICAL_CARE') {
    return `像发现${counterpart}状态不对，马上认真关心。先确认，再给一个具体提醒，语气柔和但不说教`;
  }
  if (plan.act === 'HESITATE_OR_SHY') {
    return `像有点紧张又不想显得太慌，开头轻，第一处分句短停，后面小心说完，结尾带一点不确定`;
  }
  if (plan.act === 'SPEAK_LOW_ENERGY') {
    return `像真的有点累，气息比平时弱，语速略慢但连贯，只在语义处停一下，最后自然落下`;
  }
  if (plan.act === 'SOFTEN_AFTER_TENSION') {
    return `像刚才还有点不高兴，现在愿意缓下来。前半保留一点硬，转折后恢复日常节奏，最后短收`;
  }
  return `像在家里被${counterpart}问到后，顺嘴解释一句。整句自然连着说${particleCue(text)}，最后短收`;
}

export function buildSeedAudioPrompt(text: string, options: VoiceSynthesisOptions = {}): string {
  const exactText = seedAudioSynthesisText(text, options);
  if (!exactText) throw new SeedAudioGenerationError('Seed Audio text is empty', 'SEED_AUDIO_TEXT_EMPTY');
  const counterpart = counterpartDescription(options.relationshipType);
  const plan = options.deliveryPlan || legacyPlan(options);
  return `使用@Audio1里同一个人的声音。${performanceDirection(plan, counterpart, exactText)}。只说：“${exactText}”。只生成干净单人声。`;
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
    const monoAudio = downmixPcm16WavToMono(audio);
    const normalizedAudio = trimTrailingPcmSilence(monoAudio);
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
      outputBytes: normalizedAudio.length,
      downmixedStereoBytes: audio.length - monoAudio.length,
      trimmedTrailingSilenceBytes: monoAudio.length - normalizedAudio.length,
    }));
    return normalizedAudio;
  }

  async deleteVoice(): Promise<void> {
    // Seed Audio uses the stored reference audio directly and creates no remote voice resource.
  }
}
