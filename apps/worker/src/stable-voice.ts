import type { VoiceGender } from './chat/age-identity.js';
import type { VoiceRelationshipType } from './chat/voice-chat-context.js';
import type {
  VoiceAct,
  VoiceAffect,
  VoiceCadence,
  VoiceDeliveryPlan,
  VoiceIntensity,
} from './providers/voice-provider.js';

export type {
  VoiceAct,
  VoiceAffect,
  VoiceCadence,
  VoiceDeliveryPlan,
  VoiceIntensity,
};

export interface VoiceIdentityContext {
  ageYears: number | null;
  gender: VoiceGender | null;
  relationshipType: VoiceRelationshipType | null;
}

export type VoiceOrigin = 'REGISTERED_CLONE' | 'DESIGNED' | 'SYSTEM';
export type VoiceContinuity = 'SINGLE_TURN' | 'MULTI_TURN';

export const COSYVOICE_MODEL_IDS = [
  'cosyvoice-v3.5-plus',
  'cosyvoice-v3.5-flash',
  'cosyvoice-v3-plus',
  'cosyvoice-v3-flash',
  'cosyvoice-v2',
  'cosyvoice-v1',
] as const;

export type CosyVoiceModelId = (typeof COSYVOICE_MODEL_IDS)[number];

export function parseCosyVoiceModelId(value: unknown): CosyVoiceModelId {
  const normalized = String(value ?? '').trim();
  if (!(COSYVOICE_MODEL_IDS as readonly string[]).includes(normalized)) {
    throw new Error(`Unsupported CosyVoice model: ${normalized || '<empty>'}.`);
  }
  return normalized as CosyVoiceModelId;
}

export type VoiceLanguageHint =
  | 'zh'
  | 'en'
  | 'fr'
  | 'de'
  | 'ja'
  | 'ko'
  | 'ru'
  | 'pt'
  | 'th'
  | 'id'
  | 'vi';

export interface VoiceRuntimeProfile {
  provider: 'ALIYUN_COSYVOICE';
  region: 'cn-beijing' | 'ap-southeast-1';
  modelId: CosyVoiceModelId;
  enrolledForModelId: CosyVoiceModelId;
  voiceId: string;
  origin: VoiceOrigin;
  continuity: VoiceContinuity;
  languageHint?: VoiceLanguageHint;
  audioFormat: 'wav' | 'mp3' | 'pcm';
  sampleRate: 16000 | 22050 | 24000 | 32000 | 44100 | 48000;
}

export function buildRegisteredCloneRuntime(input: {
  storedProvider: unknown;
  storedModel: unknown;
  providerName: unknown;
  providerTargetModel: unknown;
  voiceId: unknown;
  continuity: VoiceContinuity;
  endpoint: unknown;
}): VoiceRuntimeProfile {
  const storedProvider = String(input.storedProvider ?? '').trim().toLowerCase();
  const providerName = String(input.providerName ?? '').trim().toLowerCase();
  if (storedProvider !== 'aliyun-cosyvoice' || providerName !== 'aliyun-cosyvoice') {
    throw new Error(
      `Stable voice provider mismatch: stored=${storedProvider || '<empty>'}, runtime=${providerName || '<empty>'}.`,
    );
  }
  const modelId = parseCosyVoiceModelId(input.storedModel);
  const providerTargetModel = parseCosyVoiceModelId(input.providerTargetModel);
  if (modelId !== providerTargetModel) {
    throw new Error(
      `Stable voice model mismatch: stored=${modelId}, runtime=${providerTargetModel}.`,
    );
  }
  const endpoint = String(input.endpoint ?? '').trim().toLowerCase();
  if (!endpoint) throw new Error('Stable voice endpoint is required.');
  return Object.freeze({
    provider: 'ALIYUN_COSYVOICE',
    region: endpoint.includes('ap-southeast-1') || endpoint.includes('dashscope-intl')
      ? 'ap-southeast-1'
      : 'cn-beijing',
    modelId,
    enrolledForModelId: modelId,
    voiceId: String(input.voiceId ?? '').trim(),
    origin: 'REGISTERED_CLONE',
    continuity: input.continuity,
    languageHint: 'zh',
    audioFormat: 'wav',
    sampleRate: 24000,
  });
}

/**
 * Stable identity is fail-closed. A missing runtime is not permission to use
 * the legacy acting path. Every cloned or multi-turn voice is locked,
 * regardless of age or relationship metadata.
 */
export function shouldLockVoiceIdentity(
  context: VoiceIdentityContext | null | undefined,
  runtime?: Pick<VoiceRuntimeProfile, 'origin' | 'continuity'> | null,
): boolean {
  if (!runtime) return true;
  if (!ORIGINS.has(String(runtime.origin)) || !CONTINUITIES.has(String(runtime.continuity))) {
    return true;
  }
  if (runtime.continuity === 'MULTI_TURN') return true;
  if (runtime.origin === 'REGISTERED_CLONE') return true;
  if (!context) return true;
  if (context.relationshipType === 'SELF') return true;
  if (context.ageYears === null || !Number.isFinite(context.ageYears) || context.ageYears < 0) {
    return true;
  }
  return context.ageYears >= 18;
}

export const VOICE_ACTS = [
  'CASUAL_EXPLAIN',
  'DENY_THEN_EXPLAIN',
  'ASSERT_BOUNDARY',
  'PLAYFUL_PROBE',
  'ADMIT_HURT',
  'EXPRESS_DELIGHT',
  'SHOW_PRACTICAL_CARE',
  'HESITATE_OR_SHY',
  'SPEAK_LOW_ENERGY',
  'SOFTEN_AFTER_TENSION',
] as const satisfies readonly VoiceAct[];

export type StableEmotionMode = 'OFF' | 'SAFE_ONLY' | 'BOUNDED_ALL';
export type InstructionRisk = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type CueCount = 0 | 1 | 2;

export const STABLE_POLICY_VERSION = 'identity-stable-v2' as const;

export function parseStableEmotionMode(value: unknown): StableEmotionMode {
  const normalized = String(value ?? 'OFF').trim().toUpperCase();
  if (normalized === 'OFF' || normalized === 'SAFE_ONLY' || normalized === 'BOUNDED_ALL') {
    return normalized;
  }
  throw new Error(`Unsupported stable emotion mode: ${normalized || '<empty>'}.`);
}

declare const stableInstructionBrand: unique symbol;
export type StableInstruction = string & { readonly [stableInstructionBrand]: true };

interface ActInstructionPolicy {
  readonly risk: InstructionRisk;
  readonly cueCountByRequested: readonly [CueCount, CueCount, CueCount];
  readonly instructionByCueCount: Readonly<Partial<Record<1 | 2, string>>>;
}

const ACT_INSTRUCTION_POLICY: Readonly<Record<VoiceAct, ActInstructionPolicy>> = {
  CASUAL_EXPLAIN: {
    risk: 'NONE',
    cueCountByRequested: [0, 0, 0],
    instructionByCueCount: {},
  },
  DENY_THEN_EXPLAIN: {
    risk: 'MEDIUM',
    cueCountByRequested: [0, 0, 1],
    instructionByCueCount: { 1: '只略重读开头的否认，解释部分照常，句尾平收。' },
  },
  ASSERT_BOUNDARY: {
    risk: 'HIGH',
    cueCountByRequested: [0, 0, 1],
    instructionByCueCount: { 1: '只略重读表达立场的短语，句尾平收，其余照常。' },
  },
  PLAYFUL_PROBE: {
    risk: 'LOW',
    cueCountByRequested: [0, 1, 2],
    instructionByCueCount: {
      1: '问句末尾轻微上扬，不拉长，其余照常。',
      2: '只略重读逗趣的词，问句末尾轻微上扬，不拉长。',
    },
  },
  ADMIT_HURT: {
    risk: 'HIGH',
    cueCountByRequested: [0, 0, 1],
    instructionByCueCount: { 1: '首个分句后短停，后半句平收，其余照常。' },
  },
  EXPRESS_DELIGHT: {
    risk: 'LOW',
    cueCountByRequested: [0, 1, 2],
    instructionByCueCount: {
      1: '句尾轻微上扬，其余照常。',
      2: '只略重读开头一个词，句尾轻微上扬，其余照常。',
    },
  },
  SHOW_PRACTICAL_CARE: {
    risk: 'MEDIUM',
    cueCountByRequested: [0, 0, 1],
    instructionByCueCount: { 1: '问句末尾轻微上扬，提醒句平收，其余照常。' },
  },
  HESITATE_OR_SHY: {
    risk: 'LOW',
    cueCountByRequested: [0, 1, 2],
    instructionByCueCount: {
      1: '第一分句后短停，其余照常。',
      2: '第一分句后短停，句尾轻微上扬但不拉长。',
    },
  },
  SPEAK_LOW_ENERGY: {
    risk: 'HIGH',
    cueCountByRequested: [0, 0, 1],
    instructionByCueCount: { 1: '分句间略作短停，末句收短，其余照常。' },
  },
  SOFTEN_AFTER_TENSION: {
    risk: 'LOW',
    cueCountByRequested: [0, 1, 2],
    instructionByCueCount: {
      1: '后半句重音减弱，句尾平收。',
      2: '前半句照常，后半句重音减弱，句尾平收。',
    },
  },
};

const ALL_ALLOWED_INSTRUCTIONS = new Set<string>(
  Object.values(ACT_INSTRUCTION_POLICY).flatMap((policy) =>
    Object.values(policy.instructionByCueCount).filter(
      (value): value is string => typeof value === 'string',
    ),
  ),
);

const PERSONA_OR_TIMBRE_LEAK =
  /(妈妈|母亲|女儿|爸爸|父亲|儿子|孩子|女孩|男孩|本人|熟人|女性|男性|女声|男声|她|他|\d+\s*岁|音色|声纹|口音|共振|胸腔|鼻腔|低沉|清脆|沙哑|甜美|稚气|浑厚|磁性|哭腔|微颤|颤抖|气息|耳语|大喊|吼叫|委屈|不服气|悲伤|兴奋|愤怒|活泼|温柔|mother|daughter|father|son|child|girl|boy|female|male|timbre|accent|whisper|crying)/iu;

export function cosyVoiceInstructionUnits(input: string): number {
  return [...input].reduce(
    (sum, character) => sum + (/\p{Script=Han}/u.test(character) ? 2 : 1),
    0,
  );
}

function validateStableInstruction(value: string): void {
  if (!ALL_ALLOWED_INSTRUCTIONS.has(value)) {
    throw new Error('Stable voice instruction is not in the static allowlist.');
  }
  if (PERSONA_OR_TIMBRE_LEAK.test(value)) {
    throw new Error('Stable voice instruction leaks persona or timbre wording.');
  }
  if (cosyVoiceInstructionUnits(value) > 100) {
    throw new Error('CosyVoice instruction exceeds the 100-unit limit.');
  }
}

function asStableInstruction(value: string): StableInstruction {
  validateStableInstruction(value);
  return value as StableInstruction;
}

// Fail at module initialization if a future policy edit violates the guardrail.
for (const instruction of ALL_ALLOWED_INSTRUCTIONS) validateStableInstruction(instruction);

const FREE_INSTRUCTION_CAPABILITY: Readonly<
  Record<CosyVoiceModelId, Readonly<Record<VoiceOrigin, boolean>>>
> = {
  'cosyvoice-v3.5-plus': { REGISTERED_CLONE: true, DESIGNED: true, SYSTEM: false },
  'cosyvoice-v3.5-flash': { REGISTERED_CLONE: true, DESIGNED: true, SYSTEM: false },
  'cosyvoice-v3-plus': { REGISTERED_CLONE: false, DESIGNED: false, SYSTEM: false },
  'cosyvoice-v3-flash': { REGISTERED_CLONE: true, DESIGNED: true, SYSTEM: false },
  'cosyvoice-v2': { REGISTERED_CLONE: false, DESIGNED: false, SYSTEM: false },
  'cosyvoice-v1': { REGISTERED_CLONE: false, DESIGNED: false, SYSTEM: false },
};

export interface BoundedEmotionOverlay {
  requestedIntensity: VoiceIntensity;
  appliedCueCount: CueCount;
  risk: InstructionRisk;
  instruction?: StableInstruction;
  reason:
    | 'NO_EMOTION_REQUESTED'
    | 'ACT_USES_TEXT_ONLY'
    | 'POLICY_DISABLED'
    | 'RISK_GATE_BLOCKED'
    | 'MODEL_OR_VOICE_UNSUPPORTED'
    | 'BOUNDED_INSTRUCTION_APPLIED';
}

export function supportsBoundedInstruction(
  runtime: Pick<VoiceRuntimeProfile, 'modelId' | 'origin'>,
): boolean {
  return FREE_INSTRUCTION_CAPABILITY[runtime.modelId]?.[runtime.origin] === true;
}

export function buildBoundedEmotionOverlay(
  delivery: VoiceDeliveryPlan,
  runtime: Pick<VoiceRuntimeProfile, 'modelId' | 'origin'>,
  mode: StableEmotionMode,
): BoundedEmotionOverlay {
  if (mode !== 'OFF' && mode !== 'SAFE_ONLY' && mode !== 'BOUNDED_ALL') {
    throw new Error(`Unsupported stable emotion mode: ${String(mode)}.`);
  }
  const policy = ACT_INSTRUCTION_POLICY[delivery.act];
  if (!policy) throw new Error(`Unsupported VoiceAct: ${String(delivery.act)}.`);
  if (delivery.intensity !== 0 && delivery.intensity !== 1 && delivery.intensity !== 2) {
    throw new Error(`Unsupported voice intensity: ${String(delivery.intensity)}.`);
  }

  const base = {
    requestedIntensity: delivery.intensity,
    appliedCueCount: 0 as const,
    risk: policy.risk,
  };

  if (delivery.intensity === 0) return { ...base, reason: 'NO_EMOTION_REQUESTED' };
  if (policy.risk === 'NONE') return { ...base, reason: 'ACT_USES_TEXT_ONLY' };
  if (mode === 'OFF') return { ...base, reason: 'POLICY_DISABLED' };
  const passesRiskGate = policy.risk === 'LOW'
    || (mode === 'BOUNDED_ALL' && delivery.intensity === 2);
  if (!passesRiskGate) return { ...base, reason: 'RISK_GATE_BLOCKED' };
  if (!supportsBoundedInstruction(runtime)) {
    return { ...base, reason: 'MODEL_OR_VOICE_UNSUPPORTED' };
  }

  const appliedCueCount = policy.cueCountByRequested[delivery.intensity];
  if (appliedCueCount === 0) return { ...base, reason: 'RISK_GATE_BLOCKED' };
  const template = policy.instructionByCueCount[appliedCueCount];
  if (!template) {
    throw new Error(`Missing stable instruction template for ${delivery.act}/${appliedCueCount}.`);
  }

  return {
    requestedIntensity: delivery.intensity,
    appliedCueCount,
    risk: policy.risk,
    instruction: asStableInstruction(template),
    reason: 'BOUNDED_INSTRUCTION_APPLIED',
  };
}

const SSML_TAG =
  /<\/?(?:speak|prosody|break|emphasis|phoneme|say-as|sub|voice)\b[^>]*>/giu;
const PROVIDER_EMOTION_TAG =
  /\[(?:sad|amazed|trembling|angry|excited|sarcastic|curious|bored|tired|scornful|shouting|asmr|panicked|mischievously|empathetic|whispers|reluctantly|crying|serious|gasp|sighing|giggles|laughing|cough|snorts)\]/giu;
const LEADING_STAGE_DIRECTION =
  /^(?:\s*[（(【\[]\s*(?:叹气|笑|哭|停顿|小声|大声|委屈|生气|开心|紧张|疲惫)\s*[）)】\]]\s*)+/u;

export function normalizeStableTtsText(input: unknown): string {
  const text = String(input ?? '')
    .trim()
    .replace(SSML_TAG, '')
    .replace(PROVIDER_EMOTION_TAG, '')
    .replace(LEADING_STAGE_DIRECTION, '')
    .replace(/[!！]{2,}/gu, '！')
    .replace(/[?？]{2,}/gu, '？')
    .replace(/(?:\.{3,}|…{3,})/gu, '……')
    .replace(/[~～]{2,}/gu, '～')
    .trim();
  if (!text) throw new Error('TTS text is empty after stable-voice normalization.');
  return text;
}

const COSYVOICE_MODEL_ID_SET = new Set<string>(COSYVOICE_MODEL_IDS);
const REGIONS = new Set<string>(['cn-beijing', 'ap-southeast-1']);
const ORIGINS = new Set<string>(['REGISTERED_CLONE', 'DESIGNED', 'SYSTEM']);
const CONTINUITIES = new Set<string>(['SINGLE_TURN', 'MULTI_TURN']);
const FORMATS = new Set<string>(['wav', 'mp3', 'pcm']);
const SAMPLE_RATES = new Set<number>([16000, 22050, 24000, 32000, 44100, 48000]);
const LANGUAGE_HINTS = new Set<string>(['zh', 'en', 'fr', 'de', 'ja', 'ko', 'ru', 'pt', 'th', 'id', 'vi']);

function assertVoiceBinding(runtime: VoiceRuntimeProfile): void {
  const raw = runtime as unknown as Record<string, unknown>;
  if (raw.provider !== 'ALIYUN_COSYVOICE') throw new Error('Unsupported stable voice provider.');
  if (!REGIONS.has(String(raw.region))) throw new Error('Unsupported CosyVoice region.');
  if (!COSYVOICE_MODEL_ID_SET.has(String(raw.modelId))) throw new Error('Unsupported CosyVoice model.');
  if (!COSYVOICE_MODEL_ID_SET.has(String(raw.enrolledForModelId))) {
    throw new Error('Unsupported enrolled CosyVoice model.');
  }
  if (typeof raw.voiceId !== 'string' || !raw.voiceId.trim()) {
    throw new Error('voiceId must not be empty.');
  }
  if (raw.voiceId !== raw.voiceId.trim()) throw new Error('voiceId must not contain surrounding whitespace.');
  if (raw.enrolledForModelId !== raw.modelId) {
    throw new Error(
      `Voice/model mismatch: enrolled=${String(raw.enrolledForModelId)}, synthesis=${String(raw.modelId)}.`,
    );
  }
  if (!ORIGINS.has(String(raw.origin))) throw new Error('Unsupported voice origin.');
  if (!CONTINUITIES.has(String(raw.continuity))) throw new Error('Unsupported voice continuity.');
  if (!FORMATS.has(String(raw.audioFormat))) throw new Error('Unsupported stable audio format.');
  if (!SAMPLE_RATES.has(Number(raw.sampleRate))) throw new Error('Unsupported stable sample rate.');
  if (raw.languageHint !== undefined && !LANGUAGE_HINTS.has(String(raw.languageHint))) {
    throw new Error('Unsupported voice language hint.');
  }
}

function buildIdentityFingerprint(
  runtime: VoiceRuntimeProfile,
  mode: StableEmotionMode,
): string {
  const baseline = JSON.stringify({
    provider: runtime.provider,
    region: runtime.region,
    modelId: runtime.modelId,
    enrolledForModelId: runtime.enrolledForModelId,
    voiceId: runtime.voiceId,
    origin: runtime.origin,
    continuity: runtime.continuity,
    languageHint: runtime.languageHint ?? null,
    audioFormat: runtime.audioFormat,
    sampleRate: runtime.sampleRate,
    seed: 0,
    textType: 'PlainText',
    enableSsml: false,
    policyVersion: STABLE_POLICY_VERSION,
    emotionMode: mode,
  });
  let hash = 0x811c9dc5;
  for (const character of baseline) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface StableVoiceSynthesisPlan {
  identityLocked: true;
  identityPolicyVersion: typeof STABLE_POLICY_VERSION;
  identityFingerprint: string;
  text: string;
  instruction?: StableInstruction;
  seed: 0;
  enableSsml: false;
  applyAcousticOverrides: false;
  speechAct: VoiceAct;
  effectiveTone: VoiceAffect;
  requestedEmotionIntensity: VoiceIntensity;
  appliedEmotionCueCount: CueCount;
  instructionRisk: InstructionRisk;
  instructionReason: BoundedEmotionOverlay['reason'];
  rate?: never;
  pitch?: never;
  volume?: never;
}

export interface BuildStableVoicePlanInput {
  text: unknown;
  delivery: VoiceDeliveryPlan;
  runtime: VoiceRuntimeProfile;
  emotionMode?: StableEmotionMode;
}

export function buildIdentityStableVoicePlan(
  input: BuildStableVoicePlanInput,
): StableVoiceSynthesisPlan {
  assertVoiceBinding(input.runtime);
  const emotionMode = input.emotionMode ?? 'OFF';
  const overlay = buildBoundedEmotionOverlay(input.delivery, input.runtime, emotionMode);
  return Object.freeze({
    identityLocked: true,
    identityPolicyVersion: STABLE_POLICY_VERSION,
    identityFingerprint: buildIdentityFingerprint(input.runtime, emotionMode),
    text: normalizeStableTtsText(input.text),
    ...(overlay.instruction ? { instruction: overlay.instruction } : {}),
    seed: 0,
    enableSsml: false,
    applyAcousticOverrides: false,
    speechAct: input.delivery.act,
    effectiveTone: input.delivery.affect,
    requestedEmotionIntensity: input.delivery.intensity,
    appliedEmotionCueCount: overlay.appliedCueCount,
    instructionRisk: overlay.risk,
    instructionReason: overlay.reason,
  });
}

export interface CosyVoiceProviderRequest {
  jobId: string;
  messageId: string;
  model: CosyVoiceModelId;
  voice: string;
  text: string;
  seed: 0;
  textType: 'PlainText';
  enableSsml: false;
  format: VoiceRuntimeProfile['audioFormat'];
  sampleRate: VoiceRuntimeProfile['sampleRate'];
  languageHints?: readonly [VoiceLanguageHint];
  instruction?: StableInstruction;
}

const FORBIDDEN_PROVIDER_KEYS = new Set([
  'rate',
  'pitch',
  'volume',
  'relationshipType',
  'deliveryMode',
  'speechAct',
  'observedBaseline',
  'deliveryPlan',
  'ageYears',
  'gender',
  'effectiveTone',
]);

const ALLOWED_PROVIDER_KEYS = new Set([
  'jobId',
  'messageId',
  'model',
  'voice',
  'text',
  'seed',
  'textType',
  'enableSsml',
  'format',
  'sampleRate',
  'languageHints',
  'instruction',
]);

export function assertIdentityStableProviderPayload(
  payload: CosyVoiceProviderRequest,
): void {
  if (!payload || typeof payload !== 'object') throw new Error('Stable provider payload must be an object.');
  const raw = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_PROVIDER_KEYS.has(key)) {
      throw new Error(`Forbidden identity-stable provider key: ${key}`);
    }
    if (!ALLOWED_PROVIDER_KEYS.has(key)) {
      throw new Error(`Unexpected identity-stable provider key: ${key}`);
    }
  }
  if (typeof raw.jobId !== 'string' || !raw.jobId.trim()) throw new Error('Stable request jobId is required.');
  if (typeof raw.messageId !== 'string' || !raw.messageId.trim()) {
    throw new Error('Stable request messageId is required.');
  }
  if (!COSYVOICE_MODEL_ID_SET.has(String(raw.model))) throw new Error('Unsupported CosyVoice request model.');
  if (typeof raw.voice !== 'string' || !raw.voice.trim()) throw new Error('Stable request voice is required.');
  if (typeof raw.text !== 'string' || !raw.text.trim()) throw new Error('Stable request text is required.');
  if (normalizeStableTtsText(raw.text) !== raw.text) {
    throw new Error('Stable request text must already be normalized.');
  }
  if (payload.seed !== 0) throw new Error('Identity-stable requests must use seed=0.');
  if (payload.enableSsml !== false || payload.textType !== 'PlainText') {
    throw new Error('Identity-stable requests must use PlainText with SSML disabled.');
  }
  if (!FORMATS.has(String(raw.format))) throw new Error('Unsupported stable request format.');
  if (!SAMPLE_RATES.has(Number(raw.sampleRate))) throw new Error('Unsupported stable request sample rate.');
  if (raw.languageHints !== undefined) {
    if (!Array.isArray(raw.languageHints) || raw.languageHints.length !== 1
      || !LANGUAGE_HINTS.has(String(raw.languageHints[0]))) {
      throw new Error('Stable requests accept exactly one supported language hint.');
    }
  }
  if ('instruction' in raw) {
    if (typeof raw.instruction !== 'string' || !raw.instruction.trim()) {
      throw new Error('Omit instruction instead of sending an empty string.');
    }
    validateStableInstruction(raw.instruction);
  }
}

function assertPlanMatchesRuntime(
  runtime: VoiceRuntimeProfile,
  plan: StableVoiceSynthesisPlan,
): void {
  const raw = plan as unknown as Record<string, unknown>;
  if (raw.identityLocked !== true || raw.identityPolicyVersion !== STABLE_POLICY_VERSION) {
    throw new Error('Invalid identity-stable synthesis plan.');
  }
  if (raw.seed !== 0 || raw.enableSsml !== false || raw.applyAcousticOverrides !== false) {
    throw new Error('Stable synthesis plan changed the fixed identity baseline.');
  }
  for (const key of ['rate', 'pitch', 'volume']) {
    if (key in raw) throw new Error(`Forbidden identity-stable plan key: ${key}`);
  }
  if (typeof raw.text !== 'string' || normalizeStableTtsText(raw.text) !== raw.text) {
    throw new Error('Stable synthesis plan text must already be normalized.');
  }
  const fingerprintMatches = (['OFF', 'SAFE_ONLY', 'BOUNDED_ALL'] as const)
    .some((mode) => buildIdentityFingerprint(runtime, mode) === plan.identityFingerprint);
  if (!fingerprintMatches) throw new Error('Stable voice plan/runtime identity mismatch.');
  if (plan.instruction !== undefined) validateStableInstruction(plan.instruction);
}

export function toCosyVoiceProviderRequest(args: {
  jobId: string;
  messageId: string;
  runtime: VoiceRuntimeProfile;
  plan: StableVoiceSynthesisPlan;
}): CosyVoiceProviderRequest {
  assertVoiceBinding(args.runtime);
  assertPlanMatchesRuntime(args.runtime, args.plan);
  const request: CosyVoiceProviderRequest = {
    jobId: args.jobId,
    messageId: args.messageId,
    model: args.runtime.modelId,
    voice: args.runtime.voiceId,
    text: args.plan.text,
    seed: 0,
    textType: 'PlainText',
    enableSsml: false,
    format: args.runtime.audioFormat,
    sampleRate: args.runtime.sampleRate,
    ...(args.runtime.languageHint ? { languageHints: [args.runtime.languageHint] as const } : {}),
    ...(args.plan.instruction ? { instruction: args.plan.instruction } : {}),
  };
  assertIdentityStableProviderPayload(request);
  return Object.freeze(request);
}

export interface PinnedCosyVoiceRoute {
  readonly strategy: 'PINNED_SINGLE';
  readonly provider: 'ALIYUN_COSYVOICE';
  readonly modelId: CosyVoiceModelId;
  readonly voiceId: string;
  readonly allowSelectiveParallel: false;
  readonly allowProviderFallback: false;
  readonly allowModelFallback: false;
}

export function buildPinnedCosyVoiceRoute(
  runtime: VoiceRuntimeProfile,
): PinnedCosyVoiceRoute {
  assertVoiceBinding(runtime);
  return Object.freeze({
    strategy: 'PINNED_SINGLE',
    provider: 'ALIYUN_COSYVOICE',
    modelId: runtime.modelId,
    voiceId: runtime.voiceId,
    allowSelectiveParallel: false,
    allowProviderFallback: false,
    allowModelFallback: false,
  });
}
