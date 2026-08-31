import type { InteractionStance, ReplyTone } from '../chat/interaction-state.js';
import type { VoiceRelationshipType } from '../chat/voice-chat-context.js';

export type VoiceReferenceMode = 'REGISTERED_VOICE' | 'REFERENCE_AUDIO';

export interface VoiceSynthesisOptions {
  jobId?: string;
  messageId?: string;
  instruction?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  enableSsml?: boolean;
  replyTone?: ReplyTone;
  ageYears?: number | null;
  gender?: 'FEMALE' | 'MALE' | null;
  userAgeYears?: number | null;
  relationshipType?: VoiceRelationshipType | null;
  sceneInstruction?: string;
  interactionStance?: InteractionStance | null;
  emotionIntensity?: 0 | 1 | 2 | 3;
  personalityStyle?: string;
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
