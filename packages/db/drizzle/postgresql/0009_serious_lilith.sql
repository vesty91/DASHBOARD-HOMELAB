CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint_hash" text NOT NULL,
	"endpoint_ciphertext" text NOT NULL,
	"endpoint_iv" text NOT NULL,
	"endpoint_auth_tag" text NOT NULL,
	"p256dh_ciphertext" text NOT NULL,
	"p256dh_iv" text NOT NULL,
	"p256dh_auth_tag" text NOT NULL,
	"auth_ciphertext" text NOT NULL,
	"auth_iv" text NOT NULL,
	"auth_auth_tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"user_agent" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_hash_uq" ON "push_subscriptions" USING btree ("user_id","endpoint_hash");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_active_idx" ON "push_subscriptions" USING btree ("user_id","disabled_at");--> statement-breakpoint
UPDATE "server_settings" SET "schema_version" = 9, "updated_at" = now() WHERE "id" = 'global';
