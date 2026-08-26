CREATE TABLE "board_group_permissions" (
	"board_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "board_group_permissions_valid" CHECK ("board_group_permissions"."permission" IN ('board.view','board.edit','board.manage'))
);
--> statement-breakpoint
CREATE TABLE "board_user_permissions" (
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "board_user_permissions_valid" CHECK ("board_user_permissions"."permission" IN ('board.view','board.edit','board.manage'))
);
--> statement-breakpoint
ALTER TABLE "board_group_permissions" ADD CONSTRAINT "board_group_permissions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_group_permissions" ADD CONSTRAINT "board_group_permissions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_user_permissions" ADD CONSTRAINT "board_user_permissions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_user_permissions" ADD CONSTRAINT "board_user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_group_permissions_uq" ON "board_group_permissions" USING btree ("board_id","group_id","permission");--> statement-breakpoint
CREATE INDEX "board_group_permissions_group_idx" ON "board_group_permissions" USING btree ("group_id","board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_user_permissions_uq" ON "board_user_permissions" USING btree ("board_id","user_id","permission");--> statement-breakpoint
CREATE INDEX "board_user_permissions_user_idx" ON "board_user_permissions" USING btree ("user_id","board_id");