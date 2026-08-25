export const TABLE_NAMES = [
  "users",
  "groups",
  "group_members",
  "boards",
  "layouts",
  "items",
  "item_layouts",
  "apps",
  "integrations",
  "integration_secrets",
  "server_settings",
  "user_credentials",
  "roles",
  "role_permissions",
  "user_roles",
  "group_roles",
] as const;

export const BOARD_VISIBILITIES = ["private", "authenticated", "public"] as const;
export const USER_STATUSES = ["active", "disabled"] as const;
export const INTEGRATION_STATUSES = ["unknown", "available", "unavailable"] as const;

export type DatabaseDialect = "sqlite" | "postgres";
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

export const SCHEMA_CONTRACT = {
  users: [
    "id",
    "username",
    "usernameCanonical",
    "email",
    "displayName",
    "status",
    "isSystemAdmin",
    "authVersion",
  ],
  groups: ["id", "name", "description"],
  group_members: ["groupId", "userId"],
  boards: ["id", "slug", "name", "visibility", "ownerUserId", "revision"],
  layouts: ["id", "boardId", "name", "breakpoint", "columns", "rowHeight", "sortOrder"],
  items: ["id", "boardId", "widgetType", "widgetVersion", "integrationId"],
  item_layouts: ["id", "itemId", "layoutId", "x", "y", "w", "h"],
  apps: ["id", "name", "url", "integrationId"],
  integrations: ["id", "type", "name", "baseUrl", "status", "createdBy"],
  integration_secrets: ["id", "integrationId", "key", "ciphertext", "iv", "authTag"],
  server_settings: ["id", "schemaVersion", "instanceName", "onboardingCompleted"],
  user_credentials: ["userId", "passwordHash", "passwordUpdatedAt"],
  roles: ["id", "name", "description"],
  role_permissions: ["roleId", "permission"],
  user_roles: ["userId", "roleId"],
  group_roles: ["groupId", "roleId"],
} as const satisfies Record<(typeof TABLE_NAMES)[number], readonly string[]>;
