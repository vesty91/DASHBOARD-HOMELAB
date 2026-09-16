CREATE TABLE "incident_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"incident_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "incident_events_type_valid" CHECK ("incident_events"."event_type" IN ('opened','resolved','note'))
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"integration_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_changed_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"opening_event_id" text,
	"closing_event_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "incidents_kind_valid" CHECK ("incidents"."kind" IN ('availability')),
	CONSTRAINT "incidents_severity_valid" CHECK ("incidents"."severity" IN ('info','success','warning','error','critical')),
	CONSTRAINT "incidents_status_valid" CHECK ("incidents"."status" IN ('open','resolved'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"source_integration_id" uuid,
	"dedup_key" text,
	"destination_path" text,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_category_valid" CHECK ("notifications"."category" IN ('integration','automation','system','security','backup')),
	CONSTRAINT "notifications_severity_valid" CHECK ("notifications"."severity" IN ('info','success','warning','error','critical')),
	CONSTRAINT "notifications_source_type_valid" CHECK ("notifications"."source_type" IN ('integration','automation','system','security','backup','incident'))
);
--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_integration_id_integrations_id_fk" FOREIGN KEY ("source_integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_events_incident_created_idx" ON "incident_events" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_open_integration_kind_uq" ON "incidents" USING btree ("integration_id","kind") WHERE "incidents"."status" = 'open';--> statement-breakpoint
CREATE INDEX "incidents_status_changed_idx" ON "incidents" USING btree ("status","last_changed_at");--> statement-breakpoint
CREATE INDEX "incidents_integration_idx" ON "incidents" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at","dismissed_at");--> statement-breakpoint
CREATE INDEX "notifications_user_dedup_idx" ON "notifications" USING btree ("user_id","dedup_key","created_at");--> statement-breakpoint
CREATE INDEX "notifications_expires_at_idx" ON "notifications" USING btree ("expires_at");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 8, "updated_at" = now() WHERE "id" = 'global';
