import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import {
  immichAboutResponseSchema,
  immichPingResponseSchema,
  immichStatsResponseSchema,
  immichStorageResponseSchema,
  immichVersionResponseSchema,
} from "./schemas";
import type { ImmichHealthDto, ImmichServerDto, ImmichStatsDto, ImmichStorageDto } from "./types";

export function parseJsonObject(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Immich returned invalid JSON");
  }
}

function redactText(value: string | null, secretValues: readonly string[]): string | null {
  if (value === null) return null;
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

export function mapServer(
  versionPayload: unknown,
  aboutPayload: unknown,
  secretValues: readonly string[] = [],
): ImmichServerDto {
  const version = immichVersionResponseSchema.safeParse(versionPayload);
  const about = immichAboutResponseSchema.safeParse(aboutPayload);
  if (!version.success && !about.success)
    throw new IntegrationError("INVALID_RESPONSE", "Immich server info is invalid");
  const composed = version.success
    ? `${version.data.major}.${version.data.minor}.${version.data.patch}`
    : null;
  const aboutVersion = about.success ? about.data.version?.trim() || null : null;
  return {
    version: redactText(aboutVersion ?? composed, secretValues),
    licensed:
      about.success && typeof about.data.licensed === "boolean" ? about.data.licensed : null,
  };
}

export function mapHealth(payload: unknown): ImmichHealthDto {
  const parsed = immichPingResponseSchema.safeParse(payload);
  if (!parsed.success) throw new IntegrationError("INVALID_RESPONSE", "Immich ping is invalid");
  return { ok: parsed.data.res.trim().toLocaleLowerCase("und") === "pong" };
}

export function mapStorage(
  payload: unknown,
  secretValues: readonly string[] = [],
): ImmichStorageDto {
  const parsed = immichStorageResponseSchema.safeParse(payload);
  if (!parsed.success) throw new IntegrationError("INVALID_RESPONSE", "Immich storage is invalid");
  const leak = (value: number) => (secretValues.includes(String(value)) ? null : value);
  return {
    diskSizeBytes: leak(parsed.data.diskSizeRaw),
    diskUseBytes: leak(parsed.data.diskUseRaw),
    diskAvailableBytes: leak(parsed.data.diskAvailableRaw),
    diskUsagePercent: secretValues.includes(String(parsed.data.diskUsagePercentage))
      ? null
      : parsed.data.diskUsagePercentage,
  };
}

export function mapStats(payload: unknown, secretValues: readonly string[] = []): ImmichStatsDto {
  const parsed = immichStatsResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new IntegrationError("INVALID_RESPONSE", "Immich statistics are invalid");
  const leak = (value: number) => (secretValues.includes(String(value)) ? null : value);
  return {
    photos: leak(parsed.data.photos),
    videos: leak(parsed.data.videos),
    usageBytes: leak(parsed.data.usage),
  };
}
