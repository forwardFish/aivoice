CREATE TYPE "public"."point_ledger_type" AS ENUM('REGISTER_GRANT', 'PURCHASE_GRANT', 'GENERATION_CONSUME', 'REFUND', 'MANUAL_ADJUSTMENT', 'INVITE_GRANT');--> statement-breakpoint
CREATE TABLE "point_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"signup_granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_accounts_balance_non_negative" CHECK ("point_accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "point_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voice_profile_id" uuid,
	"order_id" uuid,
	"message_id" uuid,
	"type" "point_ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"request_key" text,
	"source" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledgers_balance_non_negative" CHECK ("point_ledgers"."balance_after" >= 0),
	CONSTRAINT "point_ledgers_amount_non_zero" CHECK ("point_ledgers"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_voice_profile_id_voice_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "voice_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "point_accounts" ADD CONSTRAINT "point_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledgers" ADD CONSTRAINT "point_ledgers_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "point_accounts" ("user_id", "balance", "signup_granted_at", "created_at", "updated_at")
SELECT
  u."id",
  COALESCE(SUM(v."trial_quota_remaining" + v."paid_quota_remaining"), 0)::integer,
  NOW(),
  NOW(),
  NOW()
FROM "users" u
LEFT JOIN "voice_profiles" v ON v."user_id" = u."id" AND v."deleted_at" IS NULL
GROUP BY u."id";--> statement-breakpoint
INSERT INTO "point_ledgers" ("user_id", "type", "amount", "balance_after", "request_key", "source", "created_at")
SELECT "user_id", 'MANUAL_ADJUSTMENT', "balance", "balance", 'legacy-quota:' || "user_id"::text, 'LEGACY_QUOTA_MIGRATION', NOW()
FROM "point_accounts"
WHERE "balance" > 0;--> statement-breakpoint
UPDATE "orders" SET "points" = "quota", "points_granted_at" = "quota_granted_at";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "points" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledgers_type_order_unique" ON "point_ledgers" USING btree ("type","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledgers_type_message_unique" ON "point_ledgers" USING btree ("type","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledgers_type_request_unique" ON "point_ledgers" USING btree ("type","request_key");--> statement-breakpoint
CREATE INDEX "point_ledgers_user_time_idx" ON "point_ledgers" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_points_positive" CHECK ("orders"."points" > 0);
