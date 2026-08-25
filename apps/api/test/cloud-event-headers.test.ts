import assert from 'node:assert/strict'
import test from 'node:test'
import { safeHeaders } from '../../../cloudfunctions/aivoice-api-event/headers.js'

test('cloud event forwards allowlisted headers case-insensitively', () => {
  assert.deepEqual(safeHeaders({
    Authorization: 'Bearer session-token',
    'Idempotency-Key': 'request-key',
    'Content-Type': 'application/json',
    Cookie: 'must-not-forward',
  }), {
    authorization: 'Bearer session-token',
    'idempotency-key': 'request-key',
    'content-type': 'application/json',
  })
})
