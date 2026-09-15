import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  ProwlarrHealthDto,
  ProwlarrIndexerDto,
  ProwlarrIndexerStatusDto,
  ProwlarrSystemStatusDto,
} from "./types";

export const PROWLARR_HEALTH_MAX = 2_000;
export const PROWLARR_INDEXER_MAX = 2_000;
export const PROWLARR_INDEXERSTATUS_MAX = 2_000;

type HealthCountKey = "error" | "warning" | "notice" | "other";

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Prowlarr returned invalid JSON");
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

function classifyHealthType(value: unknown): HealthCountKey {
  const normalized = boundText(value, 32)?.toLocaleLowerCase("und");
  if (normalized === "error") return "error";
  if (normalized === "warning") return "warning";
  if (normalized === "notice") return "notice";
  return "other";
}

export function mapSystemStatus(
  value: unknown,
  secretValues: readonly string[] = [],
): ProwlarrSystemStatusDto {
  const record = asRecord(value, "Prowlarr system status payload is invalid");
  const version = redactText(boundText(record.version, 64), secretValues);
  const appName = redactText(boundText(record.appName, 32), secretValues);
  return {
    version,
    ...(appName === null ? {} : { appName }),
  };
}

export function mapHealth(value: unknown): ProwlarrHealthDto {
  if (!Array.isArray(value)) invalid("Prowlarr health payload is invalid");
  if (value.length > PROWLARR_HEALTH_MAX) invalid("Prowlarr health payload is oversized");
  const counts = { error: 0, warning: 0, notice: 0, other: 0 };
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Prowlarr health payload is invalid");
    const type = classifyHealthType((entry as Record<string, unknown>).type);
    counts[type] += 1;
  }
  return counts;
}

export function mapIndexer(value: unknown): ProwlarrIndexerDto {
  if (!Array.isArray(value)) invalid("Prowlarr indexer payload is invalid");
  if (value.length > PROWLARR_INDEXER_MAX) invalid("Prowlarr indexer payload is oversized");
  let enabledCount = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Prowlarr indexer payload is invalid");
    if ((entry as Record<string, unknown>).enable === true) enabledCount += 1;
  }
  return { count: value.length, enabledCount };
}

export function mapIndexerStatus(value: unknown): ProwlarrIndexerStatusDto {
  if (!Array.isArray(value)) invalid("Prowlarr indexer status payload is invalid");
  if (value.length > PROWLARR_INDEXERSTATUS_MAX)
    invalid("Prowlarr indexer status payload is oversized");
  for (const entry of value)
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Prowlarr indexer status payload is invalid");
  return { count: value.length };
}
