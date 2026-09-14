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
  type BackupArchive,
  type BackupTables,
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
  };
}

function parseTables(tables: unknown): BackupTables {
  const parsed = backupTablesSchema.safeParse(tables);
  if (!parsed.success) {
    throw new BackupError("VALIDATION_ERROR", "Backup archive failed validation");
  }
  return parsed.data;
}

export function hashBackupTables(tables: BackupTables): { sha256: string; bytes: number } {
  const canonical = canonicalJson(tables);
  const bytes = Buffer.byteLength(canonical, "utf8");
  if (bytes > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
  }
  return { sha256: sha256Hex(canonical), bytes };
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

export function parseBackupArchive(input: unknown): BackupArchive {
  const parsedInput = parseJsonInput(input);
  if (archiveBytes(parsedInput) > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new BackupError("TOO_LARGE", "Backup archive exceeds the maximum size");
  }
  const parsed = backupArchiveSchema.safeParse(parsedInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    if (path.includes("schemaVersion") || path.includes("databaseSchemaVersion")) {
      throw new BackupError("INCOMPATIBLE_SCHEMA", "Backup schema version is not supported");
    }
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
