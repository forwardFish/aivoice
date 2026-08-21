import assert from 'node:assert/strict';
import test from 'node:test';
import { HealthController } from '../src/health.controller.js';

test('health controller exposes the API identity', () => {
  assert.deepEqual(new HealthController().health(), { ok: true, service: 'aivoice-api' });
});
