ALTER TABLE "messages" ADD COLUMN "interaction_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "personality_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "speech_habit_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_personality_note_length" CHECK (char_length("voice_profiles"."personality_note") <= 300);--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_speech_habit_note_length" CHECK (char_length("voice_profiles"."speech_habit_note") <= 300);