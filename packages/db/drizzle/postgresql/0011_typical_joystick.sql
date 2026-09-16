CREATE TABLE "service_reliability_daily" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_key" text NOT NULL,
	"date_utc" text NOT NULL,
	"observed_seconds" integer NOT NULL,
	"available_seconds" integer NOT NULL,
	"degraded_seconds" integer NOT NULL,
	"unavailable_seconds" integer NOT NULL,
	"maintenance_seconds" integer NOT NULL,
	"unknown_seconds" integer NOT NULL,
	"incident_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "service_reliability_daily_observed_nonneg" CHECK ("service_reliability_daily"."observed_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_available_nonneg" CHECK ("service_reliability_daily"."available_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_degraded_nonneg" CHECK ("service_reliability_daily"."degraded_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_unavailable_nonneg" CHECK ("service_reliability_daily"."unavailable_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_maintenance_nonneg" CHECK ("service_reliability_daily"."maintenance_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_unknown_nonneg" CHECK ("service_reliability_daily"."unknown_seconds" >= 0),
	CONSTRAINT "service_reliability_daily_incident_nonneg" CHECK ("service_reliability_daily"."incident_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_reliability_daily_service_date_uq" ON "service_reliability_daily" USING btree ("service_key","date_utc");--> statement-breakpoint
CREATE INDEX "service_reliability_daily_date_idx" ON "service_reliability_daily" USING btree ("date_utc");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 11, "updated_at" = now() WHERE "id" = 'global';
