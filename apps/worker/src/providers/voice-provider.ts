import type { VoiceRelationshipType } from '../chat/voice-chat-context.js';

export type VoiceReferenceMode = 'REGISTERED_VOICE' | 'REFERENCE_AUDIO';

export class VoiceGenerationError extends Error {
  constructor(
    message: string,
    readonly code = 'VOICE_GENERATION_FAILED',
    readonly httpStatus: number | null = null,
    readonly requestId = '',
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'VoiceGenerationError';
  }
}

export type VoiceDeliveryMode =
  | 'CASUAL'
  | 'BRIGHT_LIGHT'
  | 'DIRECT_TENSE'
  | 'QUIET_UNEASY'
  | 'SOFT_HURT'
  | 'PLAYFUL_LIGHT'
  | 'PRACTICAL_CARE';

export type VoiceSpeechAct =
  | 'REPLY'
  | 'AGREE'
  | 'ASK'
  | 'EXPLAIN'
  | 'NEGOTIATE'
  | 'TEASE'
  | 'REMIND'
  | 'SHARE';

export type VoiceDeliveryCorrection =
  | 'SPEAK_SLOWER'
  | 'SPEAK_FASTER'
  | 'PAUSE_MORE'
  | 'PAUSE_LESS'
  | 'VOLUME_SOFTER'
  | 'VOLUME_STRONGER'
  | 'PITCH_FLATTER'
  | 'PITCH_MORE_DYNAMIC';

export interface VoiceObservedDeliveryBaseline {
  speechRate: 'SLOW' | 'MEDIUM' | 'FAST';
  pauseStyle: 'LOW' | 'MEDIUM' | 'HIGH';
  pitchStyle: 'NARROW' | 'MEDIUM' | 'WIDE' | 'UNKNOWN';
  sentenceEndingStyle: 'FALLING' | 'LEVEL' | 'RISING' | 'UNKNOWN';
  volumeDynamicsStyle: 'FLAT' | 'MEDIUM' | 'DYNAMIC' | 'UNKNOWN';
  correction?: VoiceDeliveryCorrection;
}

export interface VoiceSynthesisOptions {
  jobId?: string;
  messageId?: string;
  instruction?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  enableSsml?: boolean;
  relationshipType?: VoiceRelationshipType | null;
  deliveryMode?: VoiceDeliveryMode;
  speechAct?: VoiceSpeechAct;
  observedBaseline?: VoiceObservedDeliveryBaseline | null;
}

export interface VoiceProviderPort {
  readonly providerName?: string;
  readonly targetModel: string;
  readonly referenceMode?: VoiceReferenceMode;
  enroll(referencePath: string, prefix: string): Promise<string>;
  synthesize(reference: string, text: string, options?: VoiceSynthesisOptions): Promise<Buffer>;
  deleteVoice(providerReference: string): Promise<void>;
}

export function usesReferenceAudio(provider: VoiceProviderPort): boolean {
  return provider.referenceMode === 'REFERENCE_AUDIO';
}
