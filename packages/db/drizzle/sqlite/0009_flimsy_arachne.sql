CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`endpoint_ciphertext` text NOT NULL,
	`endpoint_iv` text NOT NULL,
	`endpoint_auth_tag` text NOT NULL,
	`p256dh_ciphertext` text NOT NULL,
	`p256dh_iv` text NOT NULL,
	`p256dh_auth_tag` text NOT NULL,
	`auth_ciphertext` text NOT NULL,
	`auth_iv` text NOT NULL,
	`auth_auth_tag` text NOT NULL,
	`key_version` integer NOT NULL,
	`user_agent` text,
	`disabled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_user_endpoint_hash_uq` ON `push_subscriptions` (`user_id`,`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_active_idx` ON `push_subscriptions` (`user_id`,`disabled_at`);--> statement-breakpoint
UPDATE `server_settings` SET `schema_version` = 9, `updated_at` = unixepoch()*1000 WHERE `id` = 'global';
