import type { EmotionExpressionPlan } from './emotion-expression.js';
import type { RankedVoiceProvider, VoiceProviderRegistry } from './providers/voice-provider-registry.js';
import { usesReferenceAudio, type VoiceSynthesisOptions } from './providers/voice-provider.js';
import {
  shouldUseParallelVoice,
  startVoiceGeneration,
  voiceGenerationStrategy,
  type VoiceGenerationSession,
  type VoiceGenerationStrategy,
} from './voice-generation-strategy.js';

export interface VoiceGenerationRequest {
  mode: 'CHAT' | 'EXACT_SPEECH';
  visibleText: string;
  synthesisText: string;
  expression: EmotionExpressionPlan;
  registeredBinding: string;
  resolveReference: () => Promise<string>;
  options: VoiceSynthesisOptions;
  allowCompanion?: (provider: RankedVoiceProvider) => boolean | Promise<boolean>;
}

export class VoiceGenerationCoordinator {
  constructor(
    private readonly registry: VoiceProviderRegistry,
    private readonly strategy: () => VoiceGenerationStrategy = voiceGenerationStrategy,
  ) {
    if (usesReferenceAudio(this.registry.registered.provider)) {
      throw new Error('Registered voice provider cannot use reference-audio mode');
    }
  }

  async generate(request: VoiceGenerationRequest): Promise<VoiceGenerationSession> {
    let referencePromise: Promise<string> | null = null;
    const reference = () => {
      if (!referencePromise) referencePromise = request.resolveReference();
      return referencePromise;
    };
    const candidate = (
      entry: VoiceProviderRegistry['active'],
      permit?: (provider: RankedVoiceProvider) => boolean | Promise<boolean>,
    ) => ({
      id: entry.id,
      qualityRank: entry.qualityRank,
      generate: async () => {
        if (permit && !await permit(entry)) throw new Error(`VOICE_COMPANION_BUDGET_DENIED:${entry.id}`);
        return entry.provider.synthesize(
          usesReferenceAudio(entry.provider) ? await reference() : request.registeredBinding,
          usesReferenceAudio(entry.provider) ? request.visibleText : request.synthesisText,
          request.options,
        );
      },
    });

    const parallel = this.strategy() === 'SELECTIVE_PARALLEL'
      && shouldUseParallelVoice({ mode: request.mode, text: request.visibleText, expression: request.expression });
    if (!parallel) return startVoiceGeneration([candidate(this.registry.active)]);
    return startVoiceGeneration([
      candidate(this.registry.registered),
      ...this.registry.companions.map((entry) => candidate(entry, request.allowCompanion)),
    ]);
  }
}
