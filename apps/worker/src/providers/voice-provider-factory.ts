import { AliyunCosyVoiceProvider } from './aliyun-cosyvoice.js';
import { VolcengineSeedAudioProvider } from './volcengine-seed-audio.js';
import type { VoiceProviderPort } from './voice-provider.js';

export function createVoiceProviderFromEnv(): VoiceProviderPort {
  const configured = String(process.env.AIVOICE_VOICE_PROVIDER || 'volcengine-seed-audio').trim().toLowerCase();
  if (configured === 'volcengine-seed-audio' || configured === 'seed-audio') {
    return new VolcengineSeedAudioProvider();
  }
  if (configured === 'aliyun-cosyvoice' || configured === 'cosyvoice') {
    return new AliyunCosyVoiceProvider();
  }
  throw new Error(`Unsupported AIVOICE_VOICE_PROVIDER: ${configured}`);
}
