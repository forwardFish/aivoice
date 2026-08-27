ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "client_request_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prepay_request_digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_appid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_mchid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payer_openid" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN IF NOT EXISTS "age_years" integer;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN IF NOT EXISTS "gender" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN IF NOT EXISTS "user_life_stage" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN IF NOT EXISTS "background" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN IF NOT EXISTS "relationship_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_user_client_request_unique" ON "orders" USING btree ("user_id","client_request_key");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_age_years_valid') THEN
    ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_age_years_valid" CHECK ("voice_profiles"."age_years" IS NULL OR ("voice_profiles"."age_years" >= 0 AND "voice_profiles"."age_years" <= 120));
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_gender_valid') THEN
    ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_gender_valid" CHECK ("voice_profiles"."gender" IS NULL OR "voice_profiles"."gender" IN ('FEMALE','MALE'));
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_user_life_stage_valid') THEN
    ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_life_stage_valid" CHECK ("voice_profiles"."user_life_stage" IS NULL OR "voice_profiles"."user_life_stage" IN ('CHILD','TEEN','ADULT','OLDER_ADULT'));
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_background_length') THEN
    ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_background_length" CHECK (char_length("voice_profiles"."background") <= 300);
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='voice_profiles_relationship_note_length') THEN
    ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_relationship_note_length" CHECK (char_length("voice_profiles"."relationship_note") <= 300);
  END IF;
END $$;
