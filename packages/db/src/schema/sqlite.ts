import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    usernameCanonical: text("username_canonical").notNull().unique(),
    email: text("email").unique(),
    displayName: text("display_name"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    isSystemAdmin: integer("is_system_admin", { mode: "boolean" }).notNull().default(false),
    authVersion: integer("auth_version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  },
  (t) => [check("users_status_valid", sql`${t.status} IN ('active', 'disabled')`)],
);
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("group_members_group_user_uq").on(t.groupId, t.userId),
    index("group_members_user_idx").on(t.userId),
  ],
);
export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    configJson: text("config_json").notNull().default("{}"),
    status: text("status", { enum: ["unknown", "available", "unavailable"] })
      .notNull()
      .default("unknown"),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("integrations_type_idx").on(t.type),
    index("integrations_status_idx").on(t.status),
    check("integrations_status_valid", sql`${t.status} IN ('unknown', 'available', 'unavailable')`),
  ],
);
export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: ["private", "authenticated", "public"] })
      .notNull()
      .default("private"),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    themeJson: text("theme_json").notNull().default("{}"),
    settingsJson: text("settings_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("boards_slug_uq").on(t.slug),
    check("boards_revision_positive", sql`${t.revision} > 0`),
    check(
      "boards_visibility_valid",
      sql`${t.visibility} IN ('private', 'authenticated', 'public')`,
    ),
  ],
);
export const layouts = sqliteTable(
  "layouts",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    breakpoint: text("breakpoint").notNull(),
    columns: integer("columns").notNull(),
    rowHeight: integer("row_height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("layouts_board_idx").on(t.boardId),
    uniqueIndex("layouts_board_breakpoint_uq").on(t.boardId, t.breakpoint),
    check(
      "layouts_dimensions_valid",
      sql`${t.columns} > 0 AND ${t.rowHeight} > 0 AND ${t.sortOrder} >= 0`,
    ),
  ],
);
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    widgetType: text("widget_type").notNull(),
    widgetVersion: integer("widget_version").notNull(),
    title: text("title"),
    configJson: text("config_json").notNull().default("{}"),
    integrationId: text("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("items_board_idx").on(t.boardId),
    index("items_integration_idx").on(t.integrationId),
  ],
);
export const itemLayouts = sqliteTable(
  "item_layouts",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    layoutId: text("layout_id")
      .notNull()
      .references(() => layouts.id, { onDelete: "cascade" }),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
    minW: integer("min_w"),
    minH: integer("min_h"),
    maxW: integer("max_w"),
    maxH: integer("max_h"),
  },
  (t) => [
    uniqueIndex("item_layouts_item_layout_uq").on(t.itemId, t.layoutId),
    index("item_layouts_layout_idx").on(t.layoutId),
    check(
      "item_layouts_position_valid",
      sql`${t.x} >= 0 AND ${t.y} >= 0 AND ${t.w} > 0 AND ${t.h} > 0`,
    ),
  ],
);
export const apps = sqliteTable(
  "apps",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    iconRef: text("icon_ref"),
    color: text("color"),
    healthcheckEnabled: integer("healthcheck_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    healthcheckConfigJson: text("healthcheck_config_json"),
    integrationId: text("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("apps_name_idx").on(t.name), index("apps_integration_idx").on(t.integrationId)],
);
export const integrationSecrets = sqliteTable(
  "integration_secrets",
  {
    id: text("id").primaryKey(),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("integration_secrets_integration_key_uq").on(t.integrationId, t.key)],
);
export const serverSettings = sqliteTable(
  "server_settings",
  {
    id: text("id").primaryKey().default("global"),
    schemaVersion: integer("schema_version").notNull().default(1),
    instanceName: text("instance_name"),
    onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [check("server_settings_singleton", sql`${t.id} = 'global'`)],
);
export const userCredentials = sqliteTable("user_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordUpdatedAt: integer("password_updated_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [uniqueIndex("role_permissions_role_permission_uq").on(t.roleId, t.permission)],
);
export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("user_roles_user_role_uq").on(t.userId, t.roleId)],
);
export const groupRoles = sqliteTable(
  "group_roles",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("group_roles_group_role_uq").on(t.groupId, t.roleId)],
);
export const boardUserPermissions = sqliteTable(
  "board_user_permissions",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission", {
      enum: ["board.view", "board.edit", "board.manage"],
    }).notNull(),
  },
  (t) => [
    uniqueIndex("board_user_permissions_uq").on(t.boardId, t.userId, t.permission),
    index("board_user_permissions_user_idx").on(t.userId, t.boardId),
    check(
      "board_user_permissions_valid",
      sql`${t.permission} IN ('board.view','board.edit','board.manage')`,
    ),
  ],
);
export const boardGroupPermissions = sqliteTable(
  "board_group_permissions",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    permission: text("permission", {
      enum: ["board.view", "board.edit", "board.manage"],
    }).notNull(),
  },
  (t) => [
    uniqueIndex("board_group_permissions_uq").on(t.boardId, t.groupId, t.permission),
    index("board_group_permissions_group_idx").on(t.groupId, t.boardId),
    check(
      "board_group_permissions_valid",
      sql`${t.permission} IN ('board.view','board.edit','board.manage')`,
    ),
  ],
);
