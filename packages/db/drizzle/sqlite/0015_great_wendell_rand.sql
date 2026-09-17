CREATE TABLE `service_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`upstream_service_key` text NOT NULL,
	`downstream_service_key` text NOT NULL,
	`relationship` text DEFAULT 'depends_on' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "service_dependencies_relationship_valid" CHECK("service_dependencies"."relationship" IN ('depends_on')),
	CONSTRAINT "service_dependencies_no_self_loop" CHECK("service_dependencies"."upstream_service_key" != "service_dependencies"."downstream_service_key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_dependencies_edge_uq` ON `service_dependencies` (`upstream_service_key`,`downstream_service_key`,`relationship`);--> statement-breakpoint
CREATE INDEX `service_dependencies_upstream_idx` ON `service_dependencies` (`upstream_service_key`);--> statement-breakpoint
CREATE INDEX `service_dependencies_downstream_idx` ON `service_dependencies` (`downstream_service_key`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 15, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
