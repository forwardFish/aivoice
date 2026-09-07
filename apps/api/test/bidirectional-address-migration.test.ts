import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql = fs.readFileSync(new URL('../cloudbase/0025_bidirectional_address.sql', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../src/db/schema.ts', import.meta.url), 'utf8');

test('bidirectional address migration separates display name from both dialogue address directions', () => {
  assert.match(schema, /voiceAddress:\s*text\('voice_address'\)\.notNull\(\)\.default\(''\)/);
  assert.match(sql, /ALTER TABLE voice_profiles ADD COLUMN IF NOT EXISTS voice_address text NOT NULL DEFAULT ''/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION rpc_voice_update_profile_v7/);
  assert.match(sql, /voice_address=v_voice_address,user_address=v_user_address/);
  assert.match(sql, /'voiceAddress',v_voice_address,'userAddress',v_user_address/);
  assert.match(sql, /'voiceAddress',vp\.voice_address,'userAddress',vp\.user_address/);
  assert.match(sql, /char_length\(voice_address\)<=10/);
});
