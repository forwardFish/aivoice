import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageService } from '../src/messages/message.service.js';
import { VoiceService } from '../src/voices/voice.service.js';

const voice = {
  id: 'voice-id',
  userId: 'user-id',
  name: '妈妈',
  permissionType: 'SELF' as const,
  relationshipType: 'SELF' as const,
  relationshipLabel: '',
  userAddress: '',
  ageYears: null,
  gender: null,
  userAgeYears: null,
  userLifeStage: null,
  background: '',
  relationshipNote: '',
  personalityNote: '',
  speechHabitNote: '',
  status: 'READY' as const,
  clipStartMs: 1_000,
  clipEndMs: 16_000,
  acceptedAt: '2026-08-22T00:00:00.000Z',
  previewPlaybackStartedAt: '2026-08-22T00:00:00.000Z',
  previewPlayedAt: '2026-08-22T00:00:20.000Z',
  previewRetryCount: 0,
  trialQuotaRemaining: 0,
  paidQuotaRemaining: 10,
  failureCode: '',
  failureMessage: '',
  qualityReport: null,
  lastUsedAt: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

function cloudDatabase(cloud: Record<string, unknown>) {
  return {
    isCloudBase: true,
    requireCloud: () => cloud,
    get db(): never { throw new Error('Drizzle must not be used'); },
    get pool(): never { throw new Error('pg must not be used'); },
  };
}

test('CloudBase voice profile stores the server-authoritative relationship context', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const relatedVoice = { ...voice, permissionType: 'OTHER' as const, relationshipType: 'MOTHER' as const };
  const cloud = {
    selectOne: async (table: string) => table === 'voice_profiles' ? relatedVoice : null,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'rpc_voice_update_profile_v6') return { ...relatedVoice, userAddress: '小林', userAgeYears: 40 };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const service = new VoiceService(
    cloudDatabase(cloud) as any,
    { getQuota: async () => ({}) } as any,
    { latestAsset: async () => null } as any,
  );

  const result = await service.updateProfile('user-id', 'voice-id', {
    name: '妈妈',
    permissionType: 'OTHER',
    relationshipType: 'MOTHER',
    relationshipLabel: '',
    userAddress: '小林',
    ageYears: 70,
    gender: 'FEMALE',
    userAgeYears: 40,
    userLifeStage: 'ADULT',
    background: '退休前是中学老师，现在参加社区合唱活动。',
    relationshipNote: '和成年女儿每周通话，遇到大事会一起商量。',
    personalityNote: '遇到大事先问清具体条件，担心时说话会变直接。',
    speechHabitNote: '句子不长，习惯先问一件具体的事。',
  });

  assert.equal(result.relationshipType, 'MOTHER');
  assert.equal(calls[0]?.name, 'rpc_voice_update_profile_v6');
  assert.deepEqual(calls[0]?.args, {
    pUserId: 'user-id',
    pVoiceId: 'voice-id',
    pName: '妈妈',
    pPermissionType: 'OTHER',
    pRelationshipType: 'MOTHER',
    pRelationshipLabel: '',
    pUserAddress: '小林',
    pAgeYears: 70,
    pGender: 'FEMALE',
    pUserAgeYears: 40,
    pUserLifeStage: 'ADULT',
    pBackground: '退休前是中学老师，现在参加社区合唱活动。',
    pRelationshipNote: '和成年女儿每周通话，遇到大事会一起商量。',
    pPersonalityNote: '遇到大事先问清具体条件,担心时说话会变直接。',
    pSpeechHabitNote: '句子不长,习惯先问一件具体的事。',
  });
});

test('CloudBase voice mutations use RPC without pg or Drizzle', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    selectOne: async (table: string) => table === 'voice_profiles' ? voice : null,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'rpc_voice_queue_source_speaker_check') {
        return { voiceId: voice.id, status: 'QUEUED', idempotent: false };
      }
      if (name === 'rpc_voice_queue_processing') {
        return { voiceId: voice.id, status: 'QUEUED', idempotent: false };
      }
      if (name === 'rpc_voice_retry_preview') {
        return { voiceId: voice.id, status: 'QUEUED' };
      }
      if (name === 'rpc_voice_mark_preview_started') {
        return { previewPlaybackStartedAt: '2026-08-22T00:00:00.000Z' };
      }
      if (name === 'rpc_voice_mark_preview_played') {
        return { previewPlayedAt: '2026-08-22T00:00:20.000Z' };
      }
      if (name === 'rpc_voice_delete_request') {
        return { voiceId: voice.id, status: 'DELETING' };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const quota = {
    getQuota: async () => ({
      trialQuotaRemaining: 0,
      paidQuotaRemaining: 10,
      availableQuota: 10,
      trialEligibility: 'USED',
    }),
  };
  const media = { latestAsset: async () => null, signedUrl: () => 'unused' };
  const service = new VoiceService(cloudDatabase(cloud) as any, quota as any, media as any);

  const sourceChecked = await service.sourceSpeakerCheck('user-id', 'voice-id');
  assert.equal(sourceChecked.id, 'voice-id');
  const processed = await service.process('user-id', 'voice-id');
  assert.equal(processed.id, 'voice-id');
  await service.markPreviewStarted('user-id', 'voice-id');
  await service.markPreviewPlayed('user-id', 'voice-id');
  await service.retryPreview('user-id', 'voice-id');
  assert.deepEqual(await service.deleteVoice('user-id', 'voice-id'), { status: 'DELETING' });

  assert.deepEqual(calls.map((call) => call.name), [
    'rpc_voice_queue_source_speaker_check',
    'rpc_voice_queue_processing',
    'rpc_voice_mark_preview_started',
    'rpc_voice_mark_preview_played',
    'rpc_voice_retry_preview',
    'rpc_voice_delete_request',
  ]);
  assert.equal(calls[1].args.pConsentVersion, 'voice-consent-v0.6');
  assert.match(String(calls[1].args.pConsentTextHash), /^[a-f0-9]{64}$/);
});

test('voice clip accepts 8-20 seconds and rejects values outside that range', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    selectOne: async (table: string) => table === 'voice_profiles' ? voice : null,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { voiceId: voice.id, clipStartMs: args.pStartMs, clipEndMs: args.pEndMs, status: 'DRAFT' };
    },
  };
  const service = new VoiceService(
    cloudDatabase(cloud) as any,
    { getQuota: async () => ({}) } as any,
    { latestAsset: async () => null } as any,
  );

  await service.updateClip('user-id', 'voice-id', 0, 8_000);
  await service.updateClip('user-id', 'voice-id', 5_000, 25_000);
  await assert.rejects(service.updateClip('user-id', 'voice-id', 0, 7_999), /clip must be 8-20 seconds/);
  await assert.rejects(service.updateClip('user-id', 'voice-id', 0, 20_001), /clip must be 8-20 seconds/);
  assert.equal(calls.filter((call) => call.name === 'rpc_voice_update_clip').length, 2);
});

test('CloudBase message creation is atomic through RPC without pg or Drizzle', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { messageId: 'message-id', status: 'PROCESSING', idempotent: false };
    },
    selectOne: async () => null,
  };
  const service = new MessageService(
    cloudDatabase(cloud) as any,
    { signedUrl: () => 'unused' } as any,
  );

  assert.deepEqual(await service.create({
    userId: 'user-id',
    voiceId: 'voice-id',
    idempotencyKey: 'request-1',
    text: '你好',
    mode: 'EXACT_SPEECH',
  }), { messageId: 'message-id', status: 'PROCESSING' });

  assert.equal(calls[0].name, 'rpc_message_create');
  assert.deepEqual(calls[0].args, {
    pUserId: 'user-id',
    pVoiceId: 'voice-id',
    pIdempotencyKey: 'request-1',
    pMode: 'EXACT_SPEECH',
    pInputText: '你好',
    pGenerationCost: 1,
  });
});

test('CloudBase message reads preserve the public response shape without pg or Drizzle', async () => {
  const cloud = {
    selectOne: async (table: string) => {
      if (table === 'messages') return {
        id: 'message-id',
        conversationId: 'conversation-id',
        userId: 'user-id',
        voiceProfileId: 'voice-id',
        mode: 'CHAT',
        status: 'READY',
        inputText: '你好吗',
        outputText: '我很好',
        errorCode: '',
        errorMessage: '',
        createdAt: '2026-08-22T00:00:00.000Z',
        readyAt: '2026-08-22T00:00:01.000Z',
      };
      if (table === 'media_assets') return { id: 'audio-id', messageId: 'message-id', durationMs: 1200 };
      return null;
    },
  };
  const service = new MessageService(
    cloudDatabase(cloud) as any,
    { signedUrl: async () => 'https://storage.example/audio' } as any,
  );

  const result = await service.get('user-id', 'message-id');
  assert.equal(result.id, 'message-id');
  assert.deepEqual(result.audio, {
    mediaId: 'audio-id',
    url: 'https://storage.example/audio',
    durationMs: 1200,
  });
});

test('CloudBase reply feedback persists a bounded server-authored correction without pg or Drizzle', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const cloud = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { recorded: true, correctionApplied: true };
    },
  };
  const service = new VoiceService(
    cloudDatabase(cloud) as any,
    { getQuota: async () => ({}) } as any,
    { latestAsset: async () => null } as any,
  );

  const result = await service.recordReplyFeedback('user-id', 'voice-id', {
    messageId: 'message-id', verdict: 'DISLIKE', reason: 'TONE_NOT_LIKE', detail: '她生气时声音反而会更低',
  });
  assert.deepEqual(result, { recorded: true, correctionApplied: true });
  assert.equal(calls[0]?.name, 'rpc_voice_record_feedback_v1');
  assert.equal(calls[0]?.args.pInstruction, '用户明确纠正TA的语气：她生气时声音反而会更低');
  assert.equal(calls[0]?.args.pVerdict, 'DISLIKE');
  assert.match(String(calls[0]?.args.pRecordedAt), /^\d{4}-\d{2}-\d{2}T/);
});

test('partner relationship rejects either participant being under 18', async () => {
  const service = new VoiceService(
    cloudDatabase({ selectOne: async () => voice }) as any,
    { getQuota: async () => ({}) } as any,
    { latestAsset: async () => null } as any,
  );
  await assert.rejects(service.updateProfile('user-id', 'voice-id', {
    name: '小雨', permissionType: 'OTHER', relationshipType: 'PARTNER',
    ageYears: 17, gender: 'FEMALE', userAgeYears: 40,
  }), /partner relationship requires adults/);
  await assert.rejects(service.updateProfile('user-id', 'voice-id', {
    name: '小雨', permissionType: 'OTHER', relationshipType: 'PARTNER',
    ageYears: 40, gender: 'FEMALE', userAgeYears: 17,
  }), /partner relationship requires adults/);
  await assert.rejects(service.updateProfile('user-id', 'voice-id', {
    name: '小雨', permissionType: 'OTHER', relationshipType: 'PARTNER',
    ageYears: 40, gender: 'FEMALE', userLifeStage: 'TEEN',
  }), /partner relationship requires adults/);
});

test('directed parent and child relationships reject impossible age order', async () => {
  const service = new VoiceService(
    cloudDatabase({ selectOne: async () => voice }) as any,
    { getQuota: async () => ({}) } as any,
    { latestAsset: async () => null } as any,
  );
  await assert.rejects(service.updateProfile('user-id', 'voice-id', {
    name: '错误母亲', permissionType: 'OTHER', relationshipType: 'MOTHER',
    ageYears: 12, gender: 'FEMALE', userAgeYears: 40,
  }), /relationship ages conflict/);
  await assert.rejects(service.updateProfile('user-id', 'voice-id', {
    name: '错误孩子', permissionType: 'OTHER', relationshipType: 'CHILD',
    ageYears: 40, gender: 'FEMALE', userAgeYears: 12,
  }), /relationship ages conflict/);
});

test('legacy assistant identity disclosures are blocked from both text and audio reads', async () => {
  let signedUrlCalls = 0;
  const cloud = {
    selectOne: async (table: string) => {
      if (table === 'messages') return {
        id: 'unsafe-message', conversationId: 'conversation-id', userId: 'user-id', voiceProfileId: 'voice-id',
        mode: 'CHAT', status: 'READY', inputText: '明天会是好天气吗？',
        outputText: '我是AI，无法查询天气。', errorCode: '', errorMessage: '',
        createdAt: '2026-08-22T00:00:00.000Z', readyAt: '2026-08-22T00:00:01.000Z',
      };
      if (table === 'media_assets') return { id: 'unsafe-audio', messageId: 'unsafe-message', durationMs: 1200 };
      return null;
    },
  };
  const service = new MessageService(
    cloudDatabase(cloud) as any,
    { signedUrl: async () => { signedUrlCalls += 1; return 'https://storage.example/unsafe'; } } as any,
  );

  const result = await service.get('user-id', 'unsafe-message');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.outputText, '这条回复未通过身份表达检查，已隐藏。');
  assert.equal(result.errorCode, 'IDENTITY_DISCLOSURE_BLOCKED');
  assert.equal(result.audio, null);
  assert.equal(signedUrlCalls, 0);
});

test('conversation history also hides legacy identity disclosures and their audio', async () => {
  let signedUrlCalls = 0;
  const unsafeRow = {
    id: 'unsafe-message', conversationId: 'conversation-id', userId: 'user-id', voiceProfileId: 'voice-id',
    mode: 'CHAT', status: 'READY', inputText: '明天会是好天气吗？', outputText: '我只是个机器人。',
    errorCode: '', errorMessage: '', createdAt: '2026-08-22T00:00:00.000Z', readyAt: '2026-08-22T00:00:01.000Z',
  };
  const cloud = {
    selectOne: async (table: string) => {
      if (table === 'voice_profiles') return { id: 'voice-id' };
      if (table === 'conversations') return { id: 'conversation-id', voiceProfileId: 'voice-id', clearedAt: null };
      return null;
    },
    select: async (table: string) => table === 'messages'
      ? [unsafeRow]
      : [{ id: 'unsafe-audio', messageId: 'unsafe-message', durationMs: 1200 }],
  };
  const service = new MessageService(
    cloudDatabase(cloud) as any,
    { signedUrl: async () => { signedUrlCalls += 1; return 'https://storage.example/unsafe'; } } as any,
  );

  const result = await service.conversation('user-id', 'voice-id');
  const assistant = result.messages.find((item) => item.role === 'ASSISTANT');
  assert.equal(assistant?.status, 'BLOCKED');
  assert.equal(assistant?.text, '这条回复未通过身份表达检查，已隐藏。');
  assert.equal(assistant?.audio, null);
  assert.equal(signedUrlCalls, 0);
});
