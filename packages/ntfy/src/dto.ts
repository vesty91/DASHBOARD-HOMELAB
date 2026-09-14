import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type { NtfyHealthDto, NtfyStatsDto, NtfyVersionDto } from "./types";

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "ntfy returned invalid JSON");
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

function parseNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(message);
  return value;
}

function parseNonNegativeNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(message);
  return value;
}

export function mapHealth(value: unknown): NtfyHealthDto {
  const record = asRecord(value, "ntfy health payload is invalid");
  if (typeof record.healthy !== "boolean") invalid("ntfy health healthy field is required");
  return { healthy: record.healthy };
}

export function mapStats(value: unknown): NtfyStatsDto {
  const record = asRecord(value, "ntfy stats payload is invalid");
  return {
    messages: parseNonNegativeInteger(record.messages, "ntfy stats messages is invalid"),
    messagesRate: parseNonNegativeNumber(
      record.messages_rate,
      "ntfy stats messages_rate is invalid",
    ),
  };
}

export function mapVersion(value: unknown, secretValues: readonly string[] = []): NtfyVersionDto {
  const record = asRecord(value, "ntfy version payload is invalid");
  return {
    version: redactText(boundText(record.version, 64), secretValues),
    commit: redactText(boundText(record.commit, 64), secretValues),
    date: redactText(boundText(record.date, 64), secretValues),
  };
}
