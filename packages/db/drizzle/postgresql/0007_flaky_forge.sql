CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"trigger_type" text NOT NULL,
	"trigger_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condition_config_json" jsonb,
	"action_type" text NOT NULL,
	"action_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cooldown_seconds" integer DEFAULT 60 NOT NULL,
	"config_revision" integer DEFAULT 1 NOT NULL,
	"last_enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "automation_rules_trigger_type_valid" CHECK ("automation_rules"."trigger_type" IN ('schedule','event','status-transition')),
	CONSTRAINT "automation_rules_action_type_valid" CHECK ("automation_rules"."action_type" IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline')),
	CONSTRAINT "automation_rules_config_revision_positive" CHECK ("automation_rules"."config_revision" > 0),
	CONSTRAINT "automation_rules_cooldown_bounds" CHECK ("automation_rules"."cooldown_seconds" BETWEEN 0 AND 86400)
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"automation_id" uuid,
	"run_key" text NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"action_type" text NOT NULL,
	"error_code" text,
	"resource_id" text,
	"summary_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "automation_runs_trigger_type_valid" CHECK ("automation_runs"."trigger_type" IN ('schedule','event','status-transition')),
	CONSTRAINT "automation_runs_status_valid" CHECK ("automation_runs"."status" IN ('scheduled','running','succeeded','failed','skipped','denied','unknown')),
	CONSTRAINT "automation_runs_action_type_valid" CHECK ("automation_runs"."action_type" IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline'))
);
--> statement-breakpoint
CREATE TABLE "automation_runtime_state" (
	"automation_id" uuid PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_triggered_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_observed_state" jsonb,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	CONSTRAINT "automation_runtime_state_failure_count" CHECK ("automation_runtime_state"."failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automation_rules_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runtime_state" ADD CONSTRAINT "automation_runtime_state_automation_id_automation_rules_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rules_owner_idx" ON "automation_rules" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "automation_rules_enabled_idx" ON "automation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_run_key_uq" ON "automation_runs" USING btree ("run_key");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_started_idx" ON "automation_runs" USING btree ("automation_id","started_at");--> statement-breakpoint
CREATE INDEX "automation_runs_finished_at_idx" ON "automation_runs" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "automation_runtime_state_next_run_idx" ON "automation_runtime_state" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "automation_runtime_state_lease_idx" ON "automation_runtime_state" USING btree ("lease_until");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 7, "updated_at" = now() WHERE "id" = 'global';