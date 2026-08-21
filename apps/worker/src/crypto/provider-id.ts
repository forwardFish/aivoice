import crypto from 'node:crypto';

function key(): Buffer {
  const configured = process.env.PROVIDER_ID_ENCRYPTION_KEY?.trim();
  if (configured) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length !== 32) throw new Error('PROVIDER_ID_ENCRYPTION_KEY must be 32 bytes in base64');
    return decoded;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('PROVIDER_ID_ENCRYPTION_KEY is required');
  return crypto.createHash('sha256').update('aivoice-local-provider-id-key').digest();
}

export function encryptProviderId(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptProviderId(value: string): string {
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('invalid encrypted provider id');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
