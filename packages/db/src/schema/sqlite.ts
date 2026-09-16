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
    configRevision: integer("config_revision").notNull().default(1),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("integrations_type_idx").on(t.type),
    index("integrations_status_idx").on(t.status),
    check("integrations_status_valid", sql`${t.status} IN ('unknown', 'available', 'unavailable')`),
    check("integrations_config_revision_positive", sql`${t.configRevision} > 0`),
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
    target: text("target", { enum: ["same-tab", "new-tab"] })
      .notNull()
      .default("new-tab"),
    healthStatus: text("health_status", { enum: ["unknown", "up", "down", "timeout", "error"] })
      .notNull()
      .default("unknown"),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
    lastLatencyMs: integer("last_latency_ms"),
    lastHttpStatus: integer("last_http_status"),
    lastHealthErrorCode: text("last_health_error_code"),
    healthConfigRevision: integer("health_config_revision").notNull().default(1),
    integrationId: text("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
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
export const appTags = sqliteTable(
  "app_tags",
  {
    appId: text("app_id")
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
    oidcEnabled: integer("oidc_enabled", { mode: "boolean" }).notNull().default(false),
    oidcIssuer: text("oidc_issuer"),
    oidcClientId: text("oidc_client_id"),
    oidcDisplayName: text("oidc_display_name"),
    oidcScopes: text("oidc_scopes").notNull().default("openid profile email groups"),
    oidcRedirectUri: text("oidc_redirect_uri"),
    oidcGroupClaim: text("oidc_group_claim").notNull().default("groups"),
    oidcAutoLinkVerifiedEmail: integer("oidc_auto_link_verified_email", { mode: "boolean" })
      .notNull()
      .default(false),
    oidcAutoProvision: integer("oidc_auto_provision", { mode: "boolean" }).notNull().default(false),
    oidcAllowLocalLogin: integer("oidc_allow_local_login", { mode: "boolean" })
      .notNull()
      .default(true),
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
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["heartbeat"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull(),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    attempt: integer("attempt").notNull().default(1),
    errorCode: text("error_code"),
    errorMessageSafe: text("error_message_safe"),
    metadataJson: text("metadata_json").notNull().default("{}"),
  },
  (t) => [
    index("jobs_status_scheduled_at_idx").on(t.status, t.scheduledAt),
    check("jobs_type_valid", sql`${t.type} IN ('heartbeat')`),
    check("jobs_status_valid", sql`${t.status} IN ('queued','running','succeeded','failed')`),
    check("jobs_attempt_positive", sql`${t.attempt} > 0`),
  ],
);
export const oidcIdentities = sqliteTable(
  "oidc_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("oidc_identities_issuer_subject_uq").on(t.issuer, t.subject),
    index("oidc_identities_user_idx").on(t.userId),
  ],
);
export const oidcGroupMappings = sqliteTable(
  "oidc_group_mappings",
  {
    id: text("id").primaryKey(),
    oidcGroup: text("oidc_group").notNull(),
    localGroupId: text("local_group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("oidc_group_mappings_group_local_uq").on(t.oidcGroup, t.localGroupId)],
);
export const oidcSecrets = sqliteTable("oidc_secrets", {
  id: text("id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome", { enum: ["success", "failure", "denied"] }).notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    sessionIdHash: text("session_id_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_actor_created_idx").on(t.actorUserId, t.createdAt),
    check("audit_logs_outcome_valid", sql`${t.outcome} IN ('success','failure','denied')`),
  ],
);
export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("auth_sessions_user_revoked_idx").on(t.userId, t.revokedAt)],
);
export const automationRules = sqliteTable(
  "automation_rules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    triggerType: text("trigger_type", {
      enum: ["schedule", "event", "status-transition"],
    }).notNull(),
    triggerConfigJson: text("trigger_config_json").notNull().default("{}"),
    conditionConfigJson: text("condition_config_json"),
    actionType: text("action_type").notNull(),
    actionConfigJson: text("action_config_json").notNull().default("{}"),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
    configRevision: integer("config_revision").notNull().default(1),
    lastEnabledAt: integer("last_enabled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("automation_rules_owner_idx").on(t.ownerUserId),
    index("automation_rules_enabled_idx").on(t.enabled),
    check(
      "automation_rules_trigger_type_valid",
      sql`${t.triggerType} IN ('schedule','event','status-transition')`,
    ),
    check(
      "automation_rules_action_type_valid",
      sql`${t.actionType} IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline')`,
    ),
    check("automation_rules_config_revision_positive", sql`${t.configRevision} > 0`),
    check("automation_rules_cooldown_bounds", sql`${t.cooldownSeconds} BETWEEN 0 AND 86400`),
  ],
);
export const automationRuntimeState = sqliteTable(
  "automation_runtime_state",
  {
    automationId: text("automation_id")
      .primaryKey()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp_ms" }),
    lastCompletedAt: integer("last_completed_at", { mode: "timestamp_ms" }),
    lastObservedState: text("last_observed_state"),
    failureCount: integer("failure_count").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("automation_runtime_state_next_run_idx").on(t.nextRunAt),
    index("automation_runtime_state_lease_idx").on(t.leaseUntil),
    check("automation_runtime_state_failure_count", sql`${t.failureCount} >= 0`),
  ],
);
export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id").references(() => automationRules.id, {
      onDelete: "set null",
    }),
    runKey: text("run_key").notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status", {
      enum: ["scheduled", "running", "succeeded", "failed", "skipped", "denied", "unknown"],
    }).notNull(),
    scheduledFor: integer("scheduled_for", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    actionType: text("action_type").notNull(),
    errorCode: text("error_code"),
    resourceId: text("resource_id"),
    summaryJson: text("summary_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("automation_runs_run_key_uq").on(t.runKey),
    index("automation_runs_automation_started_idx").on(t.automationId, t.startedAt),
    index("automation_runs_finished_at_idx").on(t.finishedAt),
    check(
      "automation_runs_trigger_type_valid",
      sql`${t.triggerType} IN ('schedule','event','status-transition')`,
    ),
    check(
      "automation_runs_status_valid",
      sql`${t.status} IN ('scheduled','running','succeeded','failed','skipped','denied','unknown')`,
    ),
    check(
      "automation_runs_action_type_valid",
      sql`${t.actionType} IN ('ntfy.publish','qbittorrent.pause','qbittorrent.resume','sonarr.refresh-series','sonarr.search-episode','radarr.refresh-movie','radarr.search-movie','proxmox.start','proxmox.shutdown','proxmox.reboot','seerr.approve','seerr.decline')`,
    ),
  ],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["integration", "automation", "system", "security", "backup"],
    }).notNull(),
    severity: text("severity", {
      enum: ["info", "success", "warning", "error", "critical"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceType: text("source_type", {
      enum: ["integration", "automation", "system", "security", "backup", "incident"],
    }).notNull(),
    sourceId: text("source_id"),
    sourceIntegrationId: text("source_integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    dedupKey: text("dedup_key"),
    destinationPath: text("destination_path"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt, t.dismissedAt),
    index("notifications_user_dedup_idx").on(t.userId, t.dedupKey, t.createdAt),
    index("notifications_expires_at_idx").on(t.expiresAt),
    check(
      "notifications_category_valid",
      sql`${t.category} IN ('integration','automation','system','security','backup')`,
    ),
    check(
      "notifications_severity_valid",
      sql`${t.severity} IN ('info','success','warning','error','critical')`,
    ),
    check(
      "notifications_source_type_valid",
      sql`${t.sourceType} IN ('integration','automation','system','security','backup','incident')`,
    ),
  ],
);
export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["availability"] }).notNull(),
    severity: text("severity", {
      enum: ["info", "success", "warning", "error", "critical"],
    }).notNull(),
    status: text("status", { enum: ["open", "resolved"] }).notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    lastChangedAt: integer("last_changed_at", { mode: "timestamp_ms" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    openingEventId: text("opening_event_id"),
    closingEventId: text("closing_event_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("incidents_open_integration_kind_uq")
      .on(t.integrationId, t.kind)
      .where(sql`${t.status} = 'open'`),
    index("incidents_status_changed_idx").on(t.status, t.lastChangedAt),
    index("incidents_integration_idx").on(t.integrationId),
    check("incidents_kind_valid", sql`${t.kind} IN ('availability')`),
    check(
      "incidents_severity_valid",
      sql`${t.severity} IN ('info','success','warning','error','critical')`,
    ),
    check("incidents_status_valid", sql`${t.status} IN ('open','resolved')`),
  ],
);
export const incidentEvents = sqliteTable(
  "incident_events",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    eventType: text("event_type", { enum: ["opened", "resolved", "note"] }).notNull(),
    summary: text("summary").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("incident_events_incident_created_idx").on(t.incidentId, t.createdAt),
    check("incident_events_type_valid", sql`${t.eventType} IN ('opened','resolved','note')`),
  ],
);
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointHash: text("endpoint_hash").notNull(),
    endpointCiphertext: text("endpoint_ciphertext").notNull(),
    endpointIv: text("endpoint_iv").notNull(),
    endpointAuthTag: text("endpoint_auth_tag").notNull(),
    p256dhCiphertext: text("p256dh_ciphertext").notNull(),
    p256dhIv: text("p256dh_iv").notNull(),
    p256dhAuthTag: text("p256dh_auth_tag").notNull(),
    authCiphertext: text("auth_ciphertext").notNull(),
    authIv: text("auth_iv").notNull(),
    authAuthTag: text("auth_auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    userAgent: text("user_agent"),
    disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_user_endpoint_hash_uq").on(t.userId, t.endpointHash),
    index("push_subscriptions_user_active_idx").on(t.userId, t.disabledAt),
  ],
);
export const statusPages = sqliteTable(
  "status_pages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: ["private", "public"] })
      .notNull()
      .default("private"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    configRevision: integer("config_revision").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("status_pages_slug_uq").on(t.slug),
    index("status_pages_visibility_enabled_idx").on(t.visibility, t.enabled),
    check("status_pages_visibility_valid", sql`${t.visibility} IN ('private', 'public')`),
    check("status_pages_config_revision_positive", sql`${t.configRevision} > 0`),
  ],
);
export const statusPageServices = sqliteTable(
  "status_page_services",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    sourceIntegrationId: text("source_integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    showIncidentHistory: integer("show_incident_history", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("status_page_services_page_sort_idx").on(t.statusPageId, t.sortOrder),
    uniqueIndex("status_page_services_page_integration_uq").on(
      t.statusPageId,
      t.sourceIntegrationId,
    ),
    check("status_page_services_sort_order_valid", sql`${t.sortOrder} >= 0`),
  ],
);
export const maintenanceWindows = sqliteTable(
  "maintenance_windows",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", {
      enum: ["scheduled", "active", "completed", "cancelled"],
    })
      .notNull()
      .default("scheduled"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("maintenance_windows_status_starts_idx").on(t.status, t.startsAt),
    check(
      "maintenance_windows_status_valid",
      sql`${t.status} IN ('scheduled','active','completed','cancelled')`,
    ),
    check("maintenance_windows_range_valid", sql`${t.endsAt} >= ${t.startsAt}`),
  ],
);
export const maintenanceWindowTargets = sqliteTable(
  "maintenance_window_targets",
  {
    maintenanceId: text("maintenance_id")
      .notNull()
      .references(() => maintenanceWindows.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("maintenance_window_targets_uq").on(t.maintenanceId, t.integrationId),
    index("maintenance_window_targets_integration_idx").on(t.integrationId),
  ],
);
/** Opaque service key = integration id. Daily UTC rollups; excluded from backup. */
export const serviceReliabilityDaily = sqliteTable(
  "service_reliability_daily",
  {
    id: text("id").primaryKey(),
    serviceKey: text("service_key").notNull(),
    dateUtc: text("date_utc").notNull(),
    observedSeconds: integer("observed_seconds").notNull(),
    availableSeconds: integer("available_seconds").notNull(),
    degradedSeconds: integer("degraded_seconds").notNull(),
    unavailableSeconds: integer("unavailable_seconds").notNull(),
    maintenanceSeconds: integer("maintenance_seconds").notNull(),
    unknownSeconds: integer("unknown_seconds").notNull(),
    incidentCount: integer("incident_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("service_reliability_daily_service_date_uq").on(t.serviceKey, t.dateUtc),
    index("service_reliability_daily_date_idx").on(t.dateUtc),
    check("service_reliability_daily_observed_nonneg", sql`${t.observedSeconds} >= 0`),
    check("service_reliability_daily_available_nonneg", sql`${t.availableSeconds} >= 0`),
    check("service_reliability_daily_degraded_nonneg", sql`${t.degradedSeconds} >= 0`),
    check("service_reliability_daily_unavailable_nonneg", sql`${t.unavailableSeconds} >= 0`),
    check("service_reliability_daily_maintenance_nonneg", sql`${t.maintenanceSeconds} >= 0`),
    check("service_reliability_daily_unknown_nonneg", sql`${t.unknownSeconds} >= 0`),
    check("service_reliability_daily_incident_nonneg", sql`${t.incidentCount} >= 0`),
  ],
);
