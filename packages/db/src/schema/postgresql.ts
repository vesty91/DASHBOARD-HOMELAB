import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
};
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull().unique(),
    usernameCanonical: text("username_canonical").notNull().unique(),
    email: text("email").unique(),
    displayName: text("display_name"),
    status: text("status").notNull().default("active"),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
    authVersion: integer("auth_version").notNull().default(1),
    ...timestamps,
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [check("users_status_valid", sql`${t.status} IN ('active', 'disabled')`)],
);
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps,
});
export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("group_members_group_user_uq").on(t.groupId, t.userId),
    index("group_members_user_idx").on(t.userId),
  ],
);
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    configJson: jsonb("config_json").notNull().default({}),
    status: text("status").notNull().default("unknown"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("integrations_type_idx").on(t.type),
    index("integrations_status_idx").on(t.status),
    check("integrations_status_valid", sql`${t.status} IN ('unknown', 'available', 'unavailable')`),
  ],
);
export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility").notNull().default("private"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    themeJson: jsonb("theme_json").notNull().default({}),
    settingsJson: jsonb("settings_json").notNull().default({}),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
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
export const layouts = pgTable(
  "layouts",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    breakpoint: text("breakpoint").notNull(),
    columns: integer("columns").notNull(),
    rowHeight: integer("row_height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
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
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    widgetType: text("widget_type").notNull(),
    widgetVersion: integer("widget_version").notNull(),
    title: text("title"),
    configJson: jsonb("config_json").notNull().default({}),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("items_board_idx").on(t.boardId),
    index("items_integration_idx").on(t.integrationId),
  ],
);
export const itemLayouts = pgTable(
  "item_layouts",
  {
    id: uuid("id").primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    layoutId: uuid("layout_id")
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
export const apps = pgTable(
  "apps",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    iconRef: text("icon_ref"),
    color: text("color"),
    healthcheckEnabled: boolean("healthcheck_enabled").notNull().default(false),
    healthcheckConfigJson: jsonb("healthcheck_config_json"),
    target: text("target").notNull().default("new-tab"),
    healthStatus: text("health_status").notNull().default("unknown"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastLatencyMs: integer("last_latency_ms"),
    lastHttpStatus: integer("last_http_status"),
    lastHealthErrorCode: text("last_health_error_code"),
    healthConfigRevision: integer("health_config_revision").notNull().default(1),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("apps_name_idx").on(t.name),
    index("apps_integration_idx").on(t.integrationId),
    check("apps_target_valid", sql`${t.target} IN ('same-tab','new-tab')`),
    check(
      "apps_health_status_valid",
      sql`${t.healthStatus} IN ('unknown','up','down','timeout','error')`,
    ),
    check("apps_health_revision_positive", sql`${t.healthConfigRevision} > 0`),
  ],
);
export const appTags = pgTable(
  "app_tags",
  {
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    canonicalValue: text("canonical_value").notNull(),
  },
  (t) => [
    uniqueIndex("app_tags_app_canonical_uq").on(t.appId, t.canonicalValue),
    index("app_tags_canonical_idx").on(t.canonicalValue),
  ],
);
export const integrationSecrets = pgTable(
  "integration_secrets",
  {
    id: uuid("id").primaryKey(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("integration_secrets_integration_key_uq").on(t.integrationId, t.key)],
);
export const serverSettings = pgTable(
  "server_settings",
  {
    id: text("id").primaryKey().default("global"),
    schemaVersion: integer("schema_version").notNull().default(1),
    instanceName: text("instance_name"),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    ...timestamps,
  },
  (t) => [check("server_settings_singleton", sql`${t.id} = 'global'`)],
);
export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).notNull(),
  ...timestamps,
});
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps,
});
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [uniqueIndex("role_permissions_role_permission_uq").on(t.roleId, t.permission)],
);
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("user_roles_user_role_uq").on(t.userId, t.roleId)],
);
export const groupRoles = pgTable(
  "group_roles",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("group_roles_group_role_uq").on(t.groupId, t.roleId)],
);
export const boardUserPermissions = pgTable(
  "board_user_permissions",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
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
export const boardGroupPermissions = pgTable(
  "board_group_permissions",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
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
