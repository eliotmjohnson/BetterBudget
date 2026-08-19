ALTER TABLE "income_plans" ADD COLUMN "icon" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_plans" ADD COLUMN "tone" "category_tone" DEFAULT 'blue' NOT NULL;