import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { CloudBaseRuntimeClient, cloudBaseRuntimeFromEnv } from '@aivoice/cloudbase-runtime';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;
  readonly cloud: CloudBaseRuntimeClient | null;
  readonly backend: 'postgres' | 'cloudbase';

  constructor() {
    this.backend = process.env.DATABASE_BACKEND === 'cloudbase' ? 'cloudbase' : 'postgres';
    if (this.backend === 'cloudbase') {
      this.cloud = cloudBaseRuntimeFromEnv();
      const unavailable = (name: string) => new Proxy({}, {
        get() { throw new Error(`${name} is disabled when DATABASE_BACKEND=cloudbase; use REST/RPC`); },
      });
      this.pool = unavailable('pg Pool') as Pool;
      this.db = unavailable('Drizzle') as NodePgDatabase<typeof schema>;
      return;
    }
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    this.pool = new Pool({ connectionString, max: 10 });
    this.db = drizzle(this.pool, { schema });
    this.cloud = null;
  }

  get isCloudBase(): boolean {
    return this.backend === 'cloudbase';
  }

  requireCloud(): CloudBaseRuntimeClient {
    if (!this.cloud) throw new Error('CloudBase runtime is not enabled');
    return this.cloud;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.backend === 'postgres') await this.pool.end();
  }
}
