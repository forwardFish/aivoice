import type { CharacterTurnGeneration } from '../chat/interaction-state.js';
import type { VoiceChatMessage } from '../chat/voice-chat-context.js';

export interface ChatReplyOptions {
  maxAttempts?: 1 | 2;
  temperature?: number;
}

export interface ChatProviderPort {
  readonly providerName?: string;
  readonly modelName?: string;
  reply(messages: VoiceChatMessage[], options?: ChatReplyOptions): Promise<string | CharacterTurnGeneration>;
}
