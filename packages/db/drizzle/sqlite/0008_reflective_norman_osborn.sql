CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`opened_at` integer NOT NULL,
	`last_changed_at` integer NOT NULL,
	`resolved_at` integer,
	`opening_event_id` text,
	`closing_event_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "incidents_kind_valid" CHECK("incidents"."kind" IN ('availability')),
	CONSTRAINT "incidents_severity_valid" CHECK("incidents"."severity" IN ('info','success','warning','error','critical')),
	CONSTRAINT "incidents_status_valid" CHECK("incidents"."status" IN ('open','resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_open_integration_kind_uq` ON `incidents` (`integration_id`,`kind`) WHERE "incidents"."status" = 'open';--> statement-breakpoint
CREATE INDEX `incidents_status_changed_idx` ON `incidents` (`status`,`last_changed_at`);--> statement-breakpoint
CREATE INDEX `incidents_integration_idx` ON `incidents` (`integration_id`);--> statement-breakpoint
CREATE TABLE `incident_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "incident_events_type_valid" CHECK("incident_events"."event_type" IN ('opened','resolved','note'))
);
--> statement-breakpoint
CREATE INDEX `incident_events_incident_created_idx` ON `incident_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`source_integration_id` text,
	`dedup_key` text,
	`destination_path` text,
	`read_at` integer,
	`dismissed_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notifications_category_valid" CHECK("notifications"."category" IN ('integration','automation','system','security','backup')),
	CONSTRAINT "notifications_severity_valid" CHECK("notifications"."severity" IN ('info','success','warning','error','critical')),
	CONSTRAINT "notifications_source_type_valid" CHECK("notifications"."source_type" IN ('integration','automation','system','security','backup','incident'))
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_unread_idx` ON `notifications` (`user_id`,`read_at`,`dismissed_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_dedup_idx` ON `notifications` (`user_id`,`dedup_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_expires_at_idx` ON `notifications` (`expires_at`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 8, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
