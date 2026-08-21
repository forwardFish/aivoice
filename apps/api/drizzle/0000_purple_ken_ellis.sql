CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('PROCESS_VOICE', 'GENERATE_MESSAGE', 'DELETE_VOICE', 'DELETE_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('SOURCE_VIDEO', 'REFERENCE_AUDIO', 'PREVIEW_AUDIO', 'GENERATED_AUDIO');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('PENDING', 'READY', 'DELETE_PENDING', 'DELETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."message_mode" AS ENUM('CHAT', 'EXACT_SPEECH');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'CLOSED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."permission_type" AS ENUM('SELF', 'OTHER', 'MINOR');--> statement-breakpoint
CREATE TYPE "public"."provider_status" AS ENUM('PROCESSING', 'READY', 'REJECTED', 'DELETE_PENDING', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."quota_bucket" AS ENUM('TRIAL', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."quota_ledger_type" AS ENUM('TRIAL_GRANT', 'PURCHASE_GRANT', 'GENERATION_CONSUME', 'REFUND', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."voice_status" AS ENUM('DRAFT', 'UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED');--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"permission_type" "permission_type" NOT NULL,
	"consent_version" text NOT NULL,
	"consent_text_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid,
	"message_id" uuid,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"error_code" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid,
	"message_id" uuid,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'PENDING' NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer,
	"sha256" text NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"mode" "message_mode" NOT NULL,
	"status" "message_status" DEFAULT 'PENDING' NOT NULL,
	"input_text" text NOT NULL,
	"output_text" text DEFAULT '' NOT NULL,
	"error_code" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"amount_fen" integer NOT NULL,
	"quota" integer NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"prepay_id" text DEFAULT '' NOT NULL,
	"transaction_id" text,
	"paid_at" timestamp with time zone,
	"quota_granted_at" timestamp with time zone,
	"notify_digest" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amount_positive" CHECK ("orders"."amount_fen" > 0),
	CONSTRAINT "orders_quota_positive" CHECK ("orders"."quota" > 0)
);
--> statement-breakpoint
CREATE TABLE "quota_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"order_id" uuid,
	"message_id" uuid,
	"type" "quota_ledger_type" NOT NULL,
	"bucket" "quota_bucket" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_ledgers_balance_non_negative" CHECK ("quota_ledgers"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"openid" text NOT NULL,
	"unionid" text,
	"nickname" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"trial_voice_profile_id" uuid,
	"trial_custom_generation_granted_at" timestamp with time zone,
	"trial_custom_generation_consumed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"target_model" text NOT NULL,
	"provider_voice_id_encrypted" text NOT NULL,
	"status" "provider_status" DEFAULT 'PROCESSING' NOT NULL,
	"deletion_error" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"permission_type" "permission_type",
	"status" "voice_status" DEFAULT 'DRAFT' NOT NULL,
	"trial_quota_remaining" integer DEFAULT 0 NOT NULL,
	"paid_quota_remaining" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"failure_code" text DEFAULT '' NOT NULL,
	"failure_message" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_profiles_quota_non_negative" CHECK ("voice_profiles"."trial_quota_remaining" >= 0 AND "voice_profiles"."paid_quota_remaining" >= 0)
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledgers" ADD CONSTRAINT "quota_ledgers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledgers" ADD CONSTRAINT "quota_ledgers_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledgers" ADD CONSTRAINT "quota_ledgers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledgers" ADD CONSTRAINT "quota_ledgers_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_models" ADD CONSTRAINT "voice_models_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_voice_time_idx" ON "consent_records" USING btree ("voice_profile_id","confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_voice_unique" ON "conversations" USING btree ("voice_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key_unique" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_status_available_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "jobs_voice_status_idx" ON "jobs" USING btree ("voice_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_unique" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_assets_user_kind_status_idx" ON "media_assets" USING btree ("user_id","kind","status");--> statement-breakpoint
CREATE INDEX "media_assets_voice_kind_idx" ON "media_assets" USING btree ("voice_profile_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_user_idempotency_unique" ON "messages" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_voice_status_time_idx" ON "messages" USING btree ("voice_profile_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_no_unique" ON "orders" USING btree ("order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_transaction_id_unique" ON "orders" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "orders_user_time_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_ledgers_type_order_unique" ON "quota_ledgers" USING btree ("type","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_ledgers_type_message_unique" ON "quota_ledgers" USING btree ("type","message_id");--> statement-breakpoint
CREATE INDEX "quota_ledgers_user_time_idx" ON "quota_ledgers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expiry_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_openid_unique" ON "users" USING btree ("openid");--> statement-breakpoint
CREATE INDEX "users_unionid_idx" ON "users" USING btree ("unionid");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_models_voice_unique" ON "voice_models" USING btree ("voice_profile_id");--> statement-breakpoint
CREATE INDEX "voice_profiles_user_status_idx" ON "voice_profiles" USING btree ("user_id","status");