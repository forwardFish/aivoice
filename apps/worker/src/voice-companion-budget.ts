export interface VoiceCompanionBudgetPolicy {
  providerId: string;
  limit: number;
  windowSize: number;
}

export const SEED_AUDIO_PROVIDER_ID = 'volcengine-seed-audio';

function integerSetting(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv,
  minimum: number,
  maximum: number,
): number {
  const raw = String(env[name] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function voiceCompanionBudgetPolicy(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): VoiceCompanionBudgetPolicy | null {
  if (providerId !== SEED_AUDIO_PROVIDER_ID) return null;
  const windowSize = integerSetting('AIVOICE_SEED_AUDIO_BUDGET_WINDOW', 50, env, 1, 1_000);
  const limit = integerSetting('AIVOICE_SEED_AUDIO_BUDGET_LIMIT', 15, env, 0, 1_000);
  if (limit > windowSize) {
    throw new Error('AIVOICE_SEED_AUDIO_BUDGET_LIMIT cannot exceed AIVOICE_SEED_AUDIO_BUDGET_WINDOW');
  }
  return { providerId, limit, windowSize };
}
