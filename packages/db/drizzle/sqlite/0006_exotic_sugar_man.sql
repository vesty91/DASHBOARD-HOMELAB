CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`outcome` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`user_agent` text,
	`session_id_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_logs_outcome_valid" CHECK("audit_logs"."outcome" IN ('success','failure','denied'))
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_created_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_revoked_idx` ON `auth_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `oidc_group_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`oidc_group` text NOT NULL,
	`local_group_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`local_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_group_mappings_group_local_uq` ON `oidc_group_mappings` (`oidc_group`,`local_group_id`);--> statement-breakpoint
CREATE TABLE `oidc_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_identities_issuer_subject_uq` ON `oidc_identities` (`issuer`,`subject`);--> statement-breakpoint
CREATE INDEX `oidc_identities_user_idx` ON `oidc_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `oidc_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_issuer` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_client_id` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_display_name` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_scopes` text DEFAULT 'openid profile email groups' NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_redirect_uri` text;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_group_claim` text DEFAULT 'groups' NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_auto_link_verified_email` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_auto_provision` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `server_settings` ADD `oidc_allow_local_login` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 6, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`,`permission`) VALUES
('00000000-0000-4000-8000-000000000002','session.read.self'),
('00000000-0000-4000-8000-000000000002','session.revoke.self'),
('00000000-0000-4000-8000-000000000003','session.read.self'),
('00000000-0000-4000-8000-000000000003','session.revoke.self'),
('00000000-0000-4000-8000-000000000004','session.read.self'),
('00000000-0000-4000-8000-000000000004','session.revoke.self'),
('00000000-0000-4000-8000-000000000005','session.read.self'),
('00000000-0000-4000-8000-000000000005','session.revoke.self');