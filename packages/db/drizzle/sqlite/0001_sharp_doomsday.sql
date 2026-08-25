CREATE TABLE `group_roles` (
	`group_id` text NOT NULL,
	`role_id` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_roles_group_role_uq` ON `group_roles` (`group_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_role_permission_uq` ON `role_permissions` (`role_id`,`permission`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_user_role_uq` ON `user_roles` (`user_id`,`role_id`);--> statement-breakpoint
ALTER TABLE `server_settings` ADD `onboarding_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `username_canonical` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `username_canonical` = lower(`username`);--> statement-breakpoint
ALTER TABLE `users` ADD `auth_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_canonical_unique` ON `users` (`username_canonical`);
--> statement-breakpoint
INSERT OR IGNORE INTO `server_settings` (`id`,`schema_version`,`onboarding_completed`,`created_at`,`updated_at`) VALUES ('global',2,0,unixepoch()*1000,unixepoch()*1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `roles` (`id`,`name`,`description`,`created_at`,`updated_at`) VALUES
('00000000-0000-4000-8000-000000000001','SYSTEM_ADMIN','System administrator',unixepoch()*1000,unixepoch()*1000),
('00000000-0000-4000-8000-000000000002','ADMIN','Administrator',unixepoch()*1000,unixepoch()*1000),
('00000000-0000-4000-8000-000000000003','EDITOR','Editor',unixepoch()*1000,unixepoch()*1000),
('00000000-0000-4000-8000-000000000004','USER','User',unixepoch()*1000,unixepoch()*1000),
('00000000-0000-4000-8000-000000000005','VIEWER','Viewer',unixepoch()*1000,unixepoch()*1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`,`permission`) VALUES
('00000000-0000-4000-8000-000000000002','user.read'),('00000000-0000-4000-8000-000000000002','user.manage'),('00000000-0000-4000-8000-000000000002','group.read'),('00000000-0000-4000-8000-000000000002','group.manage'),('00000000-0000-4000-8000-000000000002','board.create'),('00000000-0000-4000-8000-000000000002','board.read.all'),('00000000-0000-4000-8000-000000000002','board.manage.all'),('00000000-0000-4000-8000-000000000002','app.read'),('00000000-0000-4000-8000-000000000002','app.manage'),('00000000-0000-4000-8000-000000000002','integration.create'),('00000000-0000-4000-8000-000000000002','integration.read'),('00000000-0000-4000-8000-000000000002','integration.manage'),
('00000000-0000-4000-8000-000000000003','app.read'),('00000000-0000-4000-8000-000000000003','integration.read'),('00000000-0000-4000-8000-000000000003','board.create'),('00000000-0000-4000-8000-000000000003','board.edit'),
('00000000-0000-4000-8000-000000000004','app.read'),('00000000-0000-4000-8000-000000000004','integration.read'),('00000000-0000-4000-8000-000000000004','board.create'),
('00000000-0000-4000-8000-000000000005','app.read'),('00000000-0000-4000-8000-000000000005','integration.read');
