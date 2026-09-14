import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  RadarrDiskSpaceDto,
  RadarrHealthDto,
  RadarrQueueStatusDto,
  RadarrMovieDto,
  RadarrSystemStatusDto,
} from "./types";

export const RADARR_HEALTH_MAX = 2_000;
export const RADARR_MOVIE_MAX = 2_000;
export const RADARR_DISKSPACE_MAX = 64;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Radarr returned invalid JSON");
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

function classifyHealthType(value: unknown): keyof RadarrHealthDto {
  const normalized = boundText(value, 32)?.toLocaleLowerCase("und");
  if (normalized === "error") return "error";
  if (normalized === "warning") return "warning";
  if (normalized === "notice") return "notice";
  return "other";
}

export function mapSystemStatus(
  value: unknown,
  secretValues: readonly string[] = [],
): RadarrSystemStatusDto {
  const record = asRecord(value, "Radarr system status payload is invalid");
  const version = redactText(boundText(record.version, 64), secretValues);
  const appName = redactText(boundText(record.appName, 32), secretValues);
  return {
    version,
    ...(appName === null ? {} : { appName }),
  };
}

export function mapHealth(value: unknown): RadarrHealthDto {
  if (!Array.isArray(value)) invalid("Radarr health payload is invalid");
  if (value.length > RADARR_HEALTH_MAX) invalid("Radarr health payload is oversized");
  const counts = { error: 0, warning: 0, notice: 0, other: 0 };
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Radarr health payload is invalid");
    const type = classifyHealthType((entry as Record<string, unknown>).type);
    counts[type] += 1;
  }
  return counts;
}

export function mapQueueStatus(value: unknown): RadarrQueueStatusDto {
  const record = asRecord(value, "Radarr queue status payload is invalid");
  const totalCount = asOptionalSafeInteger(record.totalCount);
  const count = asOptionalSafeInteger(record.count);
  const unknownCount = asOptionalSafeInteger(record.unknownCount);
  return {
    ...(totalCount === undefined ? {} : { totalCount }),
    ...(count === undefined ? {} : { count }),
    ...(unknownCount === undefined ? {} : { unknownCount }),
  };
}

export function mapMovie(value: unknown): RadarrMovieDto {
  if (!Array.isArray(value)) invalid("Radarr movie payload is invalid");
  if (value.length > RADARR_MOVIE_MAX) invalid("Radarr movie payload is oversized");
  for (const entry of value)
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Radarr movie payload is invalid");
  return { count: value.length, truncated: value.length === RADARR_MOVIE_MAX };
}

export function mapDiskSpace(value: unknown): RadarrDiskSpaceDto {
  if (!Array.isArray(value)) invalid("Radarr diskspace payload is invalid");
  if (value.length > RADARR_DISKSPACE_MAX) invalid("Radarr diskspace payload is oversized");
  let freeBytes = 0;
  let totalBytes = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Radarr diskspace payload is invalid");
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
