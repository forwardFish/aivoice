import { AliyunCosyVoiceProvider } from './aliyun-cosyvoice.js';
import { createVoiceProviderFromEnv } from './voice-provider-factory.js';
import { usesReferenceAudio, type VoiceProviderPort } from './voice-provider.js';
import { VolcengineSeedAudioProvider } from './volcengine-seed-audio.js';

export interface RankedVoiceProvider {
  id: string;
  qualityRank: number;
  provider: VoiceProviderPort;
}

export interface VoiceProviderRegistry {
  active: RankedVoiceProvider;
  registered: RankedVoiceProvider;
  companions: RankedVoiceProvider[];
}

export interface VoiceProviderRegistryOverrides {
  active?: VoiceProviderPort;
  registered?: VoiceProviderPort;
  companions?: VoiceProviderPort[];
}

function entry(provider: VoiceProviderPort, qualityRank: number): RankedVoiceProvider {
  return {
    id: provider.providerName || provider.targetModel,
    qualityRank,
    provider,
  };
}

export function createVoiceProviderRegistry(
  overrides: VoiceProviderRegistryOverrides = {},
): VoiceProviderRegistry {
  const activeProvider = overrides.active || createVoiceProviderFromEnv();
  const registeredProvider = overrides.registered
    || (usesReferenceAudio(activeProvider) ? new AliyunCosyVoiceProvider() : activeProvider);
  if (usesReferenceAudio(registeredProvider)) throw new Error('Registered voice provider cannot use reference-audio mode');

  const companionProviders = overrides.companions
    || [usesReferenceAudio(activeProvider) ? activeProvider : new VolcengineSeedAudioProvider()];
  const registeredId = registeredProvider.providerName || registeredProvider.targetModel;
  const companions = companionProviders
    .filter((provider) => (provider.providerName || provider.targetModel) !== registeredId)
    .map((provider, index) => entry(provider, 100 + index));
  for (const companion of companions) {
    if (!usesReferenceAudio(companion.provider)) {
      throw new Error(`Companion voice provider ${companion.id} must use retained reference audio`);
    }
  }
  return {
    active: entry(activeProvider, usesReferenceAudio(activeProvider) ? 100 : 10),
    registered: entry(registeredProvider, 10),
    companions,
  };
}
