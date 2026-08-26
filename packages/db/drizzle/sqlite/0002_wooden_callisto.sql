CREATE TABLE `board_group_permissions` (
	`board_id` text NOT NULL,
	`group_id` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_group_permissions_valid" CHECK("board_group_permissions"."permission" IN ('board.view','board.edit','board.manage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_group_permissions_uq` ON `board_group_permissions` (`board_id`,`group_id`,`permission`);--> statement-breakpoint
CREATE INDEX `board_group_permissions_group_idx` ON `board_group_permissions` (`group_id`,`board_id`);--> statement-breakpoint
CREATE TABLE `board_user_permissions` (
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_user_permissions_valid" CHECK("board_user_permissions"."permission" IN ('board.view','board.edit','board.manage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_user_permissions_uq` ON `board_user_permissions` (`board_id`,`user_id`,`permission`);--> statement-breakpoint
CREATE INDEX `board_user_permissions_user_idx` ON `board_user_permissions` (`user_id`,`board_id`);