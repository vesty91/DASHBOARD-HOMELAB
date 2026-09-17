CREATE TABLE "slo_alert_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slo_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"warning_threshold" double precision NOT NULL,
	"critical_threshold" double precision NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"notify_on_recovery" boolean DEFAULT true NOT NULL,
	"config_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slo_alert_policies_warning_positive" CHECK ("slo_alert_policies"."warning_threshold" > 0),
	CONSTRAINT "slo_alert_policies_critical_gt_warning" CHECK ("slo_alert_policies"."critical_threshold" > "slo_alert_policies"."warning_threshold"),
	CONSTRAINT "slo_alert_policies_cooldown_range" CHECK ("slo_alert_policies"."cooldown_seconds" >= 60 AND "slo_alert_policies"."cooldown_seconds" <= 86400),
	CONSTRAINT "slo_alert_policies_config_revision_positive" CHECK ("slo_alert_policies"."config_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "slo_alert_runtime_state" (
	"slo_id" uuid PRIMARY KEY NOT NULL,
	"last_state" text NOT NULL,
	"last_notified_state" text,
	"last_notified_at" timestamp with time zone,
	"last_transition_at" timestamp with time zone,
	"last_burn_rate" double precision,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slo_alert_runtime_state_valid" CHECK ("slo_alert_runtime_state"."last_state" IN ('healthy', 'warning', 'critical', 'insufficient-data'))
);
--> statement-breakpoint
ALTER TABLE "slo_alert_policies" ADD CONSTRAINT "slo_alert_policies_slo_id_service_slos_id_fk" FOREIGN KEY ("slo_id") REFERENCES "public"."service_slos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slo_alert_runtime_state" ADD CONSTRAINT "slo_alert_runtime_state_slo_id_service_slos_id_fk" FOREIGN KEY ("slo_id") REFERENCES "public"."service_slos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slo_alert_policies_slo_id_uq" ON "slo_alert_policies" USING btree ("slo_id");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 14, "updated_at" = now() WHERE "id" = 'global';
