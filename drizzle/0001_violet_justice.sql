CREATE TABLE "monthly_budget_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_budget_categories" ADD CONSTRAINT "monthly_budget_categories_month_id_budget_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budget_categories" ADD CONSTRAINT "monthly_budget_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budget_categories_month_category_uidx" ON "monthly_budget_categories" USING btree ("month_id","category_id");--> statement-breakpoint
CREATE INDEX "monthly_budget_categories_category_idx" ON "monthly_budget_categories" USING btree ("category_id");--> statement-breakpoint
INSERT INTO "monthly_budget_categories" ("month_id", "category_id")
SELECT DISTINCT "monthly_budget_items"."month_id", "budget_items"."category_id"
FROM "monthly_budget_items"
INNER JOIN "budget_items"
    ON "monthly_budget_items"."budget_item_id" = "budget_items"."id"
ON CONFLICT ("month_id", "category_id") DO NOTHING;
