import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service.js';

@Injectable()
export class AccountService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async deleteAccount(userId: string) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(`SELECT id,deleted_at FROM users WHERE id=$1 FOR UPDATE`, [userId]);
      if (!user.rows[0]) throw new NotFoundException('user not found');
      if (user.rows[0].deleted_at) {
        await client.query('COMMIT');
        return { status: 'DELETING' };
      }
      await client.query(`UPDATE users SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1`, [userId]);
      await client.query(`UPDATE sessions SET revoked_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
      await client.query(`UPDATE voice_profiles SET status='DELETING',updated_at=NOW() WHERE user_id=$1 AND deleted_at IS NULL`, [userId]);
      await client.query(
        `INSERT INTO jobs
         (id,user_id,type,status,dedupe_key,payload,attempts,max_attempts,available_at,created_at,updated_at)
         VALUES ($1,$2,'DELETE_ACCOUNT','QUEUED',$3,$4::jsonb,0,10,NOW(),NOW(),NOW())
         ON CONFLICT (dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,available_at=NOW(),error_code='',error_message='',finished_at=NULL,updated_at=NOW()
         WHERE jobs.status IN ('FAILED','SUCCEEDED','CANCELLED')`,
        [randomUUID(), userId, `delete-account:${userId}`, JSON.stringify({ userId })],
      );
      await client.query('COMMIT');
      return { status: 'DELETING' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
