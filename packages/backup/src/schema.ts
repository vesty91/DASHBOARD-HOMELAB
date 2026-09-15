import { z } from "zod";

export const BACKUP_FORMAT = "homelab-dashboard-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 6;
export const BACKUP_COMPATIBLE_SCHEMA_VERSIONS = [5, 6] as const;
export const BACKUP_APP_VERSION = "1.1.0";
export const MAX_BACKUP_ARCHIVE_BYTES = 8 * 1024 * 1024;

const uuidSchema = z.uuid();
const isoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
const jsonObjectSchema = z.record(z.string(), z.unknown());
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/iu);

const userRowSchema = z
  .object({
    id: uuidSchema,
    username: z.string().min(1).max(100),
    usernameCanonical: z.string().min(1).max(100),
    email: z.string().max(320).nullable(),
    displayName: z.string().max(200).nullable(),
    status: z.enum(["active", "disabled"]),
    isSystemAdmin: z.boolean(),
    authVersion: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    lastLoginAt: isoDateTimeSchema.nullable(),
  })
  .strict();

const groupRowSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(2000).nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const groupMemberRowSchema = z
  .object({
    groupId: uuidSchema,
    userId: uuidSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();

const boardRowSchema = z
  .object({
    id: uuidSchema,
    slug: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    visibility: z.enum(["private", "authenticated", "public"]),
    ownerUserId: uuidSchema.nullable(),
    themeJson: jsonObjectSchema,
    settingsJson: jsonObjectSchema,
    revision: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const layoutRowSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    name: z.string().min(1).max(100),
    breakpoint: z.string().min(1).max(40),
    columns: z.number().int().positive(),
    rowHeight: z.number().int().positive(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const itemRowSchema = z
  .object({
    id: uuidSchema,
    boardId: uuidSchema,
    widgetType: z.string().min(1).max(100),
    widgetVersion: z.number().int().positive(),
    title: z.string().max(200).nullable(),
    configJson: jsonObjectSchema,
    integrationId: uuidSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const itemLayoutRowSchema = z
  .object({
    id: uuidSchema,
    itemId: uuidSchema,
    layoutId: uuidSchema,
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    minW: z.number().int().positive().nullable(),
    minH: z.number().int().positive().nullable(),
    maxW: z.number().int().positive().nullable(),
    maxH: z.number().int().positive().nullable(),
  })
  .strict();

const appRowSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    url: z.string().min(1).max(2000),
    iconRef: z.string().max(500).nullable(),
    color: z.string().max(40).nullable(),
    healthcheckEnabled: z.boolean(),
    healthcheckConfigJson: jsonObjectSchema.nullable(),
    target: z.enum(["same-tab", "new-tab"]),
    healthStatus: z.enum(["unknown", "up", "down", "timeout", "error"]),
    lastCheckedAt: isoDateTimeSchema.nullable(),
    lastLatencyMs: z.number().int().nullable(),
    lastHttpStatus: z.number().int().nullable(),
    lastHealthErrorCode: z.string().max(100).nullable(),
    healthConfigRevision: z.number().int().positive(),
    integrationId: uuidSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const appTagRowSchema = z
  .object({
    appId: uuidSchema,
    value: z.string().min(1).max(100),
    canonicalValue: z.string().min(1).max(100),
  })
  .strict();

const integrationRowSchema = z
  .object({
    id: uuidSchema,
    type: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    baseUrl: z.string().min(1).max(2000),
    enabled: z.boolean(),
    configJson: jsonObjectSchema,
    status: z.enum(["unknown", "available", "unavailable"]),
    lastCheckedAt: isoDateTimeSchema.nullable(),
    configRevision: z.number().int().positive(),
    createdBy: uuidSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const integrationSecretRowSchema = z
  .object({
    id: uuidSchema,
    integrationId: uuidSchema,
    key: z.string().min(1).max(100),
    ciphertext: z.string().min(1).max(16_384),
    iv: z.string().min(1).max(256),
    authTag: z.string().min(1).max(256),
    keyVersion: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const serverSettingsRowSchema = z
  .object({
    id: z.literal("global"),
    schemaVersion: z.number().int().positive(),
    instanceName: z.string().max(200).nullable(),
    onboardingCompleted: z.boolean(),
    oidcEnabled: z.boolean(),
    oidcIssuer: z.string().max(500).nullable(),
    oidcClientId: z.string().max(200).nullable(),
    oidcDisplayName: z.string().max(80).nullable(),
    oidcScopes: z.string().min(1).max(300),
    oidcRedirectUri: z.string().max(500).nullable(),
    oidcGroupClaim: z.string().min(1).max(80),
    oidcAutoLinkVerifiedEmail: z.boolean(),
    oidcAutoProvision: z.boolean(),
    oidcAllowLocalLogin: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const oidcIdentityRowSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    issuer: z.string().min(1).max(500),
    subject: z.string().min(1).max(255),
    email: z.string().max(320).nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const oidcGroupMappingRowSchema = z
  .object({
    id: uuidSchema,
    oidcGroup: z.string().min(1).max(200),
    localGroupId: uuidSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();

const oidcSecretRowSchema = z
  .object({
    id: z.string().min(1).max(80),
    ciphertext: z.string().min(1).max(20_000),
    iv: z.string().min(1).max(200),
    authTag: z.string().min(1).max(200),
    keyVersion: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const userCredentialRowSchema = z
  .object({
    userId: uuidSchema,
    passwordHash: z.string().min(1).max(500),
    passwordUpdatedAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const roleRowSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(2000).nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const rolePermissionRowSchema = z
  .object({
    roleId: uuidSchema,
    permission: z.string().min(1).max(100),
  })
  .strict();

const userRoleRowSchema = z
  .object({
    userId: uuidSchema,
    roleId: uuidSchema,
  })
  .strict();

const groupRoleRowSchema = z
  .object({
    groupId: uuidSchema,
    roleId: uuidSchema,
  })
  .strict();

const boardUserPermissionRowSchema = z
  .object({
    boardId: uuidSchema,
    userId: uuidSchema,
    permission: z.enum(["board.view", "board.edit", "board.manage"]),
  })
  .strict();

const boardGroupPermissionRowSchema = z
  .object({
    boardId: uuidSchema,
    groupId: uuidSchema,
    permission: z.enum(["board.view", "board.edit", "board.manage"]),
  })
  .strict();

const jobRowSchema = z
  .object({
    id: uuidSchema,
    type: z.literal("heartbeat"),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    scheduledAt: isoDateTimeSchema,
    startedAt: isoDateTimeSchema.nullable(),
    finishedAt: isoDateTimeSchema.nullable(),
    attempt: z.number().int().positive(),
    errorCode: z.string().max(100).nullable(),
    errorMessageSafe: z.string().max(2000).nullable(),
    metadataJson: jsonObjectSchema,
  })
  .strict();

export const backupTablesSchema = z
  .object({
    users: z.array(userRowSchema).max(10_000),
    groups: z.array(groupRowSchema).max(1_000),
    group_members: z.array(groupMemberRowSchema).max(20_000),
    boards: z.array(boardRowSchema).max(500),
    layouts: z.array(layoutRowSchema).max(2_000),
    items: z.array(itemRowSchema).max(20_000),
    item_layouts: z.array(itemLayoutRowSchema).max(40_000),
    apps: z.array(appRowSchema).max(2_000),
    app_tags: z.array(appTagRowSchema).max(10_000),
    integrations: z.array(integrationRowSchema).max(500),
    integration_secrets: z.array(integrationSecretRowSchema).max(2_000),
    server_settings: z.array(serverSettingsRowSchema).length(1),
    user_credentials: z.array(userCredentialRowSchema).max(10_000),
    roles: z.array(roleRowSchema).max(50),
    role_permissions: z.array(rolePermissionRowSchema).max(2_000),
    user_roles: z.array(userRoleRowSchema).max(10_000),
    group_roles: z.array(groupRoleRowSchema).max(2_000),
    board_user_permissions: z.array(boardUserPermissionRowSchema).max(10_000),
    board_group_permissions: z.array(boardGroupPermissionRowSchema).max(10_000),
    jobs: z.array(jobRowSchema).max(10_000),
    oidc_identities: z.array(oidcIdentityRowSchema).max(10_000),
    oidc_group_mappings: z.array(oidcGroupMappingRowSchema).max(2_000),
    oidc_secrets: z.array(oidcSecretRowSchema).max(10),
  })
  .strict();

export const backupManifestSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.literal(BACKUP_FORMAT_VERSION),
    schemaVersion: z.union([z.literal(5), z.literal(BACKUP_SCHEMA_VERSION)]),
    databaseSchemaVersion: z.union([z.literal(5), z.literal(BACKUP_SCHEMA_VERSION)]),
    appVersion: z.string().min(1).max(40),
    createdAt: isoDateTimeSchema,
    files: z.tuple([
      z
        .object({
          name: z.literal("tables.json"),
          sha256: sha256Schema,
          bytes: z.number().int().positive().max(MAX_BACKUP_ARCHIVE_BYTES),
        })
        .strict(),
    ]),
  })
  .strict();

export const backupArchiveSchema = z
  .object({
    manifest: backupManifestSchema,
    tables: backupTablesSchema,
  })
  .strict();

export const backupTablesSchemaV5 = z
  .object({
    users: backupTablesSchema.shape.users,
    groups: backupTablesSchema.shape.groups,
    group_members: backupTablesSchema.shape.group_members,
    boards: backupTablesSchema.shape.boards,
    layouts: backupTablesSchema.shape.layouts,
    items: backupTablesSchema.shape.items,
    item_layouts: backupTablesSchema.shape.item_layouts,
    apps: backupTablesSchema.shape.apps,
    app_tags: backupTablesSchema.shape.app_tags,
    integrations: backupTablesSchema.shape.integrations,
    integration_secrets: backupTablesSchema.shape.integration_secrets,
    server_settings: z
      .array(
        z
          .object({
            id: z.literal("global"),
            schemaVersion: z.number().int().positive(),
            instanceName: z.string().max(200).nullable(),
            onboardingCompleted: z.boolean(),
            createdAt: isoDateTimeSchema,
            updatedAt: isoDateTimeSchema,
          })
          .strict(),
      )
      .length(1),
    user_credentials: backupTablesSchema.shape.user_credentials,
    roles: backupTablesSchema.shape.roles,
    role_permissions: backupTablesSchema.shape.role_permissions,
    user_roles: backupTablesSchema.shape.user_roles,
    group_roles: backupTablesSchema.shape.group_roles,
    board_user_permissions: backupTablesSchema.shape.board_user_permissions,
    board_group_permissions: backupTablesSchema.shape.board_group_permissions,
    jobs: backupTablesSchema.shape.jobs,
  })
  .strict();

export type BackupTablesV5 = z.infer<typeof backupTablesSchemaV5>;
export type BackupTables = z.infer<typeof backupTablesSchema>;
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export type BackupArchive = z.infer<typeof backupArchiveSchema>;
