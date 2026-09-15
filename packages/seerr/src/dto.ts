import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type { SeerrCountsDto, SeerrStatusDto } from "./types";

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Seerr returned invalid JSON");
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

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value))
    return undefined;
  return value;
}

export function mapStatus(value: unknown, secretValues: readonly string[] = []): SeerrStatusDto {
  const record = asRecord(value, "Seerr status payload is invalid");
  const version = redactText(boundText(record.version, 64), secretValues);
  return {
    version,
    ...(version === null ? {} : { compatibleProduct: "seerr-family" as const }),
  };
}

export function mapCounts(value: unknown): SeerrCountsDto {
  const record = asRecord(value, "Seerr request count payload is invalid");
  const pending = asNonNegativeInt(record.pending);
  const approved = asNonNegativeInt(record.approved);
  const processing = asNonNegativeInt(record.processing);
  const available = asNonNegativeInt(record.available);
  if (
    pending === undefined ||
    approved === undefined ||
    processing === undefined ||
    available === undefined
  )
    invalid("Seerr request count payload is invalid");
  const counts = {
    pending,
    approved,
    processing,
    available,
  };
  const total = asNonNegativeInt(record.total);
  if (total === undefined) return counts;
  return { ...counts, total };
}
