CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`icon_ref` text,
	`color` text,
	`healthcheck_enabled` integer DEFAULT false NOT NULL,
	`healthcheck_config_json` text,
	`integration_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `apps_name_idx` ON `apps` (`name`);--> statement-breakpoint
CREATE INDEX `apps_integration_idx` ON `apps` (`integration_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`owner_user_id` text,
	`theme_json` text DEFAULT '{}' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "boards_revision_positive" CHECK("boards"."revision" > 0),
	CONSTRAINT "boards_visibility_valid" CHECK("boards"."visibility" IN ('private', 'authenticated', 'public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boards_slug_uq` ON `boards` (`slug`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_user_uq` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `integration_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`key` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_secrets_integration_key_uq` ON `integration_secrets` (`integration_id`,`key`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "integrations_status_valid" CHECK("integrations"."status" IN ('unknown', 'available', 'unavailable'))
);
--> statement-breakpoint
CREATE INDEX `integrations_type_idx` ON `integrations` (`type`);--> statement-breakpoint
CREATE INDEX `integrations_status_idx` ON `integrations` (`status`);--> statement-breakpoint
CREATE TABLE `item_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`layout_id` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`w` integer NOT NULL,
	`h` integer NOT NULL,
	`min_w` integer,
	`min_h` integer,
	`max_w` integer,
	`max_h` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_layouts_position_valid" CHECK("item_layouts"."x" >= 0 AND "item_layouts"."y" >= 0 AND "item_layouts"."w" > 0 AND "item_layouts"."h" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_layouts_item_layout_uq` ON `item_layouts` (`item_id`,`layout_id`);--> statement-breakpoint
CREATE INDEX `item_layouts_layout_idx` ON `item_layouts` (`layout_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`widget_type` text NOT NULL,
	`widget_version` integer NOT NULL,
	`title` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`integration_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `items_board_idx` ON `items` (`board_id`);--> statement-breakpoint
CREATE INDEX `items_integration_idx` ON `items` (`integration_id`);--> statement-breakpoint
CREATE TABLE `layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`breakpoint` text NOT NULL,
	`columns` integer NOT NULL,
	`row_height` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "layouts_dimensions_valid" CHECK("layouts"."columns" > 0 AND "layouts"."row_height" > 0 AND "layouts"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `layouts_board_idx` ON `layouts` (`board_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `layouts_board_breakpoint_uq` ON `layouts` (`board_id`,`breakpoint`);--> statement-breakpoint
CREATE TABLE `server_settings` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`instance_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "server_settings_singleton" CHECK("server_settings"."id" = 'global')
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`display_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`is_system_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_status_valid" CHECK("users"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);