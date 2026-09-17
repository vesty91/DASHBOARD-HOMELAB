CREATE TABLE "service_reliability_hourly" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_key" text NOT NULL,
	"hour_utc" text NOT NULL,
	"observed_seconds" integer NOT NULL,
	"available_seconds" integer NOT NULL,
	"degraded_seconds" integer NOT NULL,
	"unavailable_seconds" integer NOT NULL,
	"maintenance_seconds" integer NOT NULL,
	"unknown_seconds" integer NOT NULL,
	"incident_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "service_reliability_hourly_observed_nonneg" CHECK ("service_reliability_hourly"."observed_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_available_nonneg" CHECK ("service_reliability_hourly"."available_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_degraded_nonneg" CHECK ("service_reliability_hourly"."degraded_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_unavailable_nonneg" CHECK ("service_reliability_hourly"."unavailable_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_maintenance_nonneg" CHECK ("service_reliability_hourly"."maintenance_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_unknown_nonneg" CHECK ("service_reliability_hourly"."unknown_seconds" >= 0),
	CONSTRAINT "service_reliability_hourly_incident_nonneg" CHECK ("service_reliability_hourly"."incident_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_reliability_hourly_service_hour_uq" ON "service_reliability_hourly" USING btree ("service_key","hour_utc");--> statement-breakpoint
CREATE INDEX "service_reliability_hourly_hour_idx" ON "service_reliability_hourly" USING btree ("hour_utc");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 13, "updated_at" = now() WHERE "id" = 'global';