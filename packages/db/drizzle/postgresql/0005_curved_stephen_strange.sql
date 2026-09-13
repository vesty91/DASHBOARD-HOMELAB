CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"error_message_safe" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "jobs_type_valid" CHECK ("jobs"."type" IN ('heartbeat')),
	CONSTRAINT "jobs_status_valid" CHECK ("jobs"."status" IN ('queued','running','succeeded','failed')),
	CONSTRAINT "jobs_attempt_positive" CHECK ("jobs"."attempt" > 0)
);
--> statement-breakpoint
CREATE INDEX "jobs_status_scheduled_at_idx" ON "jobs" USING btree ("status","scheduled_at");