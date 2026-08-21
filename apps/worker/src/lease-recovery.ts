import type { PoolClient } from 'pg';

export async function recoverExpiredLeases(client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE jobs SET status='FAILED', leased_until=NULL, finished_at=NOW(),
     error_code='LEASE_EXPIRED', error_message='worker lease expired after maximum attempts', updated_at=NOW()
     WHERE status='PROCESSING' AND leased_until <= NOW() AND attempts >= max_attempts`,
  );
  await client.query(
    `UPDATE voice_profiles SET status='FAILED', failure_code='LEASE_EXPIRED',
     failure_message='worker stopped before voice processing completed', updated_at=NOW()
     WHERE id IN (
       SELECT voice_profile_id FROM jobs
       WHERE status='FAILED' AND error_code='LEASE_EXPIRED' AND type='PROCESS_VOICE'
     ) AND status IN ('QUEUED','PROCESSING')`,
  );
  await client.query(
    `UPDATE messages SET status='FAILED', error_code='LEASE_EXPIRED',
     error_message='worker stopped before generation completed', updated_at=NOW()
     WHERE id IN (
       SELECT message_id FROM jobs
       WHERE status='FAILED' AND error_code='LEASE_EXPIRED' AND type='GENERATE_MESSAGE'
     ) AND status IN ('PENDING','PROCESSING')`,
  );
  await client.query(
    `UPDATE jobs SET status='QUEUED', available_at=NOW(), leased_until=NULL, heartbeat_at=NULL,
     error_code='LEASE_EXPIRED_RETRY', error_message='worker lease expired; retrying', updated_at=NOW()
     WHERE status='PROCESSING' AND leased_until <= NOW() AND attempts < max_attempts`,
  );
}
