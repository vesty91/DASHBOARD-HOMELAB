CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT false NOT NULL,
	`owner_user_id` text,
	`trigger_type` text NOT NULL,
	`trigger_config_json` text DEFAULT '{}' NOT NULL,
	`condition_config_json` text,
	`action_type` text NOT NULL,
	`action_config_json` text DEFAULT '{}' NOT NULL,
	`cooldown_seconds` integer DEFAULT 60 NOT NULL,
	`config_revision` integer DEFAULT 1 NOT NULL,
	`last_enabled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "automation_rules_trigger_type_valid" CHECK("automation_rules"."trigger_type" IN ('schedule','event','status-transition')),
	CONSTRAINT "automation_rules_action_type_valid" CHECK("automation_rules"."action_type" IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline')),
	CONSTRAINT "automation_rules_config_revision_positive" CHECK("automation_rules"."config_revision" > 0),
	CONSTRAINT "automation_rules_cooldown_bounds" CHECK("automation_rules"."cooldown_seconds" BETWEEN 0 AND 86400)
);
--> statement-breakpoint
CREATE INDEX `automation_rules_owner_idx` ON `automation_rules` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `automation_rules_enabled_idx` ON `automation_rules` (`enabled`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text,
	`run_key` text NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_for` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`action_type` text NOT NULL,
	`error_code` text,
	`resource_id` text,
	`summary_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "automation_runs_trigger_type_valid" CHECK("automation_runs"."trigger_type" IN ('schedule','event','status-transition')),
	CONSTRAINT "automation_runs_status_valid" CHECK("automation_runs"."status" IN ('scheduled','running','succeeded','failed','skipped','denied','unknown')),
	CONSTRAINT "automation_runs_action_type_valid" CHECK("automation_runs"."action_type" IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_runs_run_key_uq` ON `automation_runs` (`run_key`);--> statement-breakpoint
CREATE INDEX `automation_runs_automation_started_idx` ON `automation_runs` (`automation_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_finished_at_idx` ON `automation_runs` (`finished_at`);--> statement-breakpoint
CREATE TABLE `automation_runtime_state` (
	`automation_id` text PRIMARY KEY NOT NULL,
	`next_run_at` integer,
	`last_triggered_at` integer,
	`last_completed_at` integer,
	`last_observed_state` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_until` integer,
	FOREIGN KEY (`automation_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_runtime_state_failure_count" CHECK("automation_runtime_state"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `automation_runtime_state_next_run_idx` ON `automation_runtime_state` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `automation_runtime_state_lease_idx` ON `automation_runtime_state` (`lease_until`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 7, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';