CREATE TABLE `status_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`config_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "status_pages_visibility_valid" CHECK("status_pages"."visibility" IN ('private', 'public')),
	CONSTRAINT "status_pages_config_revision_positive" CHECK("status_pages"."config_revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_pages_slug_uq` ON `status_pages` (`slug`);--> statement-breakpoint
CREATE INDEX `status_pages_visibility_enabled_idx` ON `status_pages` (`visibility`,`enabled`);--> statement-breakpoint
CREATE TABLE `status_page_services` (
	`id` text PRIMARY KEY NOT NULL,
	`status_page_id` text NOT NULL,
	`source_integration_id` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`show_incident_history` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "status_page_services_sort_order_valid" CHECK("status_page_services"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `status_page_services_page_sort_idx` ON `status_page_services` (`status_page_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `status_page_services_page_integration_uq` ON `status_page_services` (`status_page_id`,`source_integration_id`);--> statement-breakpoint
CREATE TABLE `maintenance_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_windows_status_valid" CHECK("maintenance_windows"."status" IN ('scheduled','active','completed','cancelled')),
	CONSTRAINT "maintenance_windows_range_valid" CHECK("maintenance_windows"."ends_at" >= "maintenance_windows"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `maintenance_windows_status_starts_idx` ON `maintenance_windows` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `maintenance_window_targets` (
	`maintenance_id` text NOT NULL,
	`integration_id` text NOT NULL,
	FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_window_targets_uq` ON `maintenance_window_targets` (`maintenance_id`,`integration_id`);--> statement-breakpoint
CREATE INDEX `maintenance_window_targets_integration_idx` ON `maintenance_window_targets` (`integration_id`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 10, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
