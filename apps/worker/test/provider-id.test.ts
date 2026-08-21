import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptProviderId, encryptProviderId } from '../src/crypto/provider-id.js';

test('provider voice ids are encrypted at rest', () => {
  const plaintext = 'cosyvoice-v3.5-flash-private-voice-id';
  const encrypted = encryptProviderId(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptProviderId(encrypted), plaintext);
});
