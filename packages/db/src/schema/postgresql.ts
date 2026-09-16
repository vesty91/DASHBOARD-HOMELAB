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
    configRevision: integer("config_revision").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("integrations_type_idx").on(t.type),
    index("integrations_status_idx").on(t.status),
    check("integrations_status_valid", sql`${t.status} IN ('unknown', 'available', 'unavailable')`),
    check("integrations_config_revision_positive", sql`${t.configRevision} > 0`),
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
    oidcEnabled: boolean("oidc_enabled").notNull().default(false),
    oidcIssuer: text("oidc_issuer"),
    oidcClientId: text("oidc_client_id"),
    oidcDisplayName: text("oidc_display_name"),
    oidcScopes: text("oidc_scopes").notNull().default("openid profile email groups"),
    oidcRedirectUri: text("oidc_redirect_uri"),
    oidcGroupClaim: text("oidc_group_claim").notNull().default("groups"),
    oidcAutoLinkVerifiedEmail: boolean("oidc_auto_link_verified_email").notNull().default(false),
    oidcAutoProvision: boolean("oidc_auto_provision").notNull().default(false),
    oidcAllowLocalLogin: boolean("oidc_allow_local_login").notNull().default(true),
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
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempt: integer("attempt").notNull().default(1),
    errorCode: text("error_code"),
    errorMessageSafe: text("error_message_safe"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
  },
  (t) => [
    index("jobs_status_scheduled_at_idx").on(t.status, t.scheduledAt),
    check("jobs_type_valid", sql`${t.type} IN ('heartbeat')`),
    check("jobs_status_valid", sql`${t.status} IN ('queued','running','succeeded','failed')`),
    check("jobs_attempt_positive", sql`${t.attempt} > 0`),
  ],
);
export const oidcIdentities = pgTable(
  "oidc_identities",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oidc_identities_issuer_subject_uq").on(t.issuer, t.subject),
    index("oidc_identities_user_idx").on(t.userId),
  ],
);
export const oidcGroupMappings = pgTable(
  "oidc_group_mappings",
  {
    id: uuid("id").primaryKey(),
    oidcGroup: text("oidc_group").notNull(),
    localGroupId: uuid("local_group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("oidc_group_mappings_group_local_uq").on(t.oidcGroup, t.localGroupId)],
);
export const oidcSecrets = pgTable("oidc_secrets", {
  id: text("id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull(),
  ...timestamps,
});
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    sessionIdHash: text("session_id_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_actor_created_idx").on(t.actorUserId, t.createdAt),
    check("audit_logs_outcome_valid", sql`${t.outcome} IN ('success','failure','denied')`),
  ],
);
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("auth_sessions_user_revoked_idx").on(t.userId, t.revokedAt)],
);
export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(false),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    triggerType: text("trigger_type").notNull(),
    triggerConfigJson: jsonb("trigger_config_json").notNull().default({}),
    conditionConfigJson: jsonb("condition_config_json"),
    actionType: text("action_type").notNull(),
    actionConfigJson: jsonb("action_config_json").notNull().default({}),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
    configRevision: integer("config_revision").notNull().default(1),
    lastEnabledAt: timestamp("last_enabled_at", { withTimezone: true }),
    ...timestamps,
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
export const automationRuntimeState = pgTable(
  "automation_runtime_state",
  {
    automationId: uuid("automation_id")
      .primaryKey()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastObservedState: jsonb("last_observed_state"),
    failureCount: integer("failure_count").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
  },
  (t) => [
    index("automation_runtime_state_next_run_idx").on(t.nextRunAt),
    index("automation_runtime_state_lease_idx").on(t.leaseUntil),
    check("automation_runtime_state_failure_count", sql`${t.failureCount} >= 0`),
  ],
);
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey(),
    automationId: uuid("automation_id").references(() => automationRules.id, {
      onDelete: "set null",
    }),
    runKey: text("run_key").notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    actionType: text("action_type").notNull(),
    errorCode: text("error_code"),
    resourceId: text("resource_id"),
    summaryJson: jsonb("summary_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
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
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    sourceIntegrationId: uuid("source_integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    dedupKey: text("dedup_key"),
    destinationPath: text("destination_path"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
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
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    openingEventId: text("opening_event_id"),
    closingEventId: text("closing_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
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
export const incidentEvents = pgTable(
  "incident_events",
  {
    id: uuid("id").primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("incident_events_incident_created_idx").on(t.incidentId, t.createdAt),
    check("incident_events_type_valid", sql`${t.eventType} IN ('opened','resolved','note')`),
  ],
);
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
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
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_user_endpoint_hash_uq").on(t.userId, t.endpointHash),
    index("push_subscriptions_user_active_idx").on(t.userId, t.disabledAt),
  ],
);
export const statusPages = pgTable(
  "status_pages",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    visibility: text("visibility").notNull().default("private"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    configRevision: integer("config_revision").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("status_pages_slug_uq").on(t.slug),
    index("status_pages_visibility_enabled_idx").on(t.visibility, t.enabled),
    check("status_pages_visibility_valid", sql`${t.visibility} IN ('private', 'public')`),
    check("status_pages_config_revision_positive", sql`${t.configRevision} > 0`),
  ],
);
export const statusPageServices = pgTable(
  "status_page_services",
  {
    id: uuid("id").primaryKey(),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    sourceIntegrationId: uuid("source_integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    showIncidentHistory: boolean("show_incident_history").notNull().default(true),
    ...timestamps,
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
export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
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
export const maintenanceWindowTargets = pgTable(
  "maintenance_window_targets",
  {
    maintenanceId: uuid("maintenance_id")
      .notNull()
      .references(() => maintenanceWindows.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("maintenance_window_targets_uq").on(t.maintenanceId, t.integrationId),
    index("maintenance_window_targets_integration_idx").on(t.integrationId),
  ],
);
