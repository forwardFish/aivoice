import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { WorkerDatabase } from './db.js';
import { JobRunner } from './job-runner.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(projectRoot, '.env.local'), quiet: true });
config({
  path: process.env.AIVOICE_ALIYUN_ENV_FILE || 'D:/lyh/secrets/aivoice/aliyun.env',
  quiet: true,
  override: true,
});
config({
  path: process.env.AIVOICE_VOLCENGINE_ENV_FILE || 'D:/lyh/secrets/aivoice/byteplus.env',
  quiet: true,
  override: true,
});
config({
  path: process.env.AIVOICE_DEEPSEEK_ENV_FILE || 'D:/lyh/secrets/aivoice/deepseek.env',
  quiet: true,
  override: true,
});

async function main(): Promise<void> {
  const database = new WorkerDatabase();
  const runner = new JobRunner(database);
  const stop = () => runner.stop();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runner.run();
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
