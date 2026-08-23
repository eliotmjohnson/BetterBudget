ALTER TABLE "budget_items" ADD COLUMN "archived_from_month" date;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "archived_from_month" date;--> statement-breakpoint
UPDATE "budget_items"
SET "archived_from_month" = date_trunc('month', "archived_at")::date
WHERE "archived_at" IS NOT NULL;--> statement-breakpoint
UPDATE "categories"
SET "archived_from_month" = date_trunc('month', "archived_at")::date
WHERE "archived_at" IS NOT NULL;
