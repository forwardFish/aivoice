import { CloudBaseJobRunner, type CloudBaseWorkerDependencies } from './cloudbase-job-runner.js';
import { cloudBaseRuntimeFromEnv } from '@aivoice/cloudbase-runtime';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export interface WorkerFunctionEvent {
  jobId?: string;
  job_id?: string;
  Records?: Array<{
    cos?: { cosObject?: { key?: string; url?: string } };
  }>;
  data?: { objectKey?: string; object?: { key?: string } };
}

export function jobIdFromEvent(event: WorkerFunctionEvent): string {
  const direct = String(event?.jobId || event?.job_id || '').trim();
  if (direct) return direct;
  const objectKey = event?.Records?.[0]?.cos?.cosObject?.key
    || event?.Records?.[0]?.cos?.cosObject?.url
    || event?.data?.objectKey
    || event?.data?.object?.key
    || '';
  const decoded = decodeURIComponent(String(objectKey).replaceAll('+', ' '));
  return decoded.match(/job-events\/([0-9a-f-]{36})\.json(?:$|\?)/i)?.[1] || '';
}

async function ensureFfmpeg(runtime: ReturnType<typeof cloudBaseRuntimeFromEnv>): Promise<void> {
  const objectKey = process.env.CLOUDBASE_FFMPEG_OBJECT_KEY || '';
  const target = process.env.FFMPEG_PATH || '/tmp/aivoice-bin/ffmpeg';
  if (!objectKey) {
    const bundled = process.env.BUNDLED_FFMPEG_PATH || '';
    if (!bundled) return;
    try {
      await fs.access(target);
    } catch {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(bundled, target);
      await fs.chmod(target, 0o755);
    }
    return;
  }
  try {
    await fs.access(target);
    return;
  } catch {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const signedUrl = await runtime.signDownload(
      process.env.CLOUDBASE_RUNTIME_BUCKET || 'aivoice-runtime',
      objectKey,
      900,
    );
    const response = await fetch(signedUrl, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok || !response.body) throw new Error(`FFmpeg runtime download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body as never), createGunzip(), createWriteStream(target));
    await fs.chmod(target, 0o755);
  }
}

export async function handleWorkerEvent(
  event: WorkerFunctionEvent,
  dependencies: CloudBaseWorkerDependencies = {},
): Promise<{ jobId: string; status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SKIPPED' }> {
  const jobId = jobIdFromEvent(event);
  const runtime = dependencies.runtime || cloudBaseRuntimeFromEnv();
  await ensureFfmpeg(runtime);
  if (!jobId) {
    await runtime.rpc('rpc_job_requeue_stalled', { pLimit: 100 });
  }
  const result = await new CloudBaseJobRunner({ ...dependencies, runtime }).runJob(jobId || undefined);
  const objectKey = event?.Records?.[0]?.cos?.cosObject?.key
    || event?.data?.objectKey
    || event?.data?.object?.key;
  if (objectKey) {
    const decoded = decodeURIComponent(String(objectKey).replaceAll('+', ' '));
    const eventPrefix = decoded.indexOf('job-events/');
    if (eventPrefix >= 0) {
      await runtime.deleteObject(
        process.env.CLOUDBASE_JOBS_BUCKET || 'aivoice-jobs',
        decoded.slice(eventPrefix),
      ).catch(() => undefined);
    }
  }
  return result;
}

export const main = handleWorkerEvent;
