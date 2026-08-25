CREATE TYPE "public"."voice_relationship_type" AS ENUM('SELF', 'MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'CHILD', 'PARTNER', 'FRIEND', 'OTHER');--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "relationship_type" "voice_relationship_type";--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "relationship_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_relationship_label_length" CHECK (char_length("voice_profiles"."relationship_label") <= 10);