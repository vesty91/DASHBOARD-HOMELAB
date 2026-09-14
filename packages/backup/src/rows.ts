import {
  BACKUP_COLUMNS,
  BOOLEAN_COLUMNS,
  DATE_COLUMNS,
  JSON_OBJECT_COLUMNS,
  JSON_OBJECT_OR_NULL_COLUMNS,
  type BackupTableName,
} from "./columns";
import { BackupError } from "./errors";

function asRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new BackupError("VALIDATION_ERROR", "Backup row is invalid");
  }
  return row as Record<string, unknown>;
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : typeof value === "string"
          ? new Date(value)
          : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BackupError("VALIDATION_ERROR", "Backup row contains an invalid timestamp");
  }
  return date.toISOString();
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 0) return false;
  if (value === 1) return true;
  throw new BackupError("VALIDATION_ERROR", "Backup row contains an invalid boolean");
}

function toJsonObject(value: unknown, nullable: boolean): Record<string, unknown> | null {
  if (value == null) {
    if (nullable) return null;
    return {};
  }
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new BackupError("VALIDATION_ERROR", "Backup row contains invalid JSON");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BackupError("VALIDATION_ERROR", "Backup row contains invalid JSON");
  }
  return parsed as Record<string, unknown>;
}

export function serializeBackupRow(table: BackupTableName, row: unknown): Record<string, unknown> {
  const source = asRecord(row);
  const serialized: Record<string, unknown> = {};
  for (const column of BACKUP_COLUMNS[table]) {
    const value = source[column];
    if (DATE_COLUMNS.has(column)) {
      serialized[column] = toIsoDate(value ?? null);
      continue;
    }
    if (BOOLEAN_COLUMNS.has(column)) {
      serialized[column] = toBoolean(value);
      continue;
    }
    if (JSON_OBJECT_COLUMNS.has(column)) {
      serialized[column] = toJsonObject(value, false);
      continue;
    }
    if (JSON_OBJECT_OR_NULL_COLUMNS.has(column)) {
      serialized[column] = toJsonObject(value, true);
      continue;
    }
    serialized[column] = value === undefined ? null : value;
  }
  return serialized;
}

export function deserializeBackupRow(
  table: BackupTableName,
  row: Record<string, unknown>,
  dialect: "sqlite" | "postgres",
): Record<string, unknown> {
  const deserialized: Record<string, unknown> = {};
  for (const column of BACKUP_COLUMNS[table]) {
    const value = row[column];
    if (DATE_COLUMNS.has(column)) {
      deserialized[column] = value == null ? null : new Date(String(value));
      continue;
    }
    if (JSON_OBJECT_COLUMNS.has(column) || JSON_OBJECT_OR_NULL_COLUMNS.has(column)) {
      if (value == null) {
        deserialized[column] = null;
        continue;
      }
      deserialized[column] = dialect === "sqlite" ? JSON.stringify(value) : value;
      continue;
    }
    deserialized[column] = value;
  }
  return deserialized;
}
