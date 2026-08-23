import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { invokeWorkerAsync } from './cloudbase-worker-invoker.js';

interface QueuedJob {
  id: string;
  type: string;
}

@Injectable()
export class CloudBaseWorkerDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  onModuleInit(): void {
    if (!this.database.isCloudBase || process.env.CLOUDBASE_WORKER_DISPATCHER === 'false') return;
    const intervalMs = Math.max(5_000, Number(process.env.CLOUDBASE_WORKER_DISPATCH_INTERVAL_MS || 15_000));
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const cloud = this.database.requireCloud();
      await cloud.rpc('rpc_job_requeue_stalled', { pLimit: 100 });
      const jobs = await cloud.select<QueuedJob>('jobs', {
        select: 'id,type',
        filters: { status: 'QUEUED', availableAt: { lte: new Date().toISOString() } },
        order: [{ column: 'createdAt', ascending: true }],
        limit: 5,
      });
      await Promise.all(jobs.map((job) => invokeWorkerAsync({ jobId: job.id, type: job.type })));
    } catch (error) {
      console.error('CloudBase worker dispatcher tick failed', error);
    } finally {
      this.running = false;
    }
  }
}
