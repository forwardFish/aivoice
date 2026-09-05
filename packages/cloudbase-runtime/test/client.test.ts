import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudBaseRuntimeClient, type NativeCloudStoragePort } from '../src/index.js';

test('requires server-only CloudBase credentials', () => {
  assert.throws(() => new CloudBaseRuntimeClient('', ''), /required/);
});

test('builds stable environment endpoints without exposing the key', () => {
  const client = new CloudBaseRuntimeClient('env-test', 'server-secret', { nativeStorageEnvId: 'storage-env' });
  assert.equal(client.databaseBase, 'https://env-test.api.tcloudbasegateway.com/v1/rdb/rest');
  assert.equal(client.storageBase, 'https://env-test.api.tcloudbasegateway.com/v1/storages');
  assert.equal(client.nativeStorageEnvId, 'storage-env');
  assert.equal(JSON.stringify(client).includes('server-secret'), false);
});

test('encodes ISO timestamp filters exactly once', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = new CloudBaseRuntimeClient('env-test', 'server-secret');
    const expiresAt = '2026-08-23T02:40:55.718Z';
    await client.select('sessions', { filters: { expiresAt: { gt: expiresAt } } });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get('expires_at'), `gt.${expiresAt}`);
    assert.equal(requestedUrl.includes('%253A'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('native storage keeps cloud file IDs across upload, metadata, download, playback and delete', async () => {
  const files = new Map<string, Buffer>();
  const deleted: string[] = [];
  const nativeStorage: NativeCloudStoragePort = {
    async uploadFile({ cloudPath, fileContent }) {
      const fileID = `cloud://env-test.bucket/${cloudPath}`;
      files.set(fileID, Buffer.from(fileContent));
      return { fileID };
    },
    async downloadFile({ fileID }) {
      return { fileContent: files.get(fileID) };
    },
    async deleteFile({ fileList }) {
      for (const fileID of fileList) {
        files.delete(fileID);
        deleted.push(fileID);
      }
      return { fileList: fileList.map((fileID) => ({ code: 'SUCCESS', fileID })) };
    },
    async getTempFileURL({ fileList }) {
      const fileID = typeof fileList[0] === 'string' ? fileList[0] : fileList[0].fileID;
      return { fileList: [{ code: 'SUCCESS', fileID, tempFileURL: `https://temp.invalid/${encodeURIComponent(fileID)}` }] };
    },
    async getFileInfo({ fileList }) {
      const fileID = fileList[0];
      const body = files.get(fileID);
      return {
        fileList: body
          ? [{ code: 'SUCCESS', fileID, tempFileURL: '', fileName: 'sample.wav', contentType: 'audio/wav', size: body.length }]
          : [{ code: 'STORAGE_FILE_NONEXIST', fileID, tempFileURL: '' }],
      };
    },
  };
  const client = new CloudBaseRuntimeClient('env-test', 'server-secret', {
    storageMode: 'native',
    nativeStorage,
  });
  const fileID = await client.uploadBuffer('ignored', 'generated/user/message.wav', Buffer.from('audio'), 'audio/wav');
  assert.equal(fileID, 'cloud://env-test.bucket/generated/user/message.wav');
  assert.equal((await client.objectInfo('ignored', fileID)).size, 5);
  assert.match(await client.signDownload('ignored', fileID), /^https:\/\/temp\.invalid\//);
  const target = `${process.cwd()}/.native-storage-test-output`;
  await client.downloadFile('ignored', fileID, target);
  assert.equal(await (await import('node:fs/promises')).readFile(target, 'utf8'), 'audio');
  await (await import('node:fs/promises')).unlink(target);
  await client.deleteObject('ignored', fileID);
  assert.deepEqual(deleted, [fileID]);
});

test('quality report JSON is opaque while database and RPC envelope keys still map', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, any> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      outer_value: 7,
      quality_report: {
        source_speaker_check: {
          speech_evidence: { character_count: 42 },
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = new CloudBaseRuntimeClient('env-test', 'server-secret');
    const result = await client.rpc<Record<string, any>>('rpc_test', {
      pQualityReport: {
        sourceSpeakerCheck: {
          speechEvidence: { characterCount: 42 },
        },
      },
    });
    assert.equal(requestBody.p_quality_report.sourceSpeakerCheck.speechEvidence.characterCount, 42);
    assert.equal(requestBody.p_quality_report.source_speaker_check, undefined);
    assert.equal(result.outerValue, 7);
    assert.equal(result.qualityReport.source_speaker_check.speech_evidence.character_count, 42);
    assert.equal(result.qualityReport.sourceSpeakerCheck, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('source-check pReport stays opaque without changing unrelated nested RPC arguments', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, any> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const client = new CloudBaseRuntimeClient('env-test', 'server-secret');
    await client.rpc('rpc_test', {
      pReport: { sourceSpeakerCheck: { speechEvidence: { characterCount: 42 } } },
      ordinaryObject: { nestedValue: 9 },
    });
    assert.equal(requestBody.p_report.sourceSpeakerCheck.speechEvidence.characterCount, 42);
    assert.equal(requestBody.ordinary_object.nested_value, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
