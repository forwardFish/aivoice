import { Pool } from 'pg';

export class WorkerDatabase {
  readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({ connectionString, max: 5 });
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
