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

export type VoiceAct =
  | 'CASUAL_EXPLAIN'
  | 'DENY_THEN_EXPLAIN'
  | 'ASSERT_BOUNDARY'
  | 'PLAYFUL_PROBE'
  | 'ADMIT_HURT'
  | 'EXPRESS_DELIGHT'
  | 'SHOW_PRACTICAL_CARE'
  | 'HESITATE_OR_SHY'
  | 'SPEAK_LOW_ENERGY'
  | 'SOFTEN_AFTER_TENSION';

export type VoiceAffect =
  | 'NEUTRAL'
  | 'POSITIVE'
  | 'CONCERNED'
  | 'IRRITATED'
  | 'PLAYFUL'
  | 'UNEASY'
  | 'LOW_ENERGY'
  | 'HURT'
  | 'MIXED';
export type VoiceIntensity = 0 | 1 | 2;
export type VoiceCadence =
  | 'CONNECTED_SHORT'
  | 'NO_SLOWDOWN_AFTER_COMMA'
  | 'FIRM_TWO_BEAT'
  | 'LIGHT_FINAL_RISE'
  | 'SOFT_FALL'
  | 'BRIGHT_BOUNCE'
  | 'CAREFUL_STEADY'
  | 'HESITANT_SHORT'
  | 'LOW_ENERGY_SPARSE'
  | 'TENSE_TO_SOFT';

export interface VoiceDeliveryPlan {
  act: VoiceAct;
  affect: VoiceAffect;
  intensity: VoiceIntensity;
  cadence: VoiceCadence;
}

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
  seed?: number;
  relationshipType?: VoiceRelationshipType | null;
  deliveryMode?: VoiceDeliveryMode;
  speechAct?: VoiceSpeechAct;
  observedBaseline?: VoiceObservedDeliveryBaseline | null;
  deliveryPlan?: VoiceDeliveryPlan;
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
