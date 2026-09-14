CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"session_id_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_logs_outcome_valid" CHECK ("audit_logs"."outcome" IN ('success','failure','denied'))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "oidc_group_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"oidc_group" text NOT NULL,
	"local_group_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_issuer" text;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_client_id" text;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_display_name" text;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_scopes" text DEFAULT 'openid profile email groups' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_redirect_uri" text;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_group_claim" text DEFAULT 'groups' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_auto_link_verified_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_auto_provision" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "oidc_allow_local_login" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_group_mappings" ADD CONSTRAINT "oidc_group_mappings_local_group_id_groups_id_fk" FOREIGN KEY ("local_group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_revoked_idx" ON "auth_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_group_mappings_group_local_uq" ON "oidc_group_mappings" USING btree ("oidc_group","local_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_uq" ON "oidc_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "oidc_identities_user_idx" ON "oidc_identities" USING btree ("user_id");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 6, "updated_at" = now() WHERE "id" = 'global';--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id","permission") VALUES
('00000000-0000-4000-8000-000000000002','session.read.self'),
('00000000-0000-4000-8000-000000000002','session.revoke.self'),
('00000000-0000-4000-8000-000000000003','session.read.self'),
('00000000-0000-4000-8000-000000000003','session.revoke.self'),
('00000000-0000-4000-8000-000000000004','session.read.self'),
('00000000-0000-4000-8000-000000000004','session.revoke.self'),
('00000000-0000-4000-8000-000000000005','session.read.self'),
('00000000-0000-4000-8000-000000000005','session.revoke.self')
ON CONFLICT ("role_id","permission") DO NOTHING;