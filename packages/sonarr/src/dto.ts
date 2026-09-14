import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  SonarrDiskSpaceDto,
  SonarrHealthDto,
  SonarrQueueStatusDto,
  SonarrSeriesDto,
  SonarrSystemStatusDto,
} from "./types";

export const SONARR_HEALTH_MAX = 2_000;
export const SONARR_SERIES_MAX = 2_000;
export const SONARR_DISKSPACE_MAX = 64;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Sonarr returned invalid JSON");
  }
}

function boundText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function redactText(value: string | null, secretValues: readonly string[]): string | null {
  if (value === null) return null;
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function asOptionalSafeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

function asNonNegativeFinite(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Number.isSafeInteger(value) ? value : value;
}

function classifyHealthType(value: unknown): keyof SonarrHealthDto {
  const normalized = boundText(value, 32)?.toLocaleLowerCase("und");
  if (normalized === "error") return "error";
  if (normalized === "warning") return "warning";
  if (normalized === "notice") return "notice";
  return "other";
}

export function mapSystemStatus(
  value: unknown,
  secretValues: readonly string[] = [],
): SonarrSystemStatusDto {
  const record = asRecord(value, "Sonarr system status payload is invalid");
  const version = redactText(boundText(record.version, 64), secretValues);
  const appName = redactText(boundText(record.appName, 32), secretValues);
  return {
    version,
    ...(appName === null ? {} : { appName }),
  };
}

export function mapHealth(value: unknown): SonarrHealthDto {
  if (!Array.isArray(value)) invalid("Sonarr health payload is invalid");
  if (value.length > SONARR_HEALTH_MAX) invalid("Sonarr health payload is oversized");
  const counts = { error: 0, warning: 0, notice: 0, other: 0 };
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Sonarr health payload is invalid");
    const type = classifyHealthType((entry as Record<string, unknown>).type);
    counts[type] += 1;
  }
  return counts;
}

export function mapQueueStatus(value: unknown): SonarrQueueStatusDto {
  const record = asRecord(value, "Sonarr queue status payload is invalid");
  const totalCount = asOptionalSafeInteger(record.totalCount);
  const count = asOptionalSafeInteger(record.count);
  const unknownCount = asOptionalSafeInteger(record.unknownCount);
  const errors = asOptionalSafeInteger(record.errors);
  const warnings = asOptionalSafeInteger(record.warnings);
  return {
    ...(totalCount === undefined ? {} : { totalCount }),
    ...(count === undefined ? {} : { count }),
    ...(unknownCount === undefined ? {} : { unknownCount }),
    ...(errors === undefined ? {} : { errors }),
    ...(warnings === undefined ? {} : { warnings }),
  };
}

export function mapSeries(value: unknown): SonarrSeriesDto {
  if (!Array.isArray(value)) invalid("Sonarr series payload is invalid");
  if (value.length > SONARR_SERIES_MAX) invalid("Sonarr series payload is oversized");
  for (const entry of value)
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Sonarr series payload is invalid");
  return { count: value.length, truncated: value.length === SONARR_SERIES_MAX };
}

export function mapDiskSpace(value: unknown): SonarrDiskSpaceDto {
  if (!Array.isArray(value)) invalid("Sonarr diskspace payload is invalid");
  if (value.length > SONARR_DISKSPACE_MAX) invalid("Sonarr diskspace payload is oversized");
  let freeBytes = 0;
  let totalBytes = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Sonarr diskspace payload is invalid");
    const record = entry as Record<string, unknown>;
    const freeSpace = asNonNegativeFinite(record.freeSpace);
    const totalSpace = asNonNegativeFinite(record.totalSpace);
    if (freeSpace === undefined || totalSpace === undefined) continue;
    freeBytes += freeSpace;
    totalBytes += totalSpace;
  }
  return {
    freeBytes: Number.isSafeInteger(freeBytes) ? freeBytes : freeBytes,
    totalBytes: Number.isSafeInteger(totalBytes) ? totalBytes : totalBytes,
  };
}
