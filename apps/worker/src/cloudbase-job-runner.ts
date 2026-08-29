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
import { embedAigcMetadata } from './media/aigc.js';
import { extractReference, probeWav } from './media/ffmpeg.js';
import { inspectReferenceQuality, ReferenceQualityError, type ReferenceQualityReport } from './media/quality.js';
import { AliyunCosyVoiceProvider } from './providers/aliyun-cosyvoice.js';
import {
  AliyunSpeakerDiarizationProvider,
  type SpeakerDiarizationReport,
} from './providers/aliyun-speaker-diarization.js';
import { DashscopeChatProvider } from './providers/dashscope-chat.js';
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
import { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, sanitizeSelfUnsupportedPersonalHistory } from './chat/human-likeness.js';
import { validateQuestionBehavior } from './chat/dialogue-control.js';

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

interface VoiceProviderPort {
  readonly targetModel: string;
  enroll(referencePath: string, prefix: string): Promise<string>;
  synthesize(voiceId: string, text: string, correlation?: { jobId?: string; messageId?: string }): Promise<Buffer>;
  deleteVoice(voiceId: string): Promise<void>;
}

interface ChatProviderPort {
  reply(messages: VoiceChatMessage[]): Promise<string | CharacterTurnGeneration>;
}

interface SpeakerDiarizationPort {
  inspect(fileUrl: string): Promise<SpeakerDiarizationReport>;
}

export interface CloudBaseWorkerDependencies {
  runtime?: CloudBaseRuntimeClient;
  voiceProvider?: VoiceProviderPort;
  chatProvider?: ChatProviderPort;
  speakerDetector?: SpeakerDiarizationPort;
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
  private readonly voiceProvider: VoiceProviderPort;
  private readonly chatProvider: ChatProviderPort;
  private readonly speakerDetector: SpeakerDiarizationPort;
  private readonly temporaryRoot: string;
  private readonly sourceBucket = process.env.CLOUDBASE_SOURCE_BUCKET || 'aivoice-source';
  private readonly audioBucket = process.env.CLOUDBASE_AUDIO_BUCKET || 'aivoice-audio';
  private readonly generationPointCost = pointCost();
  private readonly workerId = process.env.WORKER_ID || `scf-${randomUUID()}`;

  constructor(dependencies: CloudBaseWorkerDependencies = {}) {
    this.runtime = dependencies.runtime || cloudBaseRuntimeFromEnv();
    this.voiceProvider = dependencies.voiceProvider || new AliyunCosyVoiceProvider();
    this.chatProvider = dependencies.chatProvider || new DashscopeChatProvider();
    this.speakerDetector = dependencies.speakerDetector || new AliyunSpeakerDiarizationProvider();
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
        qualityReport = { ...quality, speakerDiarization };
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

    let providerVoiceId = '';
    let finalized = false;
    const uploaded: Array<{ bucket: string; key: string }> = [];
    try {
      providerVoiceId = await this.voiceProvider.enroll(referencePath, `av${job.voiceProfileId.replaceAll('-', '').slice(0, 8)}`);
      const previewText = process.env.VOICE_PREVIEW_TEXT || '你好，好久不见。愿你今天也有一个温暖的好心情。';
      await fs.writeFile(previewPath, await this.voiceProvider.synthesize(providerVoiceId, previewText));
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
        pProvider: 'aliyun-cosyvoice',
        pTargetModel: this.voiceProvider.targetModel,
        pProviderVoiceIdEncrypted: encryptProviderId(providerVoiceId),
        pQualityReport: qualityReport,
      });
      finalized = true;
      await this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId });
      if (existingProviderVoiceId && existingProviderVoiceId !== providerVoiceId) {
        await this.voiceProvider.deleteVoice(existingProviderVoiceId).catch((error) => {
          console.error('previous provider voice cleanup failed after replacement', error);
        });
      }
      await this.deleteObject(this.sourceBucket, input.sourceObjectKey).catch((error) => {
        console.error('source object cleanup failed after voice finalization', error);
      });
    } catch (error) {
      if (!finalized) {
        await Promise.all(uploaded.map((item) => this.deleteObject(item.bucket, item.key).catch(() => undefined)));
        if (providerVoiceId) await this.voiceProvider.deleteVoice(providerVoiceId).catch(() => undefined);
      }
      throw error;
    }
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
      providerVoiceIdEncrypted: string;
        history: Array<{ messageId?: string; mode: string; inputText: string; outputText: string; interactionState?: unknown }>;
      } | Array<never>>('rpc_job_get_message_input', { pJobId: job.id, pWorkerId: this.workerId })));
      mode = message.mode;
      let outputText = message.inputText;
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
          history: message.history,
          currentInput: message.inputText,
        });
        console.info('voice chat context compiled', {
          promptVersion: 'voice-chat-human-v2',
          modelName: process.env.CHAT_MODEL || 'qwen3.8-max',
          voiceId: message.voiceId,
          conversationId: message.conversationId,
          currentMessageId: message.messageId,
          relationshipType: message.relationshipType,
          historyCount: context.includedMessageIds.length,
          contextHash: context.contextHash,
        });
        const providerResult = await measure('chat_reply', () => this.chatProvider.reply(context.messages));
        const generation = typeof providerResult === 'string' ? legacyCharacterTurnGeneration(providerResult) : providerResult;
        const selfHistorySanitization = sanitizeSelfUnsupportedPersonalHistory({
          relationshipType: message.relationshipType,
          reply: generation.reply,
          currentUserText: message.inputText,
          recentUserInputs: message.history.map((row) => row.inputText),
          subjectBackground: message.background || null,
        });
        outputText = selfHistorySanitization.reply;
        const normalizedState = normalizeInteractionStateDetailed({
          candidate: generation.interactionState,
          replyTone: generation.replyTone,
          reply: outputText,
          currentTurn: context.currentTurn,
          recentTurns: context.recentTurns,
          previousState: context.previousInteractionState,
          control: context.runtimeDialogueControl,
          profile: {
            personalityNote: message.personalityNote || null,
            speechHabitNote: message.speechHabitNote || null,
            relationshipNote: message.relationshipNote || null,
          },
        });
        interactionState = normalizedState.state;
        interactionStateAccepted = normalizedState.accepted;
        interactionStateResetReason = normalizedState.resetReason;
        interactionStateIssues = normalizedState.issues;
        const controlViolation = normalizedState.issues.find((issue) => ['ACTION_STANCE_NOT_ALLOWED', 'REQUEST_ONLY_STANCE_UNDER_FORCE_NONE', 'FORCED_REQUEST_STANCE_INVALID'].includes(issue));
        if (controlViolation) {
          hardRuleHits.push(controlViolation);
          throw new ContentBlockedError(controlViolation);
        }
        const questionIssues = validateQuestionBehavior(outputText, normalizedState.state.action, context.runtimeDialogueControl);
        softQualitySignals = [
          ...assessHumanLikenessSignals(outputText, message.history.map((row) => row.outputText).filter(Boolean)),
          ...normalizedState.qualityFlags,
          ...(selfHistorySanitization.removed ? ['SELF_UNSUPPORTED_PERSONAL_HISTORY_REMOVED'] : []),
          ...questionIssues,
        ];
        const leakViolation = hardReplyLeak(outputText);
        if (leakViolation) {
          hardRuleHits.push(leakViolation);
          throw new ContentBlockedError(leakViolation);
        }
        const relationshipViolation = relationshipReplyViolation({ relationshipType: message.relationshipType, reply: outputText });
        if (relationshipViolation) {
          hardRuleHits.push(relationshipViolation);
          throw new ContentBlockedError(relationshipViolation);
        }
        if (detectSpeakerFactOwnershipViolation({
          currentUserText: message.inputText,
          reply: outputText,
          subjectBackground: message.background || null,
          recentCharacterReplies: message.history.map((row) => row.outputText).filter(Boolean),
        })) {
          hardRuleHits.push('SPEAKER_FACT_OWNERSHIP_VIOLATION');
          throw new ContentBlockedError('SPEAKER_FACT_OWNERSHIP_VIOLATION');
        }
        if (questionIssues.length) {
          hardRuleHits.push(questionIssues[0]);
          throw new ContentBlockedError(questionIssues[0]);
        }
        if (hasForbiddenAssistantIdentityDisclosure(outputText)) {
          hardRuleHits.push('IDENTITY_DISCLOSURE_BLOCKED');
          throw new ContentBlockedError('IDENTITY_DISCLOSURE_BLOCKED');
        }
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
      const audio = await measure('voice_synthesis_download', () => this.voiceProvider.synthesize(
        decryptProviderId(message.providerVoiceIdEncrypted),
        outputText,
        { jobId: job.id, messageId: job.messageId || '' },
      ));
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
        generationParamsHash: crypto.createHash('sha256').update('qwen3.8-max|temperature=0.8|max=320|thinking=false|history=8').digest('hex'),
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

  private async deleteVoice(job: JobRow): Promise<void> {
    if (!job.voiceProfileId) throw new Error('DELETE_VOICE job has no voice_profile_id');
    const manifest = one(await this.runtime.rpc<{
      models: Array<{ providerVoiceIdEncrypted: string; status: string }>;
      assets: Array<{ objectKey: string; status: string }>;
    } | Array<never>>('rpc_job_get_delete_manifest', { pJobId: job.id, pWorkerId: this.workerId }));
    for (const model of manifest.models) {
      if (model.status !== 'DELETED') await this.voiceProvider.deleteVoice(decryptProviderId(model.providerVoiceIdEncrypted));
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
      if (model.status !== 'DELETED') await this.voiceProvider.deleteVoice(decryptProviderId(model.providerVoiceIdEncrypted));
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
      const generationStage = job.type === 'GENERATE_MESSAGE'
        ? String((error as Error & { generationStage?: string })?.generationStage || '')
        : '';
      const generationErrorCode = generationStage
        ? `MESSAGE_${generationStage.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_FAILED`.slice(0, 100)
        : 'JOB_FAILED';
      const terminal = Boolean(quality) || job.attempts >= job.maxAttempts;
      if (terminal && job.messageId && job.type === 'GENERATE_MESSAGE') {
        await this.runtime.rpc('rpc_message_complete_failure', {
          pUserId: job.userId,
          pMessageId: job.messageId,
          pErrorCode: quality?.code || generationErrorCode,
          pErrorMessage: message.slice(0, 500),
        });
      }
      await this.runtime.rpc('rpc_job_mark_failed_or_retry', {
        pJobId: job.id,
        pWorkerId: this.workerId,
        pErrorCode: quality?.code || generationErrorCode,
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
