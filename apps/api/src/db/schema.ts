import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  type AnyPgColumn,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const permissionType = pgEnum('permission_type', ['SELF', 'OTHER', 'MINOR']);
export const voiceRelationshipType = pgEnum('voice_relationship_type', [
  'SELF', 'MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'CHILD', 'PARTNER', 'FRIEND', 'OTHER',
]);
export const voiceStatus = pgEnum('voice_status', [
  'DRAFT', 'UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED',
]);
export const mediaKind = pgEnum('media_kind', [
  'SOURCE_VIDEO', 'REFERENCE_AUDIO', 'PREVIEW_AUDIO', 'GENERATED_AUDIO',
]);
export const mediaStatus = pgEnum('media_status', [
  'PENDING', 'READY', 'DELETE_PENDING', 'DELETED', 'FAILED',
]);
export const providerStatus = pgEnum('provider_status', [
  'PROCESSING', 'READY', 'REJECTED', 'DELETE_PENDING', 'DELETED',
]);
export const messageMode = pgEnum('message_mode', ['CHAT', 'EXACT_SPEECH']);
export const messageStatus = pgEnum('message_status', [
  'PENDING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED',
]);
export const orderStatus = pgEnum('order_status', ['PENDING', 'PAID', 'CLOSED', 'REFUNDED']);
export const quotaBucket = pgEnum('quota_bucket', ['TRIAL', 'PAID']);
export const quotaLedgerType = pgEnum('quota_ledger_type', [
  'TRIAL_GRANT', 'PURCHASE_GRANT', 'GENERATION_CONSUME', 'REFUND', 'MANUAL_ADJUSTMENT',
]);
export const pointLedgerType = pgEnum('point_ledger_type', [
  'REGISTER_GRANT', 'PURCHASE_GRANT', 'GENERATION_CONSUME', 'REFUND', 'MANUAL_ADJUSTMENT', 'INVITE_GRANT',
]);
export const jobType = pgEnum('job_type', [
  'PROCESS_VOICE', 'GENERATE_MESSAGE', 'DELETE_VOICE', 'DELETE_ACCOUNT',
]);
export const jobStatus = pgEnum('job_status', [
  'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  openid: text('openid').notNull(),
  unionid: text('unionid'),
  nickname: text('nickname').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  trialVoiceProfileId: uuid('trial_voice_profile_id').references((): AnyPgColumn => voiceProfiles.id, { onDelete: 'set null' }),
  trialCustomGenerationGrantedAt: timestamp('trial_custom_generation_granted_at', { withTimezone: true }),
  trialCustomGenerationConsumedAt: timestamp('trial_custom_generation_consumed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('users_openid_unique').on(table.openid),
  index('users_unionid_idx').on(table.unionid),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
  index('sessions_user_expiry_idx').on(table.userId, table.expiresAt),
]);

export const pointAccounts = pgTable('point_accounts', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  signupGrantedAt: timestamp('signup_granted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [check('point_accounts_balance_non_negative', sql`${table.balance} >= 0`)]);

export const voiceProfiles = pgTable('voice_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  permissionType: permissionType('permission_type'),
  relationshipType: voiceRelationshipType('relationship_type'),
  relationshipLabel: text('relationship_label').notNull().default(''),
  userAddress: text('user_address').notNull().default(''),
  ageYears: integer('age_years'),
  gender: text('gender'),
  userLifeStage: text('user_life_stage'),
  background: text('background').notNull().default(''),
  relationshipNote: text('relationship_note').notNull().default(''),
  status: voiceStatus('status').notNull().default('DRAFT'),
  clipStartMs: integer('clip_start_ms'),
  clipEndMs: integer('clip_end_ms'),
  trialQuotaRemaining: integer('trial_quota_remaining').notNull().default(0),
  paidQuotaRemaining: integer('paid_quota_remaining').notNull().default(0),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  previewPlaybackStartedAt: timestamp('preview_playback_started_at', { withTimezone: true }),
  previewPlayedAt: timestamp('preview_played_at', { withTimezone: true }),
  previewRetryCount: integer('preview_retry_count').notNull().default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  failureCode: text('failure_code').notNull().default(''),
  failureMessage: text('failure_message').notNull().default(''),
  qualityReport: jsonb('quality_report'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('voice_profiles_user_status_idx').on(table.userId, table.status),
  check('voice_profiles_quota_non_negative', sql`${table.trialQuotaRemaining} >= 0 AND ${table.paidQuotaRemaining} >= 0`),
  check('voice_profiles_preview_retry_count_valid', sql`${table.previewRetryCount} >= 0 AND ${table.previewRetryCount} <= 1`),
  check('voice_profiles_relationship_label_length', sql`char_length(${table.relationshipLabel}) <= 10`),
  check('voice_profiles_user_address_length', sql`char_length(${table.userAddress}) <= 10`),
  check('voice_profiles_age_years_valid', sql`${table.ageYears} IS NULL OR (${table.ageYears} >= 0 AND ${table.ageYears} <= 120)`),
  check('voice_profiles_gender_valid', sql`${table.gender} IS NULL OR ${table.gender} IN ('FEMALE','MALE')`),
  check('voice_profiles_user_life_stage_valid', sql`${table.userLifeStage} IS NULL OR ${table.userLifeStage} IN ('CHILD','TEEN','ADULT','OLDER_ADULT')`),
  check('voice_profiles_background_length', sql`char_length(${table.background}) <= 300`),
  check('voice_profiles_relationship_note_length', sql`char_length(${table.relationshipNote}) <= 300`),
]);

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references((): AnyPgColumn => messages.id, { onDelete: 'cascade' }),
  kind: mediaKind('kind').notNull(),
  status: mediaStatus('status').notNull().default('PENDING'),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  bytes: integer('bytes').notNull(),
  durationMs: integer('duration_ms'),
  sha256: text('sha256').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('media_assets_object_key_unique').on(table.objectKey),
  index('media_assets_user_kind_status_idx').on(table.userId, table.kind, table.status),
  index('media_assets_voice_kind_idx').on(table.voiceProfileId, table.kind),
]);

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  voiceProfileId: uuid('voice_profile_id').notNull().references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  permissionType: permissionType('permission_type').notNull(),
  consentVersion: text('consent_version').notNull(),
  consentTextHash: text('consent_text_hash').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('consent_records_voice_time_idx').on(table.voiceProfileId, table.confirmedAt)]);

export const voiceModels = pgTable('voice_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  voiceProfileId: uuid('voice_profile_id').notNull().references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  targetModel: text('target_model').notNull(),
  providerVoiceIdEncrypted: text('provider_voice_id_encrypted').notNull(),
  status: providerStatus('status').notNull().default('PROCESSING'),
  deletionError: text('deletion_error').notNull().default(''),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('voice_models_voice_unique').on(table.voiceProfileId)]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  voiceProfileId: uuid('voice_profile_id').notNull().references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('conversations_voice_unique').on(table.voiceProfileId)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').notNull().references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  mode: messageMode('mode').notNull(),
  status: messageStatus('status').notNull().default('PENDING'),
  inputText: text('input_text').notNull(),
  outputText: text('output_text').notNull().default(''),
  errorCode: text('error_code').notNull().default(''),
  errorMessage: text('error_message').notNull().default(''),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('messages_user_idempotency_unique').on(table.userId, table.idempotencyKey),
  index('messages_voice_status_time_idx').on(table.voiceProfileId, table.status, table.createdAt),
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNo: text('order_no').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, { onDelete: 'set null' }),
  productCode: text('product_code').notNull(),
  amountFen: integer('amount_fen').notNull(),
  quota: integer('quota').notNull(),
  points: integer('points').notNull(),
  clientRequestKey: text('client_request_key'),
  prepayRequestDigest: text('prepay_request_digest').notNull().default(''),
  paymentAppid: text('payment_appid'),
  paymentMchid: text('payment_mchid'),
  payerOpenid: text('payer_openid'),
  status: orderStatus('status').notNull().default('PENDING'),
  prepayId: text('prepay_id').notNull().default(''),
  transactionId: text('transaction_id'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  quotaGrantedAt: timestamp('quota_granted_at', { withTimezone: true }),
  pointsGrantedAt: timestamp('points_granted_at', { withTimezone: true }),
  notifyDigest: text('notify_digest').notNull().default(''),
  ...timestamps,
}, (table) => [
  uniqueIndex('orders_order_no_unique').on(table.orderNo),
  uniqueIndex('orders_transaction_id_unique').on(table.transactionId),
  uniqueIndex('orders_user_client_request_unique').on(table.userId, table.clientRequestKey),
  index('orders_user_time_idx').on(table.userId, table.createdAt),
  check('orders_amount_positive', sql`${table.amountFen} > 0`),
  check('orders_quota_positive', sql`${table.quota} > 0`),
  check('orders_points_positive', sql`${table.points} > 0`),
]);

export const pointLedgers = pgTable('point_ledgers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  type: pointLedgerType('type').notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  requestKey: text('request_key'),
  source: text('source').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('point_ledgers_type_order_unique').on(table.type, table.orderId),
  uniqueIndex('point_ledgers_type_message_unique').on(table.type, table.messageId),
  uniqueIndex('point_ledgers_type_request_unique').on(table.type, table.requestKey),
  index('point_ledgers_user_time_idx').on(table.userId, table.createdAt),
  check('point_ledgers_balance_non_negative', sql`${table.balanceAfter} >= 0`),
  check('point_ledgers_amount_non_zero', sql`${table.amount} <> 0`),
]);

export const quotaLedgers = pgTable('quota_ledgers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').notNull().references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'restrict' }),
  type: quotaLedgerType('type').notNull(),
  bucket: quotaBucket('bucket').notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('quota_ledgers_type_order_unique').on(table.type, table.orderId),
  uniqueIndex('quota_ledgers_type_message_unique').on(table.type, table.messageId),
  index('quota_ledgers_user_time_idx').on(table.userId, table.createdAt),
  check('quota_ledgers_balance_non_negative', sql`${table.balanceAfter} >= 0`),
]);

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  type: jobType('type').notNull(),
  status: jobStatus('status').notNull().default('QUEUED'),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  errorCode: text('error_code').notNull().default(''),
  errorMessage: text('error_message').notNull().default(''),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('jobs_dedupe_key_unique').on(table.dedupeKey),
  index('jobs_status_available_idx').on(table.status, table.availableAt),
  index('jobs_voice_status_idx').on(table.voiceProfileId, table.status),
]);
