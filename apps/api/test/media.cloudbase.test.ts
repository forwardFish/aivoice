import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseService } from '../src/db/database.service.js';
import { MediaService } from '../src/media/media.service.js';

function cloudDatabase(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const updates: unknown[] = [];
  const cloud = {
    selectOne: async (table: string, options: any) => {
      if (table === 'voice_profiles') {
        return options.select
          ? { previewPlaybackStartedAt: null }
          : { id: '11111111-1111-4111-8111-111111111111', userId: 'user-1', deletedAt: null };
      }
      if (table === 'media_assets') {
        return {
          id: 'media-1',
          userId: 'user-1',
          voiceProfileId: '11111111-1111-4111-8111-111111111111',
          kind: 'PREVIEW_AUDIO',
          status: 'READY',
          objectKey: 'preview/user-1/voice-1.wav',
          mimeType: 'audio/wav',
          bytes: 321,
          durationMs: 3_000,
        };
      }
      return null;
    },
    signUpload: async () => ({ uploadUrl: 'https://env.api.tcloudbasegateway.com/v1/storages/object/upload/sign/media/source.mp4', token: 'signed-token' }),
    objectInfo: async () => ({
      id: 'object-1',
      name: 'source.mp4',
      size: 1_024,
      contentType: 'video/mp4',
      etag: 'etag-1',
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { mediaId: 'confirmed-media-1', voiceId: args.pVoiceId, status: 'READY' };
    },
    update: async (...args: unknown[]) => {
      updates.push(args);
      return [];
    },
    signDownload: async () => 'https://download.example.test/signed-preview.wav',
    ...overrides,
  };
  const database = {
    isCloudBase: true,
    requireCloud: () => cloud,
  } as unknown as DatabaseService;
  return { database, calls, updates };
}

test('CloudBase media policy sends a 100MB video directly to private PG storage', async () => {
  process.env.CLOUDBASE_PG_STORAGE_BUCKET = 'aivoice-media';
  const { database } = cloudDatabase();
  const service = new MediaService(database);
  const policy = await service.uploadPolicy('user-1', '11111111-1111-4111-8111-111111111111', {
    fileName: 'authorized.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1_024,
  });

  assert.equal(policy.mode, 'signed-put');
  assert.equal(policy.uploadMethod, 'PUT');
  assert.equal(policy.maxBytes, 100 * 1024 * 1024);
  assert.equal(policy.headers['Content-Type'], 'video/mp4');
  assert.match(policy.objectKey, /^source\/user-1\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.mp4$/);
  assert.equal(new URL(policy.uploadUrl).searchParams.get('token'), 'signed-token');
  assert.doesNotMatch(policy.uploadUrl, /media-upload/);
});

test('CloudBase media confirmation verifies object metadata then registers it through RPC', async () => {
  process.env.CLOUDBASE_PG_STORAGE_BUCKET = 'aivoice-media';
  const { database, calls } = cloudDatabase();
  const service = new MediaService(database);
  const objectKey = 'source/user-1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4';

  const result = await service.confirmSourceMedia('user-1', '11111111-1111-4111-8111-111111111111', {
    objectKey,
    mediaId: '22222222-2222-4222-8222-222222222222',
    fileName: 'authorized.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1_024,
    durationMs: 12_000,
  });

  assert.deepEqual(result, {
    voiceId: '11111111-1111-4111-8111-111111111111',
    mediaId: 'confirmed-media-1',
    status: 'DRAFT',
    sourceDurationMs: 12_000,
    confirmed: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'rpc_voice_confirm_source_upload');
  assert.equal(calls[0].args.pObjectKey, objectKey);
  assert.equal(calls[0].args.pBytes, 1_024);
  assert.match(String(calls[0].args.pSha256), /^[0-9a-f]{64}$/);
});

test('CloudBase playback resolves to a short-lived storage URL without reading local disk', async () => {
  Object.assign(process.env, {
    CLOUDBASE_PG_STORAGE_BUCKET: 'aivoice-media',
    PUBLIC_BASE_URL: 'https://api.example.test',
    MEDIA_SIGNING_SECRET: 'test-media-signing-secret',
  });
  const { database, updates } = cloudDatabase();
  const service = new MediaService(database);
  const ticket = new URL(await service.signedUrl('media-1', 'user-1'));

  const resolved = await service.resolveSigned(
    'media-1',
    String(ticket.searchParams.get('userId')),
    Number(ticket.searchParams.get('exp')),
    String(ticket.searchParams.get('sig')),
  );

  assert.equal('redirectUrl' in resolved && resolved.redirectUrl, 'https://download.example.test/signed-preview.wav');
  assert.equal(updates.length, 1);
  assert.equal('filePath' in resolved, false);
});

test('native CloudBase media policy and playback use cloud file IDs with no custom domain', async () => {
  process.env.CLOUDBASE_SOURCE_BUCKET = 'aivoice-source';
  const fileID = 'cloud://aivoice-d1g94bgoh67c6b974.bucket/source/user-1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4';
  const { database, calls } = cloudDatabase({
    storageMode: 'native',
    objectInfo: async () => ({
      id: fileID,
      name: 'authorized.mp4',
      size: 1_024,
      contentType: 'video/mp4',
    }),
    selectOne: async (table: string) => {
      if (table === 'voice_profiles') return { id: '11111111-1111-4111-8111-111111111111', userId: 'user-1' };
      if (table === 'media_assets') return {
        id: 'media-native', userId: 'user-1', voiceProfileId: null, kind: 'GENERATED_AUDIO', status: 'READY',
        objectKey: 'cloud://aivoice-d1g94bgoh67c6b974.bucket/generated/user-1/message.wav',
        mimeType: 'audio/wav', bytes: 64, durationMs: 1_000,
      };
      return null;
    },
  });
  const service = new MediaService(database);
  const policy = await service.uploadPolicy('user-1', '11111111-1111-4111-8111-111111111111', {
    fileName: 'authorized.mp4', mimeType: 'video/mp4', sizeBytes: 1_024,
  });
  assert.equal(policy.mode, 'cloud-file');
  assert.match(String(policy.cloudPath), /^source\/user-1\//);
  assert.equal('uploadUrl' in policy, false);

  await service.confirmSourceMedia('user-1', '11111111-1111-4111-8111-111111111111', {
    objectKey: fileID,
    mediaId: '22222222-2222-4222-8222-222222222222',
    fileName: 'authorized.mp4', mimeType: 'video/mp4', sizeBytes: 1_024, durationMs: 12_000,
  });
  assert.equal(calls[0].args.pObjectKey, fileID);
  assert.equal(await service.signedUrl('media-native', 'user-1'), 'cloud://aivoice-d1g94bgoh67c6b974.bucket/generated/user-1/message.wav');
});

test('native playback lazily migrates a legacy PG object before returning a cloud file ID', async () => {
  const events: string[] = [];
  const legacy = {
    id: 'media-legacy', userId: 'user-1', voiceProfileId: null, kind: 'GENERATED_AUDIO' as const, status: 'READY' as const,
    objectKey: 'generated/user-1/legacy.wav', mimeType: 'audio/wav', bytes: 6, durationMs: 1_000,
  };
  const migratedFileID = 'cloud://aivoice-d1g94bgoh67c6b974.bucket/generated/user-1/legacy.wav';
  const { database } = cloudDatabase({
    storageMode: 'native',
    async selectOne(table: string) {
      if (table === 'media_assets') return legacy;
      return null;
    },
    async downloadFile(_bucket: string, key: string, target: string) {
      events.push(`download:${key}`);
      await (await import('node:fs/promises')).writeFile(target, 'legacy');
    },
    async uploadFile(_bucket: string, key: string) {
      events.push(`upload:${key}`);
      return migratedFileID;
    },
    async update(table: string, values: any) {
      events.push(`update:${table}`);
      return [{ ...legacy, objectKey: values.objectKey }];
    },
  });
  const service = new MediaService(database);
  assert.equal(await service.signedUrl('media-legacy', 'user-1'), migratedFileID);
  assert.deepEqual(events, [
    'download:generated/user-1/legacy.wav',
    'upload:generated/user-1/legacy.wav',
    'update:media_assets',
  ]);
});
