CREATE TABLE "app_tags" (
	"app_id" uuid NOT NULL,
	"value" text NOT NULL,
	"canonical_value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "target" text DEFAULT 'new-tab' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "health_status" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "last_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "last_http_status" integer;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "last_health_error_code" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "health_config_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tags" ADD CONSTRAINT "app_tags_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_tags_app_canonical_uq" ON "app_tags" USING btree ("app_id","canonical_value");--> statement-breakpoint
CREATE INDEX "app_tags_canonical_idx" ON "app_tags" USING btree ("canonical_value");--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_target_valid" CHECK ("apps"."target" IN ('same-tab','new-tab'));--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_health_status_valid" CHECK ("apps"."health_status" IN ('unknown','up','down','timeout','error'));--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_health_revision_positive" CHECK ("apps"."health_config_revision" > 0);