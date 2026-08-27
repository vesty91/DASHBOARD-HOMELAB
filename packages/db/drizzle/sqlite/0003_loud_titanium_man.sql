PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`icon_ref` text,
	`color` text,
	`healthcheck_enabled` integer DEFAULT false NOT NULL,
	`healthcheck_config_json` text,
	`target` text DEFAULT 'new-tab' NOT NULL,
	`health_status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`last_latency_ms` integer,
	`last_http_status` integer,
	`last_health_error_code` text,
	`health_config_revision` integer DEFAULT 1 NOT NULL,
	`integration_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "apps_target_valid" CHECK("__new_apps"."target" IN ('same-tab','new-tab')),
	CONSTRAINT "apps_health_status_valid" CHECK("__new_apps"."health_status" IN ('unknown','up','down','timeout','error')),
	CONSTRAINT "apps_health_revision_positive" CHECK("__new_apps"."health_config_revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_apps`("id", "name", "description", "url", "icon_ref", "color", "healthcheck_enabled", "healthcheck_config_json", "target", "health_status", "last_checked_at", "last_latency_ms", "last_http_status", "last_health_error_code", "health_config_revision", "integration_id", "created_at", "updated_at") SELECT "id", "name", "description", "url", "icon_ref", "color", "healthcheck_enabled", "healthcheck_config_json", 'new-tab', 'unknown', NULL, NULL, NULL, NULL, 1, "integration_id", "created_at", "updated_at" FROM `apps`;--> statement-breakpoint
DROP TABLE `apps`;--> statement-breakpoint
ALTER TABLE `__new_apps` RENAME TO `apps`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `apps_name_idx` ON `apps` (`name`);--> statement-breakpoint
CREATE INDEX `apps_integration_idx` ON `apps` (`integration_id`);--> statement-breakpoint
CREATE TABLE `app_tags` (
	`app_id` text NOT NULL,
	`value` text NOT NULL,
	`canonical_value` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `app_tags_app_canonical_uq` ON `app_tags` (`app_id`,`canonical_value`);--> statement-breakpoint
CREATE INDEX `app_tags_canonical_idx` ON `app_tags` (`canonical_value`);
