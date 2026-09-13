CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`attempt` integer DEFAULT 1 NOT NULL,
	`error_code` text,
	`error_message_safe` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "jobs_type_valid" CHECK("jobs"."type" IN ('heartbeat')),
	CONSTRAINT "jobs_status_valid" CHECK("jobs"."status" IN ('queued','running','succeeded','failed')),
	CONSTRAINT "jobs_attempt_positive" CHECK("jobs"."attempt" > 0)
);
--> statement-breakpoint
CREATE INDEX `jobs_status_scheduled_at_idx` ON `jobs` (`status`,`scheduled_at`);