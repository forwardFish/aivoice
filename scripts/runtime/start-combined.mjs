import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const children = new Set();
let stopping = false;

function startCommand(name, command, args) {
  const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (stopping) return;
    console.error(`${name} exited`, { code, signal });
    stop(code ?? 1);
  });
  return child;
}

function start(name, entrypoint) {
  return startCommand(name, process.execPath, [entrypoint]);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: options.quiet ? 'ignore' : 'inherit',
      cwd: options.cwd,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startEmbeddedPostgres() {
  const dataDir = process.env.PGDATA || '/app/.runtime/postgres';
  await fsp.mkdir(dataDir, { recursive: true });
  await run('chown', ['-R', 'postgres:postgres', dataDir]);
  if (!fs.existsSync(`${dataDir}/PG_VERSION`)) {
    await run('gosu', ['postgres', 'initdb', '-D', dataDir, '-A', 'trust', '-U', 'aivoice']);
  }
  startCommand('postgres', 'gosu', [
    'postgres', 'postgres', '-D', dataDir, '-h', '127.0.0.1', '-p', '5432',
    '-c', 'shared_buffers=128MB', '-c', 'max_connections=30',
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run('pg_isready', ['-h', '127.0.0.1', '-p', '5432', '-U', 'aivoice'], { quiet: true });
      break;
    } catch {
      if (attempt === 59) throw new Error('embedded PostgreSQL did not become ready');
      await sleep(500);
    }
  }
  try {
    await run('createdb', ['-h', '127.0.0.1', '-p', '5432', '-U', 'aivoice', 'aivoice'], { quiet: true });
  } catch {
    // The database already exists after a warm container restart.
  }
  process.env.DATABASE_URL = 'postgresql://aivoice@127.0.0.1:5432/aivoice';
  await run(process.execPath, ['dist/db/migrate.js'], { cwd: '/app/apps/api' });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 10_000);
  timer.unref();
  if (children.size === 0) process.exit(exitCode);
  Promise.all([...children].map((child) => new Promise((resolve) => child.once('exit', resolve))))
    .finally(() => process.exit(exitCode));
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

if (process.env.USE_EMBEDDED_POSTGRES === 'true') await startEmbeddedPostgres();
start('api', 'apps/api/dist/main.js');
start('worker', 'apps/worker/dist/main.js');
