CREATE TABLE "group_roles" (
	"group_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_settings" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username_canonical" text;--> statement-breakpoint
UPDATE "users" SET "username_canonical" = lower("username");--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username_canonical" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_roles" ADD CONSTRAINT "group_roles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_roles" ADD CONSTRAINT "group_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_roles_group_role_uq" ON "group_roles" USING btree ("group_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_uq" ON "role_permissions" USING btree ("role_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_uq" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_canonical_unique" UNIQUE("username_canonical");
--> statement-breakpoint
INSERT INTO "server_settings" ("id","schema_version","onboarding_completed","created_at","updated_at") VALUES ('global',2,false,now(),now()) ON CONFLICT ("id") DO UPDATE SET "schema_version"=2;
--> statement-breakpoint
INSERT INTO "roles" ("id","name","description","created_at","updated_at") VALUES
('00000000-0000-4000-8000-000000000001','SYSTEM_ADMIN','System administrator',now(),now()),('00000000-0000-4000-8000-000000000002','ADMIN','Administrator',now(),now()),('00000000-0000-4000-8000-000000000003','EDITOR','Editor',now(),now()),('00000000-0000-4000-8000-000000000004','USER','User',now(),now()),('00000000-0000-4000-8000-000000000005','VIEWER','Viewer',now(),now()) ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id","permission") VALUES
('00000000-0000-4000-8000-000000000002','user.read'),('00000000-0000-4000-8000-000000000002','user.manage'),('00000000-0000-4000-8000-000000000002','group.read'),('00000000-0000-4000-8000-000000000002','group.manage'),('00000000-0000-4000-8000-000000000002','board.create'),('00000000-0000-4000-8000-000000000002','board.read.all'),('00000000-0000-4000-8000-000000000002','board.manage.all'),('00000000-0000-4000-8000-000000000002','app.read'),('00000000-0000-4000-8000-000000000002','app.manage'),('00000000-0000-4000-8000-000000000002','integration.create'),('00000000-0000-4000-8000-000000000002','integration.read'),('00000000-0000-4000-8000-000000000002','integration.manage'),('00000000-0000-4000-8000-000000000003','app.read'),('00000000-0000-4000-8000-000000000003','integration.read'),('00000000-0000-4000-8000-000000000003','board.create'),('00000000-0000-4000-8000-000000000003','board.edit'),('00000000-0000-4000-8000-000000000004','app.read'),('00000000-0000-4000-8000-000000000004','integration.read'),('00000000-0000-4000-8000-000000000004','board.create'),('00000000-0000-4000-8000-000000000005','app.read'),('00000000-0000-4000-8000-000000000005','integration.read') ON CONFLICT DO NOTHING;
