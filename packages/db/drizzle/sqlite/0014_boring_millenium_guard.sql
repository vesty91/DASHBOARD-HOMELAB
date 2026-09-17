CREATE TABLE `slo_alert_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`slo_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`warning_threshold` real NOT NULL,
	`critical_threshold` real NOT NULL,
	`cooldown_seconds` integer DEFAULT 3600 NOT NULL,
	`notify_on_recovery` integer DEFAULT true NOT NULL,
	`config_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`slo_id`) REFERENCES `service_slos`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "slo_alert_policies_warning_positive" CHECK("slo_alert_policies"."warning_threshold" > 0),
	CONSTRAINT "slo_alert_policies_critical_gt_warning" CHECK("slo_alert_policies"."critical_threshold" > "slo_alert_policies"."warning_threshold"),
	CONSTRAINT "slo_alert_policies_cooldown_range" CHECK("slo_alert_policies"."cooldown_seconds" >= 60 AND "slo_alert_policies"."cooldown_seconds" <= 86400),
	CONSTRAINT "slo_alert_policies_config_revision_positive" CHECK("slo_alert_policies"."config_revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slo_alert_policies_slo_id_uq` ON `slo_alert_policies` (`slo_id`);--> statement-breakpoint
CREATE TABLE `slo_alert_runtime_state` (
	`slo_id` text PRIMARY KEY NOT NULL,
	`last_state` text NOT NULL,
	`last_notified_state` text,
	`last_notified_at` integer,
	`last_transition_at` integer,
	`last_burn_rate` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`slo_id`) REFERENCES `service_slos`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "slo_alert_runtime_state_valid" CHECK("slo_alert_runtime_state"."last_state" IN ('healthy', 'warning', 'critical', 'insufficient-data'))
);
--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 14, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
