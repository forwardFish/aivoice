import { AliyunSpeakerDiarizationProvider, type SpeakerDiarizationReport } from './aliyun-speaker-diarization.js';

export interface SpeakerAnalysisProviderPort {
  readonly providerName?: string;
  inspect(fileUrl: string): Promise<SpeakerDiarizationReport>;
}

export function createSpeakerAnalysisProviderFromEnv(): SpeakerAnalysisProviderPort {
  const configured = String(process.env.AIVOICE_SPEAKER_ANALYSIS_PROVIDER || 'aliyun').trim().toLowerCase();
  if (configured === 'aliyun' || configured === 'dashscope') return new AliyunSpeakerDiarizationProvider();
  throw new Error(`Unsupported AIVOICE_SPEAKER_ANALYSIS_PROVIDER: ${configured}`);
}
