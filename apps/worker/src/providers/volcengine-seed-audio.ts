import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { ReplyTone } from '../chat/interaction-state.js';
import type { VoiceRelationshipType } from '../chat/voice-chat-context.js';
import type { VoiceProviderPort, VoiceSynthesisOptions } from './voice-provider.js';

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

export class SeedAudioGenerationError extends Error {
  readonly retryable = false;

  constructor(
    message: string,
    readonly code = 'SEED_AUDIO_FAILED',
    readonly httpStatus: number | null = null,
    readonly requestId = '',
  ) {
    super(message);
    this.name = 'SeedAudioGenerationError';
  }
}

function speakerDescription(options: VoiceSynthesisOptions): string {
  const age = Number(options.ageYears || 0);
  const child = age > 0 && age < 18;
  const person = options.gender === 'MALE'
    ? child ? '男孩' : '男性'
    : options.gender === 'FEMALE'
      ? child ? '女孩' : '女性'
      : '人物';
  return age > 0 ? `${age}岁${person}` : person;
}

function counterpartDescription(
  relationship: VoiceRelationshipType | null | undefined,
  userAgeYears: number | null | undefined,
): string {
  const userIsChild = Number(userAgeYears || 0) > 0 && Number(userAgeYears) < 18;
  const values: Record<VoiceRelationshipType, string> = {
    SELF: '熟悉的人',
    MOTHER: userIsChild ? '自己的孩子' : '已经长大的孩子',
    FATHER: userIsChild ? '自己的孩子' : '已经长大的孩子',
    GRANDMOTHER: '自己的晚辈',
    GRANDFATHER: '自己的晚辈',
    CHILD: '自己的父母',
    PARTNER: '自己的伴侣',
    FRIEND: '自己的朋友',
    OTHER: '熟悉的人',
  };
  return relationship ? values[relationship] : '熟悉的人';
}

function plainScene(options: VoiceSynthesisOptions): string {
  const speaker = speakerDescription(options);
  const counterpart = counterpartDescription(options.relationshipType, options.userAgeYears);
  if (options.interactionStance === 'ACCEPT' || options.interactionStance === 'PARTIAL_ACCEPT') {
    return `${speaker}随口回应${counterpart}一件小事。`;
  }
  if (options.interactionStance === 'ASK') return `${speaker}随口问${counterpart}一件事。`;
  if (options.interactionStance === 'DISAGREE' || options.interactionStance === 'SET_BOUNDARY') {
    return `${speaker}平静地回应${counterpart}。`;
  }
  return `${speaker}和${counterpart}说一句日常话。`;
}

function intensityWord(options: VoiceSynthesisOptions): string {
  if (options.emotionIntensity === 1) return '有一点';
  if (options.emotionIntensity === 3) return '很';
  return '有些';
}

function emotionScene(replyTone: ReplyTone, options: VoiceSynthesisOptions): string {
  const speaker = speakerDescription(options);
  const counterpart = counterpartDescription(options.relationshipType, options.userAgeYears);
  const intensity = intensityWord(options);
  const style = String(options.personalityStyle || 'NEUTRAL');
  if (style === 'SURPRISED_POSITIVE') return `${speaker}听到意外的好消息，起句是真实惊喜，随后自然开心地回应${counterpart}，不尖叫。`;
  if (style === 'EMBARRASSED_UNEASY') return `${speaker}被${counterpart}夸奖后有点不好意思，声音稍微收一点，短暂停一下再回应，不装可爱。`;
  if (style === 'AUTONOMY_IRRITATED') return `${speaker}不喜欢${counterpart}替自己决定，先直接争取把话说完，但不喊叫。`;
  if (style === 'PLAYFUL_PLAIN' || style === 'PLAYFUL_POSITIVE') {
    const playful = Number(options.ageYears || 0) > 0 && Number(options.ageYears) < 18
      ? '带一点调皮地'
      : '带着笑意';
    return `${speaker}${playful}调侃${counterpart}一句，像熟人之间顺口开的玩笑，不故意搞怪。`;
  }
  if (replyTone === 'POSITIVE') {
    return options.interactionStance === 'SHARE'
      ? `${speaker}${intensity}开心，和${counterpart}分享一件事。`
      : `${speaker}听到让自己开心的话，自然回应${counterpart}。`;
  }
  if (replyTone === 'CONCERNED') {
    if (style === 'ACTION_CARE') return `${speaker}注意到${counterpart}当前有些累，用一件具体小事表达关心，不煽情。`;
    if (style === 'NAGGING_CARE') return `${speaker}因为担心${counterpart}，围绕当前一件具体小事多提醒一句，但不说教。`;
    return options.interactionStance === 'ASK'
      ? `${speaker}注意到${counterpart}当前的情况，顺口关心地问一句。`
      : `${speaker}认真关心${counterpart}，直接回应当前这件事。`;
  }
  if (replyTone === 'LOW_ENERGY') return `${speaker}当前${intensity}累，简短回应${counterpart}。`;
  if (replyTone === 'UNEASY') return `${speaker}对当前这件事${intensity}不安，犹豫着回应${counterpart}。`;
  if (replyTone === 'SAD_OR_HURT') return `${speaker}因为当前这件事${intensity}难受，直接对${counterpart}说出感受。`;
  if (replyTone === 'IRRITATED') {
    if (style === 'RESTRAINED_IRRITATED') return `${speaker}压着对当前事情的不高兴，停一下再回应${counterpart}，不喊叫。`;
    if (style === 'QUICK_IRRITATED' || style === 'QUICK_DIRECT_IRRITATED') {
      return `${speaker}因为当前事情突然不高兴，开头直接，语气短促地回应${counterpart}，但不提高音量。`;
    }
    return `${speaker}针对当前这件事${intensity}不高兴，直接回应${counterpart}，但不是争吵。`;
  }
  if (replyTone === 'MIXED') {
    if (style === 'HARD_SOFT_MIXED') return `${speaker}先简短否认，紧接着说明自己在意的原因，语气自然变软，不拖腔。`;
    if (style === 'FAST_RECOVERY_MIXED') return `${speaker}前半句留一点不满，随后很快恢复普通语气，继续回应${counterpart}。`;
    return `${speaker}先表达一点不满，随后自然把话收回来，继续回应${counterpart}。`;
  }
  return plainScene(options);
}

export function seedAudioSynthesisText(text: string, options: VoiceSynthesisOptions = {}): string {
  const normalized = String(text || '').trim();
  if (options.personalityStyle === 'HARD_SOFT_MIXED') {
    return normalized.replace(/(?:……|…{2,})/gu, '，');
  }
  return normalized;
}

export function buildSeedAudioPrompt(text: string, options: VoiceSynthesisOptions = {}): string {
  const exactText = seedAudioSynthesisText(text, options);
  if (!exactText) throw new SeedAudioGenerationError('Seed Audio text is empty', 'SEED_AUDIO_TEXT_EMPTY');
  const explicitScene = String(options.sceneInstruction || '').trim();
  const replyTone = options.replyTone || 'PLAIN';
  const personalityOwnsPlain = options.personalityStyle === 'PLAYFUL_PLAIN';
  const scene = explicitScene
    ? `${explicitScene.replace(/[。；;]+$/u, '')}。`
    : replyTone === 'PLAIN' && !personalityOwnsPlain
      ? plainScene(options)
      : emotionScene(replyTone, options);
  return `使用@Audio1的声音。${scene}只说这一句：『${exactText}』像平时说话一样自然，不播音，不表演。只生成人声，不要音乐，不要环境音效。`;
}

function apiKey(): string {
  return String(
    process.env.VOLCENGINE_SEED_AUDIO_API_KEY
    || process.env.BYTEPLUS_SEED_AUDIO_API_KEY
    || '',
  ).trim();
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
      estimatedCostRmb: Number((billingSeconds * 0.3 / 60).toFixed(6)),
      referenceBytes: reference.length,
      outputBytes: audio.length,
    }));
    return audio;
  }

  async deleteVoice(): Promise<void> {
    // Seed Audio uses the stored reference audio directly and creates no remote voice resource.
  }
}
