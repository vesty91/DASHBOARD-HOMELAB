CREATE TABLE "status_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"config_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "status_pages_visibility_valid" CHECK ("status_pages"."visibility" IN ('private', 'public')),
	CONSTRAINT "status_pages_config_revision_positive" CHECK ("status_pages"."config_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "status_page_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status_page_id" uuid NOT NULL,
	"source_integration_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"show_incident_history" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "status_page_services_sort_order_valid" CHECK ("status_page_services"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "maintenance_windows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "maintenance_windows_status_valid" CHECK ("maintenance_windows"."status" IN ('scheduled','active','completed','cancelled')),
	CONSTRAINT "maintenance_windows_range_valid" CHECK ("maintenance_windows"."ends_at" >= "maintenance_windows"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "maintenance_window_targets" (
	"maintenance_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_services" ADD CONSTRAINT "status_page_services_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_services" ADD CONSTRAINT "status_page_services_source_integration_id_integrations_id_fk" FOREIGN KEY ("source_integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_targets" ADD CONSTRAINT "maintenance_window_targets_maintenance_id_maintenance_windows_id_fk" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenance_windows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_targets" ADD CONSTRAINT "maintenance_window_targets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_pages_slug_uq" ON "status_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "status_pages_visibility_enabled_idx" ON "status_pages" USING btree ("visibility","enabled");--> statement-breakpoint
CREATE INDEX "status_page_services_page_sort_idx" ON "status_page_services" USING btree ("status_page_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "status_page_services_page_integration_uq" ON "status_page_services" USING btree ("status_page_id","source_integration_id");--> statement-breakpoint
CREATE INDEX "maintenance_windows_status_starts_idx" ON "maintenance_windows" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_window_targets_uq" ON "maintenance_window_targets" USING btree ("maintenance_id","integration_id");--> statement-breakpoint
CREATE INDEX "maintenance_window_targets_integration_idx" ON "maintenance_window_targets" USING btree ("integration_id");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 10, "updated_at" = now() WHERE "id" = 'global';
