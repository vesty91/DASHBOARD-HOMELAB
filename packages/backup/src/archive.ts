import { BACKUP_TABLE_NAMES, type BackupTableName } from "./columns";
import { BackupError } from "./errors";
import { assertNoPlaintextSecrets, canonicalJson, equalSha256, sha256Hex } from "./json";
import {
  BACKUP_APP_VERSION,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_ARCHIVE_BYTES,
  backupArchiveSchema,
  backupTablesSchema,
  backupTablesSchemaV5,
  backupTablesSchemaV6,
  backupTablesSchemaV9,
  backupTablesSchemaV10,
  backupTablesSchemaV11,
  backupTablesSchemaV12,
  type BackupArchive,
  type BackupTables,
  type BackupTablesV5,
  type BackupTablesV6,
  type BackupTablesV9,
  type BackupTablesV10,
  type BackupTablesV11,
  type BackupTablesV12,
} from "./schema";

function archiveBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw new BackupError("VALIDATION_ERROR", "Backup archive is not valid JSON");
  }
}

function parseJsonInput(input: unknown): unknown {
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_BACKUP_ARCHIVE_BYTES) {
      throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
    }
    try {
      return JSON.parse(input) as unknown;
    } catch {
      throw new BackupError("VALIDATION_ERROR", "Backup archive is not valid JSON");
    }
  }
  return input;
}

export function emptyBackupTables(): BackupTables {
  return {
    users: [],
    groups: [],
    group_members: [],
    boards: [],
    layouts: [],
    items: [],
    item_layouts: [],
    apps: [],
    app_tags: [],
    integrations: [],
    integration_secrets: [],
    server_settings: [],
    user_credentials: [],
    roles: [],
    role_permissions: [],
    user_roles: [],
    group_roles: [],
    board_user_permissions: [],
    board_group_permissions: [],
    jobs: [],
    oidc_identities: [],
    oidc_group_mappings: [],
    oidc_secrets: [],
    automation_rules: [],
    status_pages: [],
    status_page_services: [],
    maintenance_windows: [],
    maintenance_window_targets: [],
    service_slos: [],
    slo_alert_policies: [],
    service_dependencies: [],
  };
}

function parseTables(tables: unknown): BackupTables {
  const parsed = backupTablesSchema.safeParse(tables);
  if (!parsed.success) {
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  return parsed.data;
}

function upgradeV5Tables(tables: BackupTablesV5): BackupTablesV6 {
  return {
    ...tables,
    server_settings: tables.server_settings.map((row) => ({
      ...row,
      oidcEnabled: false,
      oidcIssuer: null,
      oidcClientId: null,
      oidcDisplayName: null,
      oidcScopes: "openid profile email groups",
      oidcRedirectUri: null,
      oidcGroupClaim: "groups",
      oidcAutoLinkVerifiedEmail: false,
      oidcAutoProvision: false,
      oidcAllowLocalLogin: true,
    })),
    oidc_identities: [],
    oidc_group_mappings: [],
    oidc_secrets: [],
  };
}

function upgradeV6Tables(tables: BackupTablesV6): BackupTablesV9 {
  return {
    ...tables,
    automation_rules: [],
  };
}

function upgradeV9Tables(tables: BackupTablesV9): BackupTablesV10 {
  return {
    ...tables,
    status_pages: [],
    status_page_services: [],
    maintenance_windows: [],
    maintenance_window_targets: [],
  };
}

function upgradeV10Tables(tables: BackupTablesV10): BackupTablesV11 {
  return {
    ...tables,
    service_slos: [],
  };
}

function upgradeV11Tables(tables: BackupTablesV11): BackupTablesV12 {
  return {
    ...tables,
    slo_alert_policies: [],
  };
}

function upgradeV12Tables(tables: BackupTablesV12): BackupTables {
  return {
    ...tables,
    service_dependencies: [],
  };
}

function hashCanonicalTables(tables: unknown): { sha256: string; bytes: number } {
  const canonical = canonicalJson(tables);
  const bytes = Buffer.byteLength(canonical, "utf8");
  if (bytes > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
  }
  return { sha256: sha256Hex(canonical), bytes };
}

export function hashBackupTables(tables: BackupTables): { sha256: string; bytes: number } {
  return hashCanonicalTables(parseTables(tables));
}

export function buildArchive(
  tables: BackupTables,
  createdAt = new Date().toISOString(),
): BackupArchive {
  const parsedTables = parseTables(tables);
  assertNoPlaintextSecrets(parsedTables, "tables");
  const hashed = hashBackupTables(parsedTables);
  const archive = backupArchiveSchema.parse({
    manifest: {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      databaseSchemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: BACKUP_APP_VERSION,
      createdAt,
      files: [{ name: "tables.json", sha256: hashed.sha256, bytes: hashed.bytes }],
    },
    tables: parsedTables,
  });
  if (archiveBytes(archive) > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
  }
  return archive;
}

function assertHash(
  tables: unknown,
  declared: { sha256: string; bytes: number } | undefined,
): void {
  const hashed = hashCanonicalTables(tables);
  if (
    !declared ||
    hashed.bytes !== declared.bytes ||
    !equalSha256(hashed.sha256, declared.sha256)
  ) {
    throw new BackupError("HASH_MISMATCH", "Backup archive integrity check failed");
  }
}

export function parseBackupArchive(input: unknown): BackupArchive {
  const parsedInput = parseJsonInput(input);
  if (archiveBytes(parsedInput) > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
  }
  if (!parsedInput || typeof parsedInput !== "object" || Array.isArray(parsedInput)) {
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  const record = parsedInput as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "manifest" && key !== "tables")) {
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  const manifest = backupArchiveSchema.shape.manifest.safeParse(record.manifest);
  if (!manifest.success) {
    const path = manifest.error.issues[0]?.path.join(".") ?? "";
    if (path.includes("schemaVersion") || path.includes("databaseSchemaVersion")) {
      throw new BackupError("INCOMPATIBLE_SCHEMA", "Backup schema version is not supported");
    }
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  const version = manifest.data.schemaVersion;
  if (version === 5) {
    const tables = backupTablesSchemaV5.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return {
      manifest: manifest.data,
      tables: upgradeV12Tables(
        upgradeV11Tables(
          upgradeV10Tables(upgradeV9Tables(upgradeV6Tables(upgradeV5Tables(tables.data)))),
        ),
      ),
    };
  }
  if (version === 6) {
    const tables = backupTablesSchemaV6.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return {
      manifest: manifest.data,
      tables: upgradeV12Tables(
        upgradeV11Tables(upgradeV10Tables(upgradeV9Tables(upgradeV6Tables(tables.data)))),
      ),
    };
  }
  if (version === 7 || version === 8 || version === 9) {
    const tables = backupTablesSchemaV9.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return {
      manifest: manifest.data,
      tables: upgradeV12Tables(upgradeV11Tables(upgradeV10Tables(upgradeV9Tables(tables.data)))),
    };
  }
  if (version === 10) {
    const tables = backupTablesSchemaV10.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return {
      manifest: manifest.data,
      tables: upgradeV12Tables(upgradeV11Tables(upgradeV10Tables(tables.data))),
    };
  }
  if (version === 11) {
    const tables = backupTablesSchemaV11.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return {
      manifest: manifest.data,
      tables: upgradeV12Tables(upgradeV11Tables(tables.data)),
    };
  }
  if (version === 12) {
    const tables = backupTablesSchemaV12.safeParse(record.tables);
    if (!tables.success) {
      throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
    }
    const archive = { manifest: manifest.data, tables: tables.data };
    assertNoPlaintextSecrets(archive, "archive");
    assertHash(tables.data, manifest.data.files[0]);
    return { manifest: manifest.data, tables: upgradeV12Tables(tables.data) };
  }
  const parsed = backupArchiveSchema.safeParse(parsedInput);
  if (!parsed.success) {
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  assertNoPlaintextSecrets(parsed.data, "archive");
  const hashed = hashBackupTables(parsed.data.tables);
  const declared = parsed.data.manifest.files[0];
  if (
    !declared ||
    hashed.bytes !== declared.bytes ||
    !equalSha256(hashed.sha256, declared.sha256)
  ) {
    throw new BackupError("HASH_MISMATCH", "Backup archive integrity check failed");
  }
  return parsed.data;
}

export function isBackupTableName(value: string): value is BackupTableName {
  return (BACKUP_TABLE_NAMES as readonly string[]).includes(value);
}
