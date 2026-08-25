import crypto, { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { evaluateContentSafety } from '@aivoice/contracts';
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
  type VoiceChatMessage,
  type VoiceRelationshipType,
} from './chat/voice-chat-context.js';

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
  synthesize(voiceId: string, text: string): Promise<Buffer>;
  deleteVoice(voiceId: string): Promise<void>;
}

interface ChatProviderPort {
  reply(messages: VoiceChatMessage[]): Promise<string>;
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
      await this.runtime.uploadFile(this.audioBucket, qualityObjectKey, referencePath, 'audio/wav');
      try {
        const qualityUrl = await this.runtime.signDownload(this.audioBucket, qualityObjectKey, 600);
        const speakerDiarization = await this.speakerDetector.inspect(qualityUrl);
        qualityReport = { ...quality, speakerDiarization };
        if (!speakerDiarization.acceptable && speakerDiarization.failureCode) {
          throw new ReferenceQualityError(speakerDiarization.failureCode, qualityReport);
        }
      } finally {
        await this.deleteObject(this.audioBucket, qualityObjectKey).catch((error) => {
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
      await this.runtime.uploadFile(this.audioBucket, referenceKey, referencePath, 'audio/wav');
      uploaded.push({ bucket: this.audioBucket, key: referenceKey });
      await this.runtime.uploadFile(this.audioBucket, previewKey, previewPath, 'audio/wav');
      uploaded.push({ bucket: this.audioBucket, key: previewKey });
      await this.runtime.rpc('rpc_voice_processing_finalize', {
        pJobId: job.id,
        pWorkerId: this.workerId,
        pUserId: input.userId,
        pVoiceId: job.voiceProfileId,
        pReferenceObjectKey: referenceKey,
        pReferenceBytes: referenceProbe.bytes,
        pReferenceDurationMs: referenceProbe.durationMs,
        pReferenceSha256: referenceHash,
        pPreviewObjectKey: previewKey,
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
    const message = one(await this.runtime.rpc<{
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
      providerVoiceIdEncrypted: string;
      history: Array<{ messageId?: string; mode: string; inputText: string; outputText: string }>;
    } | Array<never>>('rpc_job_get_message_input', { pJobId: job.id, pWorkerId: this.workerId }));
    let outputText = message.inputText;
    if (message.mode === 'CHAT') {
      const context = compileVoiceChatMessages({
        voiceName: message.voiceName,
        relationshipType: message.relationshipType,
        relationshipLabel: message.relationshipLabel,
        userAddress: message.userAddress,
        history: message.history,
        currentInput: message.inputText,
      });
      console.info('voice chat context compiled', {
        promptVersion: 'voice-chat-context-v1',
        modelName: process.env.CHAT_MODEL || 'qwen3.8-max',
        voiceId: message.voiceId,
        conversationId: message.conversationId,
        currentMessageId: message.messageId,
        relationshipType: message.relationshipType,
        historyCount: context.includedMessageIds.length,
        contextHash: context.contextHash,
      });
      outputText = await this.chatProvider.reply(context.messages);
    }
    const safety = evaluateContentSafety(outputText);
    if (!safety.safe) throw new ContentBlockedError(safety.reason || 'OUTPUT_CONTENT_BLOCKED');
    const audioPath = path.join(workDir, 'generated.wav');
    await fs.writeFile(audioPath, await this.voiceProvider.synthesize(decryptProviderId(message.providerVoiceIdEncrypted), outputText));
    await embedAigcMetadata(audioPath, job.messageId);
    const [probe, hash] = await Promise.all([probeWav(audioPath), sha256(audioPath)]);
    const objectKey = `generated/${job.userId}/${job.voiceProfileId}/${job.messageId}.wav`;
    await this.runtime.uploadFile(this.audioBucket, objectKey, audioPath, 'audio/wav');
    let completed = false;
    try {
      await this.runtime.rpc('rpc_message_complete_success', {
        pUserId: job.userId,
        pVoiceId: job.voiceProfileId,
        pMessageId: job.messageId,
        pOutputText: outputText,
        pGenerationCost: this.generationPointCost,
        pObjectKey: objectKey,
        pMimeType: 'audio/wav',
        pBytes: probe.bytes,
        pDurationMs: probe.durationMs,
        pSha256: hash,
      });
      completed = true;
      await this.runtime.rpc('rpc_job_mark_succeeded', { pJobId: job.id, pWorkerId: this.workerId });
    } catch (error) {
      if (!completed) await this.deleteObject(this.audioBucket, objectKey).catch(() => undefined);
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
      const terminal = Boolean(quality) || job.attempts >= job.maxAttempts;
      if (terminal && job.messageId && job.type === 'GENERATE_MESSAGE') {
        await this.runtime.rpc('rpc_message_complete_failure', {
          pUserId: job.userId,
          pMessageId: job.messageId,
          pErrorCode: quality?.code || 'PROVIDER_FAILED',
          pErrorMessage: message.slice(0, 500),
        });
      }
      await this.runtime.rpc('rpc_job_mark_failed_or_retry', {
        pJobId: job.id,
        pWorkerId: this.workerId,
        pErrorCode: quality?.code || 'JOB_FAILED',
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
