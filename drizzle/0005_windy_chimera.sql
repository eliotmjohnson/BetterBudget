CREATE TYPE "public"."bill_reminder_kind" AS ENUM('upcoming', 'overdue');--> statement-breakpoint
CREATE TABLE "bill_reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"budget_item_id" uuid NOT NULL,
	"month" date NOT NULL,
	"kind" "bill_reminder_kind" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "push_vapid_keys" (
	"id" smallint PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_vapid_keys_singleton_check" CHECK ("push_vapid_keys"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "bill_reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "bill_due_day" smallint;--> statement-breakpoint
ALTER TABLE "budget_items" ADD COLUMN "bill_lead_days" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_budget_items" ADD COLUMN "bill_due_day_override" smallint;--> statement-breakpoint
ALTER TABLE "bill_reminder_deliveries" ADD CONSTRAINT "bill_reminder_deliveries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_reminder_deliveries" ADD CONSTRAINT "bill_reminder_deliveries_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_reminder_deliveries_item_month_kind_uidx" ON "bill_reminder_deliveries" USING btree ("budget_item_id","month","kind");--> statement-breakpoint
CREATE INDEX "bill_reminder_deliveries_household_idx" ON "bill_reminder_deliveries" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_household_idx" ON "push_subscriptions" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_bill_due_day_check" CHECK ("budget_items"."bill_due_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_bill_lead_days_check" CHECK ("budget_items"."bill_lead_days" in (0, 1, 3, 7));--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_bill_reminder_due_day_check" CHECK (not "budget_items"."bill_reminder_enabled" or "budget_items"."bill_due_day" is not null);--> statement-breakpoint
ALTER TABLE "monthly_budget_items" ADD CONSTRAINT "monthly_budget_items_bill_due_day_override_check" CHECK ("monthly_budget_items"."bill_due_day_override" between 1 and 31);