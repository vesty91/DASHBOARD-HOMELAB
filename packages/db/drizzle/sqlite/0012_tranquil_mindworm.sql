CREATE TABLE `service_slos` (
	`id` text PRIMARY KEY NOT NULL,
	`service_key` text NOT NULL,
	`name` text NOT NULL,
	`objective_basis_points` integer NOT NULL,
	`window_days` integer NOT NULL,
	`exclude_maintenance` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "service_slos_objective_bps_range" CHECK("service_slos"."objective_basis_points" >= 90000 AND "service_slos"."objective_basis_points" <= 99999),
	CONSTRAINT "service_slos_window_days_valid" CHECK("service_slos"."window_days" IN (7, 30, 90)),
	CONSTRAINT "service_slos_config_revision_positive" CHECK("service_slos"."config_revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_slos_service_name_uq` ON `service_slos` (`service_key`,`name`);--> statement-breakpoint
CREATE INDEX `service_slos_service_key_idx` ON `service_slos` (`service_key`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 12, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
