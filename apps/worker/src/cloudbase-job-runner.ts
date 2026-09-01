import crypto, { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { evaluateContentSafety, hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import {
  CloudBaseHttpError,
  type CloudBaseRuntimeClient,
  cloudBaseRuntimeFromEnv,
} from '@aivoice/cloudbase-runtime';
import { decryptProviderId, encryptProviderId } from './crypto/provider-id.js';
import { VoiceGenerationCoordinator } from './voice-generation-coordinator.js';
import type { GeneratedVoiceCandidate } from './voice-generation-strategy.js';
import { voiceCompanionBudgetPolicy } from './voice-companion-budget.js';
import { embedAigcMetadata } from './media/aigc.js';
import { extractReference, probeWav } from './media/ffmpeg.js';
import { inspectReferenceQuality, inspectSentenceFinalProsody, ReferenceQualityError, type ReferenceQualityReport } from './media/quality.js';
import { createVoiceProviderRegistry, type VoiceProviderRegistry } from './providers/voice-provider-registry.js';
import { usesReferenceAudio, VoiceGenerationError, type VoiceProviderPort } from './providers/voice-provider.js';
import { buildSpeechSynthesisPlan } from './speech-instruction.js';
import { buildEmotionExpressionPlan } from './emotion-expression.js';
import { observedPersonEvidenceFromQualityReport, persistedPersonCorrectionsFromQualityReport, speechPlanBaselineWithCorrections, voiceObservedDeliveryBaselineWithCorrections } from './observed-person-evidence.js';
import {
  type SpeakerDiarizationReport,
} from './providers/aliyun-speaker-diarization.js';
import {
  createSpeakerAnalysisProviderFromEnv,
  type SpeakerAnalysisProviderPort,
} from './providers/speaker-analysis-provider.js';
import { createChatProviderFromEnv } from './providers/chat-provider-factory.js';
import type { ChatProviderPort } from './providers/chat-provider.js';
import {
  compileVoiceChatMessages,
  relationshipReplyViolation,
  type VoiceChatMessage,
  type VoiceRelationshipType,
} from './chat/voice-chat-context.js';
import {
  legacyCharacterTurnGeneration,
  normalizeInteractionStateDetailed,
  type CharacterTurnGeneration,
  type ConversationInteractionState,
} from './chat/interaction-state.js';
import { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, sanitizeSelfUnsupportedPersonalHistory, sanitizeUnsupportedPresentSceneClaims } from './chat/human-likeness.js';
import { validateQuestionBehavior } from './chat/dialogue-control.js';
import { personalityTurnFocusReplyViolation, resolvedBoundaryReplyViolation } from './chat/personality-turn-focus.js';
import {
  evaluateCharacterGenerationQuality,
  chatTemperatureForFocus,
  GenerationQualityError,
  qualityRetryMessages,
  withOneQualityRetry,
} from './chat/generation-quality.js';

type JobType = 'PROCESS_VOICE' | 'GENERATE_MESSAGE' | 'DELETE_VOICE' | 'DELETE_ACCOUNT';

interface JobRow {
  id: string;
  userId: string;
  voiceProfileId: string | null;
  messageId: string | null;
  type: JobType;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
}

export interface CloudBaseWorkerDependencies {
  runtime?: CloudBaseRuntimeClient;
  voiceProvider?: VoiceProviderPort;
  registeredVoiceProvider?: VoiceProviderPort;
  companionVoiceProviders?: VoiceProviderPort[];
  voiceProviderRegistry?: VoiceProviderRegistry;
  chatProvider?: ChatProviderPort;
  speakerDetector?: SpeakerAnalysisProviderPort;
  temporaryRoot?: string;
}

class ContentBlockedError extends Error {
  constructor(readonly reason: string) {
    super('CONTENT_BLOCKED');
  }
}

function pointCost(): number {
  const value = Number(process.env.GENERATION_POINT_COST || '1');
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('GENERATION_POINT_COST must be a positive integer');
  return value;
}

function one<T>(value: T | T[]): T {
  if (Array.isArray(value)) {
    if (!value[0]) throw new Error('CloudBase RPC returned no row');
    return value[0];
  }
  if (!value) throw new Error('CloudBase RPC returned no row');
  return value;
}

async function sha256(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function slowestStage(stages: Record<string, number>): { slowestStage: string; slowestStageMs: number } {
  return Object.entries(stages).reduce(
    (slowest, [stage, durationMs]) => durationMs > slowest.slowestStageMs
      ? { slowestStage: stage, slowestStageMs: durationMs }
      : slowest,
    { slowestStage: '', slowestStageMs: 0 },
  );
}

export class CloudBaseJobRunner {
  private readonly runtime: CloudBaseRuntimeClient;
  private readonly voiceProviders: VoiceProviderRegistry;
  private readonly voiceProvider: VoiceProviderPort;
  private readonly voiceGenerationCoordinator: VoiceGenerationCoordinator;
  private readonly chatProvider: ChatProviderPort;
  private readonly speakerDetector: SpeakerAnalysisProviderPort;
  private readonly temporaryRoot: string;
  private readonly sourceBucket = process.env.CLOUDBASE_SOURCE_BUCKET || 'aivoice-source';
  private readonly audioBucket = process.env.CLOUDBASE_AUDIO_BUCKET || 'aivoice-audio';
  private readonly generationPointCost = pointCost();
  private readonly workerId = process.env.WORKER_ID || `scf-${randomUUID()}`;

  constructor(dependencies: CloudBaseWorkerDependencies = {}) {
    this.runtime = dependencies.runtime || cloudBaseRuntimeFromEnv();
    this.voiceProviders = dependencies.voiceProviderRegistry || createVoiceProviderRegistry({
      active: dependencies.voiceProvider,
      registered: dependencies.registeredVoiceProvider,
      companions: dependencies.companionVoiceProviders,
    });
    this.voiceProvider = this.voiceProviders.active.provider;
    this.voiceGenerationCoordinator = new VoiceGenerationCoordinator(this.voiceProviders);
    this.chatProvider = dependencies.chatProvider || createChatProviderFromEnv();
    this.speakerDetector = dependencies.speakerDetector || createSpeakerAnalysisProviderFromEnv();
    this.temporaryRoot = path.resolve(dependencies.temporaryRoot || process.env.WORKER_TEMP_ROOT || '/tmp/aivoice');
  }

  private async claim(jobId?: string): Promise<JobRow | null> {
    const result = await this.runtime.rpc<JobRow | JobRow[] | null>('rpc_job_acquire', {
      pWorkerId: this.workerId,
      pJobId: jobId || null,
      pLeaseSeconds: 300,
    });
    if (!result || (Array.isArray(result) && !result[0])) return null;
    return one(result);
  }

  private async heartbeat(jobId: string): Promise<void> {
    await this.runtime.rpc('rpc_job_heartbeat', {
      pJobId: jobId,
      pWorkerId: this.workerId,
      pLeaseSeconds: 300,
    });
  }

  private bucketForObjectKey(objectKey: string): string {
    return objectKey.startsWith('source/') ? this.sourceBucket : this.audioBucket;
  }

  private async download(bucket: string, objectKey: string, targetPath: string): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const signedUrl = await this.runtime.signDownload(bucket, objectKey, 900);
    const response = await fetch(signedUrl, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`CloudBase storage download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body as never), (await import('node:fs')).createWriteStream(targetPath));
  }

  private async deleteObject(bucket: string, objectKey: string): Promise<void> {
    try {
      await this.runtime.deleteObject(bucket, objectKey);
    } catch (error) {
      if (!(error instanceof CloudBaseHttpError) || error.status !== 404) throw error;
    }
  }

  private async processVoice(job: JobRow, workDir: string): Promise<void> {
    if (!job.voiceProfileId) throw new Error('PROCESS_VOICE job has no voice_profile_id');
    await this.runtime.rpc('rpc_voice_processing_started', {
      pJobId: job.id,
      pVoiceId: job.voiceProfileId,
      pWorkerId: this.workerId,
    });
    const input = one(await this.runtime.rpc<{
      jobId: string;
      userId: string;
      voiceId: string;
      clipStartMs: number | null;
      clipEndMs: number | null;
      sourceMediaId: string;
      sourceObjectKey: string;
      sourceMimeType: string;
      ageYears: number | null;
      gender: 'FEMALE' | 'MALE' | null;
      userAgeYears: number | null;
      relationshipType: VoiceRelationshipType | null;
      existingProviderVoiceIdEncrypted: string | null;
      existingProviderStatus: string | null;
    } | Array<never>>('rpc_job_get_voice_input', { pJobId: job.id, pWorkerId: this.workerId }));
    if (input.clipStartMs === null || input.clipEndMs === null) throw new Error('voice source or clip is missing');

    const sourcePath = path.join(workDir, 'source-video');
    const referencePath = path.join(workDir, 'reference.wav');
    const previewPath = path.join(workDir, 'preview.wav');
    await this.download(this.sourceBucket, input.sourceObjectKey, sourcePath);
    await extractReference({
      videoPath: sourcePath,
      outputPath: referencePath,
      startMs: input.clipStartMs,
      endMs: input.clipEndMs,
    });
    const quality = await inspectReferenceQuality(referencePath);
    if (!quality.acceptable && quality.failureCode) throw new ReferenceQualityError(quality.failureCode, quality);
    let qualityReport: ReferenceQualityReport = quality;
    if (process.env.AIVOICE_SPEAKER_DIARIZATION_ENABLED !== 'false') {
      const qualityObjectKey = `quality/${input.userId}/${job.voiceProfileId}/${job.id}.wav`;
      const qualityStoredKey = await this.runtime.uploadFile(this.audioBucket, qualityObjectKey, referencePath, 'audio/wav');
      try {
        const qualityUrl = await this.runtime.signDownload(this.audioBucket, qualityStoredKey, 600);
        const speakerDiarization = await this.speakerDetector.inspect(qualityUrl);
        const sentenceFinalProsody = await inspectSentenceFinalProsody(referencePath, speakerDiarization.segments);
        qualityReport = {
          ...quality,
          acousticEvidence: { ...quality.acousticEvidence!, ...sentenceFinalProsody },
          speakerDiarization,
        };
        if (!speakerDiarization.acceptable && speakerDiarization.failureCode) {
          throw new ReferenceQualityError(speakerDiarization.failureCode, qualityReport);
        }
      } finally {
        await this.deleteObject(this.audioBucket, qualityStoredKey).catch((error) => {
          console.error('speaker diarization temporary object cleanup failed', error);
        });
      }
    }
    const existingProviderVoiceId = input.existingProviderVoiceIdEncrypted
      ? decryptProviderId(input.existingProviderVoiceIdEncrypted)
      : '';

    let providerBinding = '';
    let finalized = false;
    const uploaded: Array<{ bucket: string; key: string }> = [];
    const registeredProvider = this.registeredProvider();
    try {
      const previewText = process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。';
      providerBinding = await registeredProvider.enroll(referencePath, `av${job.voiceProfileId.replaceAll('-', '').slice(0, 8)}`);
      await fs.writeFile(previewPath, await this.voiceProvider.synthesize(
        usesReferenceAudio(this.voiceProvider) ? referencePath : providerBinding,
        previewText,
        {
          jobId: job.id,
          relationshipType: input.relationshipType,
          deliveryMode: 'CASUAL',
          speechAct: 'REPLY',
        },
      ));
      const [referenceProbe, previewProbe, referenceHash, previewHash] = await Promise.all([
        probeWav(referencePath),
        probeWav(previewPath),
        sha256(referencePath),
        sha256(previewPath),
      ]);
      const referenceKey = `reference/${input.userId}/${job.voiceProfileId}.wav`;
      const previewKey = `preview/${input.userId}/${job.voiceProfileId}.wav`;
      const referenceStoredKey = await this.runtime.uploadFile(this.audioBucket, referenceKey, referencePath, 'audio/wav');
      uploaded.push({ bucket: this.audioBucket, key: referenceStoredKey });
      const previewStoredKey = await this.runtime.uploadFile(this.audioBucket, previewKey, previewPath, 'audio/wav');
      uploaded.push({ bucket: this.audioBucket, key: previewStoredKey });
      await this.runtime.rpc('rpc_voice_processing_finalize', {
        pJobId: job.id,
        pWorkerId: this.workerId,
        pUserId: input.userId,
        pVoiceId: job.voiceProfileId,
        pReferenceObjectKey: referenceStoredKey,
        pReferenceBytes: referenceProbe.bytes,
        pReferenceDurationMs: referenceProbe.durationMs,
        pReferenceSha256: referenceHash,
        pPreviewObjectKey: previewStoredKey,
        pPreviewBytes: previewProbe.bytes,
        pPreviewDurationMs: previewProbe.durationMs,
        pPreviewSha256: previewHash,
        pProvider: registeredProvider.providerName || 'aliyun-cosyvoice',
        pTargetModel: registeredProvider.targetModel,
        pProviderVoiceIdEncrypted: encryptProviderId(providerBinding),
        pQualityReport: qualityReport,
      });
      finalized = true;
      await this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId });
      if (existingProviderVoiceId && existingProviderVoiceId !== providerBinding) {
        await this.deleteProviderBinding(existingProviderVoiceId).catch((error) => {
          console.error('previous provider voice cleanup failed after replacement', error);
        });
      }
      await this.deleteObject(this.sourceBucket, input.sourceObjectKey).catch((error) => {
        console.error('source object cleanup failed after voice finalization', error);
      });
    } catch (error) {
      if (!finalized) {
        await Promise.all(uploaded.map((item) => this.deleteObject(item.bucket, item.key).catch(() => undefined)));
        if (providerBinding) await registeredProvider.deleteVoice(providerBinding).catch(() => undefined);
      }
      throw error;
    }
  }

  private async reserveVoiceCompanionBudget(job: JobRow, providerId: string): Promise<boolean> {
    const policy = voiceCompanionBudgetPolicy(providerId);
    if (!policy) return true;
    try {
      const raw = await this.runtime.rpc<{
        allowed: boolean;
        reserved?: boolean;
        idempotent?: boolean;
        used?: number;
        limit?: number;
        windowSize?: number;
      } | Array<{
        allowed: boolean;
        reserved?: boolean;
        idempotent?: boolean;
        used?: number;
        limit?: number;
        windowSize?: number;
      }>>('rpc_voice_companion_budget_reserve_v1', {
        pJobId: job.id,
        pUserId: job.userId,
        pWorkerId: this.workerId,
        pProvider: providerId,
        pWindowSize: policy.windowSize,
        pLimit: policy.limit,
      });
      const decision = one(raw);
      console.info('voice_companion_budget', JSON.stringify({
        event: 'voice_companion_budget', status: decision.idempotent
          ? 'ALREADY_RESERVED'
          : decision.allowed ? (decision.reserved ? 'RESERVED' : 'ALLOWED') : 'DENIED',
        provider: providerId, jobId: job.id, userId: job.userId,
        used: decision.used, limit: policy.limit, windowSize: policy.windowSize,
      }));
      return decision.allowed;
    } catch (error) {
      console.error('voice_companion_budget', JSON.stringify({
        event: 'voice_companion_budget', status: 'FAILED_CLOSED', provider: providerId,
        jobId: job.id, userId: job.userId,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      }));
      return false;
    }
  }

  private async prepareGeneratedAudio(audioPath: string, messageId: string, audio: Buffer): Promise<{
    bytes: number;
    durationMs: number;
    sha256: string;
  }> {
    await fs.writeFile(audioPath, audio);
    await embedAigcMetadata(audioPath, messageId);
    const [probe, hash] = await Promise.all([probeWav(audioPath), sha256(audioPath)]);
    return { bytes: probe.bytes, durationMs: probe.durationMs, sha256: hash };
  }

  private async upgradeReadyMessageAudio(input: {
    job: JobRow;
    audioPath: string;
    objectKey: string;
    candidate: GeneratedVoiceCandidate;
  }): Promise<void> {
    if (!input.job.messageId || !input.job.voiceProfileId) return;
    const prepared = await this.prepareGeneratedAudio(input.audioPath, input.job.messageId, input.candidate.audio);
    const storedObjectKey = await this.runtime.uploadFile(this.audioBucket, input.objectKey, input.audioPath, 'audio/wav');
    await this.runtime.rpc('rpc_message_upgrade_audio_v1', {
      pUserId: input.job.userId,
      pVoiceId: input.job.voiceProfileId,
      pMessageId: input.job.messageId,
      pObjectKey: storedObjectKey,
      pBytes: prepared.bytes,
      pDurationMs: prepared.durationMs,
      pSha256: prepared.sha256,
    });
    console.info('voice_quality_upgrade', JSON.stringify({
      event: 'voice_quality_upgrade',
      status: 'SUCCEEDED',
      messageId: input.job.messageId,
      provider: input.candidate.id,
      providerElapsedMs: input.candidate.elapsedMs,
      durationMs: prepared.durationMs,
      bytes: prepared.bytes,
    }));
  }

  private async generateMessage(job: JobRow, workDir: string): Promise<void> {
    if (!job.messageId || !job.voiceProfileId) throw new Error('GENERATE_MESSAGE job is incomplete');
    const totalStartedAt = Date.now();
    const stages: Record<string, number> = {};
    let activeStage = 'load_input';
    let mode = 'UNKNOWN';
    let outputTextLength = 0;
    let interactionState: ConversationInteractionState | null = null;
    let interactionStateAccepted = true;
    let interactionStateResetReason: string | null = null;
    let interactionStateIssues: string[] = [];
    let softQualitySignals: string[] = [];
    const hardRuleHits: string[] = [];
    let audioDurationMs = 0;
    let audioBytes = 0;
    const measure = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
      activeStage = stage;
      const startedAt = Date.now();
      try {
        return await operation();
      } finally {
        stages[stage] = Date.now() - startedAt;
      }
    };
    try {
      const message = one(await measure('load_input', () => this.runtime.rpc<{
      jobId: string;
      userId: string;
      voiceId: string;
      messageId: string;
      conversationId: string;
      mode: 'CHAT' | 'EXACT_SPEECH';
      inputText: string;
      voiceName: string;
      relationshipType: VoiceRelationshipType | null;
      relationshipLabel: string;
      userAddress: string;
      ageYears: number | null;
      gender: 'FEMALE' | 'MALE' | null;
      userAgeYears: number | null;
      userLifeStage: 'CHILD' | 'TEEN' | 'ADULT' | 'OLDER_ADULT' | null;
      background: string;
      relationshipNote: string;
      personalityNote: string;
      speechHabitNote: string;
      qualityReport: unknown;
      providerVoiceIdEncrypted: string;
      referenceObjectKey: string;
        history: Array<{ messageId?: string; mode: string; inputText: string; outputText: string; interactionState?: unknown }>;
      } | Array<never>>('rpc_job_get_message_input', { pJobId: job.id, pWorkerId: this.workerId })));
      mode = message.mode;
      const providerBinding = decryptProviderId(message.providerVoiceIdEncrypted);
      if (usesReferenceAudio(this.voiceProvider) && !message.referenceObjectKey) {
        throw new VoiceGenerationError(
          'Existing voice has no retained reference audio for Seed Audio use',
          'VOICE_REPROCESS_REQUIRED_FOR_SEED_AUDIO',
        );
      }
      const observedPersonEvidence = observedPersonEvidenceFromQualityReport(message.qualityReport);
      const persistedPersonCorrections = persistedPersonCorrectionsFromQualityReport(message.qualityReport);
      let outputText = message.inputText;
      let speechTone: import('./chat/interaction-state.js').ReplyTone = 'PLAIN';
      let personalityTurnFocus: import('./chat/personality-turn-focus.js').PersonalityTurnFocus | null = null;
      let generationParamsDescriptor = JSON.stringify({ mode: message.mode });
      if (message.mode === 'CHAT') {
        const context = compileVoiceChatMessages({
          structuredOutput: true,
          currentMessageId: message.messageId,
          voiceName: message.voiceName,
          ageYears: message.ageYears,
          gender: message.gender,
          userAgeYears: message.userAgeYears,
          relationshipType: message.relationshipType,
          relationshipLabel: message.relationshipLabel,
          userAddress: message.userAddress,
          userLifeStage: message.userLifeStage,
          background: message.background,
          relationshipNote: message.relationshipNote,
          personalityNote: message.personalityNote,
          speechHabitNote: message.speechHabitNote,
          observedPersonEvidence,
          persistedPersonCorrections,
          history: message.history,
          currentInput: message.inputText,
        });
        const chatTemperature = chatTemperatureForFocus(context.personalityTurnFocus);
        personalityTurnFocus = context.personalityTurnFocus;
        generationParamsDescriptor = JSON.stringify({
          provider: this.chatProvider.providerName || 'dashscope',
          model: this.chatProvider.modelName || process.env.CHAT_MODEL?.trim() || 'qwen3.8-max',
          temperature: chatTemperature,
          enableThinking: false,
          structuredOutput: true,
          maxQualityAttempts: 2,
          historyMessageCount: context.includedMessageIds.length,
        });
        console.info('voice chat context compiled', {
          promptVersion: 'voice-chat-human-v2',
          providerName: this.chatProvider.providerName || 'dashscope',
          modelName: this.chatProvider.modelName || process.env.CHAT_MODEL || 'qwen3.8-max',
          voiceId: message.voiceId,
          conversationId: message.conversationId,
          currentMessageId: message.messageId,
          relationshipType: message.relationshipType,
          historyCount: context.includedMessageIds.length,
          contextHash: context.contextHash,
        });
        let quality;
        try {
          quality = await withOneQualityRetry({
            generate: async (attempt, previousReasons) => {
              const requestMessages = attempt === 1 ? context.messages : qualityRetryMessages(context.messages, previousReasons);
              const providerResult = await measure(attempt === 1 ? 'chat_reply' : 'chat_reply_retry', () => this.chatProvider.reply(requestMessages, {
                maxAttempts: 1,
                temperature: chatTemperature,
              }));
              return typeof providerResult === 'string' ? legacyCharacterTurnGeneration(providerResult) : providerResult;
            },
            evaluate: (generation) => evaluateCharacterGenerationQuality({
              generation,
              currentUserText: message.inputText,
              relationshipType: message.relationshipType,
              subjectBackground: message.background || null,
              recentUserInputs: message.history.map((row) => row.inputText),
              recentCharacterReplies: message.history.map((row) => row.outputText).filter(Boolean),
              currentTurn: context.currentTurn,
              recentTurns: context.recentTurns,
              previousState: context.previousInteractionState,
              control: context.runtimeDialogueControl,
              personalityTurnFocus: context.personalityTurnFocus,
              profile: {
                personalityNote: message.personalityNote || null,
                speechHabitNote: message.speechHabitNote || null,
                relationshipNote: message.relationshipNote || null,
              },
            }),
            onRetry: (reasons) => console.info('character_generation_quality_retry', JSON.stringify({
              event: 'character_generation_quality_retry', messageId: message.messageId, attempt: 2, reasons,
            })),
          });
        } catch (error) {
          if (error instanceof GenerationQualityError) {
            const reason = error.reasons[0] || 'GENERATION_QUALITY_REJECTED';
            hardRuleHits.push(reason);
            throw new ContentBlockedError(reason);
          }
          throw error;
        }
        outputText = quality.outputText;
        speechTone = quality.replyTone;
        interactionState = quality.interactionState;
        interactionStateAccepted = quality.interactionStateAccepted;
        interactionStateResetReason = quality.interactionStateResetReason;
        interactionStateIssues = quality.interactionStateIssues;
        softQualitySignals = quality.qualitySignals;
        console.info('character_generation_quality', JSON.stringify({
          event: 'character_generation_quality', promptVersion: 'voice-chat-human-v2', personaVersion: 'explicit-persona-v1',
          provider: this.chatProvider.providerName || 'dashscope',
          model: this.chatProvider.modelName || process.env.CHAT_MODEL || 'qwen3.8-max', parsedSuccessfully: true,
          hardRuleHits: [], softQualitySignals, interactionStateAccepted, interactionStateResetReason,
          interactionStateIssues, qualityAttemptCount: quality.attemptCount, firstAttemptReasons: quality.firstAttemptReasons,
          replyLength: Array.from(outputText).length,
        }));
      } else {
        stages.chat_reply = 0;
      }
      outputTextLength = Array.from(outputText).length;
      await measure('content_safety', async () => {
        const safety = evaluateContentSafety(outputText);
        if (!safety.safe) throw new ContentBlockedError(safety.reason || 'OUTPUT_CONTENT_BLOCKED');
      });
      if (message.mode === 'CHAT') {
        await measure('publish_text', () => this.runtime.rpc('rpc_message_publish_text_v2', {
          pJobId: job.id,
          pWorkerId: this.workerId,
          pUserId: job.userId,
          pMessageId: job.messageId,
          pOutputText: outputText,
          pInteractionState: interactionState || {},
        }));
      } else {
        stages.publish_text = 0;
      }
      const audioPath = path.join(workDir, 'generated.wav');
      const emotionExpression = buildEmotionExpressionPlan({
        replyTone: speechTone,
        text: outputText,
        interactionState,
        personalityNote: message.personalityNote,
        personalityTurnFocus,
      });
      const speechBaseline = speechPlanBaselineWithCorrections(observedPersonEvidence, message.qualityReport);
      const voiceObservedBaseline = voiceObservedDeliveryBaselineWithCorrections(observedPersonEvidence, message.qualityReport);
      const speechPlan = buildSpeechSynthesisPlan(
        speechTone,
        outputText,
        speechBaseline,
        emotionExpression,
      );
      const synthesisOptions = {
          jobId: job.id,
          messageId: job.messageId || '',
          instruction: speechPlan.instruction,
          rate: speechPlan.rate,
          pitch: speechPlan.pitch,
          volume: speechPlan.volume,
          enableSsml: speechPlan.enableSsml,
          relationshipType: message.relationshipType,
          deliveryMode: emotionExpression.deliveryMode,
          speechAct: emotionExpression.speechAct,
          observedBaseline: voiceObservedBaseline,
      };
      const referencePath = path.join(workDir, 'reference.wav');
      const generationSession = await measure('voice_generation_primary', () => this.voiceGenerationCoordinator.generate({
        mode: message.mode,
        visibleText: outputText,
        synthesisText: speechPlan.text,
        expression: emotionExpression,
        registeredBinding: providerBinding,
        resolveReference: async () => {
          const downloadStartedAt = Date.now();
          await this.download(this.audioBucket, message.referenceObjectKey, referencePath);
          stages.download_reference = Date.now() - downloadStartedAt;
          return referencePath;
        },
        options: synthesisOptions,
        allowCompanion: (provider) => this.reserveVoiceCompanionBudget(job, provider.id),
      }));
      const primaryCandidate = generationSession.primary;
      const audio = primaryCandidate.audio;
      await measure('write_audio', () => fs.writeFile(audioPath, audio));
      await measure('embed_metadata', () => embedAigcMetadata(audioPath, job.messageId || ''));
      const [probe, hash] = await measure('inspect_audio', () => Promise.all([probeWav(audioPath), sha256(audioPath)]));
      audioDurationMs = probe.durationMs;
      audioBytes = probe.bytes;
      const objectKey = `generated/${job.userId}/${job.voiceProfileId}/${job.messageId}.wav`;
      const storedObjectKey = await measure('upload_audio', () => this.runtime.uploadFile(this.audioBucket, objectKey, audioPath, 'audio/wav'));
      let completed = false;
      try {
        await measure('complete_message', () => this.runtime.rpc('rpc_message_complete_success_v2', {
          pUserId: job.userId,
          pVoiceId: job.voiceProfileId,
          pMessageId: job.messageId,
          pOutputText: outputText,
          pGenerationCost: this.generationPointCost,
          pObjectKey: storedObjectKey,
          pMimeType: 'audio/wav',
          pBytes: probe.bytes,
          pDurationMs: probe.durationMs,
          pSha256: hash,
          pInteractionState: interactionState || {},
        }));
        completed = true;
        await measure('mark_job_succeeded', () => this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId }));
        const primaryReadyMs = Date.now() - totalStartedAt;
        const upgrade = await generationSession.bestUpgrade;
        if (upgrade) {
            await this.upgradeReadyMessageAudio({ job, audioPath, objectKey: storedObjectKey, candidate: upgrade }).catch((error) => {
              console.error('voice_quality_upgrade', JSON.stringify({
                event: 'voice_quality_upgrade', status: 'FAILED', messageId: job.messageId,
                error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
              }));
            });
        } else {
            console.info('voice_quality_upgrade', JSON.stringify({
              event: 'voice_quality_upgrade', status: 'NO_HIGHER_QUALITY_RESULT', messageId: job.messageId,
            }));
        }
        stages.primary_ready = primaryReadyMs;
      } catch (error) {
        if (!completed) await this.deleteObject(this.audioBucket, storedObjectKey).catch(() => undefined);
        throw error;
      }
      console.info('message_generation_timing', JSON.stringify({
        event: 'message_generation_timing',
        status: 'SUCCEEDED',
        jobId: job.id,
        messageId: job.messageId,
        mode,
        attempt: job.attempts,
        promptVersion: 'voice-chat-human-v2',
        personaVersion: 'explicit-persona-v1',
        generationParamsHash: crypto.createHash('sha256').update(generationParamsDescriptor).digest('hex'),
        parsedSuccessfully: true,
        hardRuleHits,
        softQualitySignals,
        interactionStateAccepted,
        interactionStateResetReason,
        interactionStateIssues,
        replyLength: outputTextLength,
        outputTextLength,
        audioDurationMs,
        audioBytes,
        stages,
        ...slowestStage(stages),
        totalMs: Date.now() - totalStartedAt,
        overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
      }));
    } catch (error) {
      if (error instanceof Error) {
        Object.assign(error, { generationStage: activeStage, generationStages: { ...stages } });
      }
      console.error('message_generation_timing', JSON.stringify({
        event: 'message_generation_timing',
        status: 'FAILED',
        jobId: job.id,
        messageId: job.messageId,
        mode,
        attempt: job.attempts,
        failedStage: activeStage,
        outputTextLength,
        audioDurationMs,
        audioBytes,
        stages,
        ...slowestStage(stages),
        totalMs: Date.now() - totalStartedAt,
        overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      }));
      throw error;
    }
  }

  private registeredProvider(): VoiceProviderPort {
    return this.voiceProviders.registered.provider;
  }

  private async deleteProviderBinding(providerBinding: string): Promise<void> {
    if (!providerBinding || providerBinding.startsWith('reference/')) return;
    await this.registeredProvider().deleteVoice(providerBinding);
  }

  private async deleteVoice(job: JobRow): Promise<void> {
    if (!job.voiceProfileId) throw new Error('DELETE_VOICE job has no voice_profile_id');
    const manifest = one(await this.runtime.rpc<{
      models: Array<{ providerVoiceIdEncrypted: string; status: string }>;
      assets: Array<{ objectKey: string; status: string }>;
    } | Array<never>>('rpc_job_get_delete_manifest', { pJobId: job.id, pWorkerId: this.workerId }));
    for (const model of manifest.models) {
      if (model.status !== 'DELETED') await this.deleteProviderBinding(decryptProviderId(model.providerVoiceIdEncrypted));
    }
    for (const asset of manifest.assets) await this.deleteObject(this.bucketForObjectKey(asset.objectKey), asset.objectKey);
    await this.runtime.rpc('rpc_voice_delete_finalize', {
      pJobId: job.id, pWorkerId: this.workerId, pUserId: job.userId, pVoiceId: job.voiceProfileId,
    });
    await this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId });
  }

  private async deleteAccount(job: JobRow): Promise<void> {
    const manifest = one(await this.runtime.rpc<{
      models: Array<{ providerVoiceIdEncrypted: string; status: string }>;
      assets: Array<{ objectKey: string; status: string }>;
    } | Array<never>>('rpc_job_get_delete_manifest', { pJobId: job.id, pWorkerId: this.workerId }));
    for (const model of manifest.models) {
      if (model.status !== 'DELETED') await this.deleteProviderBinding(decryptProviderId(model.providerVoiceIdEncrypted));
    }
    for (const asset of manifest.assets) await this.deleteObject(this.bucketForObjectKey(asset.objectKey), asset.objectKey);
    await this.runtime.rpc('rpc_account_delete_finalize', {
      pJobId: job.id, pWorkerId: this.workerId, pUserId: job.userId,
    });
    await this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId });
  }

  private async execute(job: JobRow, workDir: string): Promise<void> {
    if (job.type === 'PROCESS_VOICE') return this.processVoice(job, workDir);
    if (job.type === 'GENERATE_MESSAGE') return this.generateMessage(job, workDir);
    if (job.type === 'DELETE_VOICE') return this.deleteVoice(job);
    if (job.type === 'DELETE_ACCOUNT') return this.deleteAccount(job);
    throw new Error(`job type not implemented: ${job.type}`);
  }

  async runJob(jobId?: string): Promise<{ jobId: string; status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED' }> {
    if (jobId && !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('jobId must be a UUID');
    const job = await this.claim(jobId);
    if (!job) return { jobId: jobId || '', status: 'SKIPPED' };
    const workDir = path.join(this.temporaryRoot, job.id);
    await fs.mkdir(workDir, { recursive: true });
    const heartbeatMs = Math.max(5_000, Number(process.env.WORKER_HEARTBEAT_MS || 60_000));
    const timer = setInterval(() => void this.heartbeat(job.id).catch((error) => console.error('worker heartbeat failed', error)), heartbeatMs);
    timer.unref();
    try {
      await this.execute(job, workDir);
      return { jobId: job.id, status: 'SUCCEEDED' };
    } catch (error) {
      if (error instanceof ContentBlockedError) {
        if (job.messageId) {
          await this.runtime.rpc('rpc_message_complete_blocked', {
            pUserId: job.userId,
            pMessageId: job.messageId,
            pReason: error.reason,
          });
        }
        await this.runtime.rpc('rpc_job_mark_failed_or_retry', {
          pJobId: job.id,
          pWorkerId: this.workerId,
          pErrorCode: 'CONTENT_BLOCKED',
          pErrorMessage: error.reason,
          pRetryable: false,
          pRetryDelaySeconds: 10,
        });
        return { jobId: job.id, status: 'BLOCKED' };
      }
      const message = error instanceof Error ? error.message : String(error);
      const quality = error instanceof ReferenceQualityError ? error : null;
      const voiceGenerationError = error instanceof VoiceGenerationError ? error : null;
      const generationStage = job.type === 'GENERATE_MESSAGE'
        ? String((error as Error & { generationStage?: string })?.generationStage || '')
        : '';
      const generationErrorCode = generationStage
        ? `MESSAGE_${generationStage.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_FAILED`.slice(0, 100)
        : 'JOB_FAILED';
      const terminal = Boolean(quality) || error instanceof VoiceGenerationError || job.attempts >= job.maxAttempts;
      if (terminal && job.messageId && job.type === 'GENERATE_MESSAGE') {
        await this.runtime.rpc('rpc_message_complete_failure', {
          pUserId: job.userId,
          pMessageId: job.messageId,
          pErrorCode: quality?.code || voiceGenerationError?.code || generationErrorCode,
          pErrorMessage: message.slice(0, 500),
        });
      }
      await this.runtime.rpc('rpc_job_mark_failed_or_retry', {
        pJobId: job.id,
        pWorkerId: this.workerId,
        pErrorCode: quality?.code || voiceGenerationError?.code || generationErrorCode,
        pErrorMessage: message.slice(0, 1000),
        pRetryable: !terminal,
        pRetryDelaySeconds: 10,
      });
      return { jobId: job.id, status: 'FAILED' };
    } finally {
      clearInterval(timer);
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}
