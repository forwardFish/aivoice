import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';

const databaseEnvId = process.env.CLOUDBASE_TARGET_ENV_ID || 'aivoice-d1g94bgoh67c6b974';
const credentialFile = process.env.CLOUDBASE_CREDENTIALS_FILE
  || 'D:/lyh/secrets/aivoice/tencentcloud-deploy.env';
const credentials = fs.existsSync(credentialFile) ? parseDotEnv(fs.readFileSync(credentialFile)) : {};
const secretId = process.env.TENCENTCLOUD_SECRETID || credentials.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY || credentials.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey) throw new Error('Rotated Tencent Cloud deployment credentials are missing');

const secretsDir = process.env.AIVOICE_CLOUDBASE_SECRETS_DIR || 'D:/lyh/secrets/aivoice/cloudbase';
const statePath = path.join(secretsDir, 'deployment-state.json');
const pendingPath = path.join(secretsDir, 'provider-key-rotation-pending.json');
if (!fs.existsSync(statePath)) throw new Error('CloudBase deployment state is missing');
const state = JSON.parse(await fsp.readFile(statePath, 'utf8'));
const oldKeyText = String(state.providerEncryptionKey || '');
const oldKey = Buffer.from(oldKeyText, 'base64');
if (oldKey.length !== 32) throw new Error('Current provider encryption key is invalid');

function decrypt(value, key) {
  const [ivText, tagText, ciphertextText] = String(value).split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('invalid encrypted provider id');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const app = new CloudBase({ envId: databaseEnvId, region: 'ap-shanghai', secretId, secretKey });
const query = (sql) => app.database.executePGSql({ Sql: sql });
const selected = await query('select id::text,provider_voice_id_encrypted from voice_models order by id');
const rows = (selected.Rows || []).map((row) => {
  const [id, encrypted] = JSON.parse(row);
  return { id: String(id), encrypted: String(encrypted) };
});

let pending;
if (fs.existsSync(pendingPath)) {
  pending = JSON.parse(await fsp.readFile(pendingPath, 'utf8'));
} else {
  const newKeyText = crypto.randomBytes(32).toString('base64');
  const newKey = Buffer.from(newKeyText, 'base64');
  const mappings = rows.map((row) => {
    const plaintext = decrypt(row.encrypted, oldKey);
    if (!plaintext) throw new Error(`Provider ID decrypted empty for ${row.id}`);
    return { id: row.id, oldEncrypted: row.encrypted, newEncrypted: encrypt(plaintext, newKey) };
  });
  pending = {
    createdAt: new Date().toISOString(),
    databaseEnvId,
    oldKey: oldKeyText,
    newKey: newKeyText,
    mappings,
  };
  await fsp.mkdir(secretsDir, { recursive: true });
  await fsp.writeFile(pendingPath, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
}

const newKey = Buffer.from(String(pending.newKey), 'base64');
if (newKey.length !== 32) throw new Error('Pending provider encryption key is invalid');
for (const mapping of pending.mappings) decrypt(mapping.oldEncrypted, oldKey);

if (pending.mappings.length) {
  const statements = pending.mappings.map((mapping) =>
    `UPDATE voice_models SET provider_voice_id_encrypted=${sqlString(mapping.newEncrypted)},updated_at=now() WHERE id=${sqlString(mapping.id)}::uuid;`);
  await query(`BEGIN;\n${statements.join('\n')}\nCOMMIT;`);
}

const verified = await query('select id::text,provider_voice_id_encrypted from voice_models order by id');
const verifiedRows = (verified.Rows || []).map((row) => {
  const [id, encrypted] = JSON.parse(row);
  return { id: String(id), encrypted: String(encrypted) };
});
if (verifiedRows.length !== pending.mappings.length) throw new Error('Provider encryption verification row count mismatch');
for (const row of verifiedRows) {
  const plaintext = decrypt(row.encrypted, newKey);
  if (!plaintext) throw new Error(`Provider ID verification failed for ${row.id}`);
}

state.providerEncryptionKey = String(pending.newKey);
state.providerEncryptionKeyRotatedAt = new Date().toISOString();
state.providerEncryptionRowsRotated = verifiedRows.length;
state.mediaSigningSecret = crypto.randomBytes(32).toString('hex');
state.mediaSigningSecretRotatedAt = new Date().toISOString();
await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
const completedPath = path.join(secretsDir, `provider-key-rotation-backup-${Date.now()}.json`);
await fsp.rename(pendingPath, completedPath);

console.log(JSON.stringify({
  success: true,
  databaseEnvId,
  rowsRotated: verifiedRows.length,
  allRowsVerified: true,
  mediaSigningSecretRotated: true,
  rollbackBackupCreated: true,
  oldProviderKeyActiveInNewDeployment: false,
}, null, 2));
