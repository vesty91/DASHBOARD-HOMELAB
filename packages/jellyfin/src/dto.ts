import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  JellyfinNowPlayingDto,
  JellyfinPlaybackMode,
  JellyfinServerDto,
  JellyfinSessionDto,
  JellyfinSessionsDto,
  JellyfinTranscodingDto,
} from "./types";

const MAX_NAME = 120;
const MAX_ID = 64;
const MAX_SESSIONS = 64;

export function boundText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    return value;
  }
  if (typeof value !== "string" || !/^-?\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function redactCredentialText(
  value: string | null,
  secretValues: readonly string[],
): string | null {
  if (value === null) return null;
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

function requireUniqueSessionId(seen: Set<string>, id: string): void {
  if (seen.has(id))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "Jellyfin session ids collided after sanitizing",
    );
  seen.add(id);
}

function projectSessionId(id: string | null, secretValues: readonly string[]): string {
  const raw = id ?? "session";
  const afterSecrets = redactCredentialText(raw, secretValues) ?? raw;
  const sanitized = afterSecrets.replaceAll(/[^A-Za-z0-9._-]/gu, "_").slice(0, MAX_ID);
  return sanitized.length > 0 ? sanitized : "_redacted_";
}

export function mapPlaybackMode(value: unknown): JellyfinPlaybackMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("und").replaceAll(" ", "");
  switch (normalized) {
    case "directplay":
      return "direct-play";
    case "directstream":
      return "direct-stream";
    case "transcode":
      return "transcode";
    default:
      return null;
  }
}

export function mapTranscoding(
  value: unknown,
  secretValues: readonly string[],
): JellyfinTranscodingDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const progress = parseFiniteNumber(record.CompletionPercentage);
  const bitrate = parseSafeInteger(record.Bitrate);
  return {
    progressPercent:
      progress === null || progress < 0 || progress > 100
        ? null
        : redactCredentialNumber(progress, secretValues),
    bitrate: bitrate === null || bitrate < 0 ? null : redactCredentialNumber(bitrate, secretValues),
  };
}

export function redactCredentialNumber(
  value: number | null,
  secretValues: readonly string[],
): number | null {
  if (value === null) return null;
  return secretValues.includes(String(value)) ? null : value;
}

function mapNowPlaying(
  value: unknown,
  secretValues: readonly string[],
): JellyfinNowPlayingDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const year = parseSafeInteger(record.ProductionYear);
  return {
    name: redactCredentialText(boundText(record.Name, MAX_NAME), secretValues),
    type: redactCredentialText(boundText(record.Type, 32), secretValues),
    year: year === null || year < 1870 || year > 2100 ? null : year,
  };
}

export function mapServerInfo(
  value: unknown,
  secretValues: readonly string[] = [],
): JellyfinServerDto {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new IntegrationError("INVALID_RESPONSE", "Jellyfin system info is invalid");
  const record = value as Record<string, unknown>;
  return {
    serverName: redactCredentialText(boundText(record.ServerName, MAX_NAME), secretValues),
    version: redactCredentialText(boundText(record.Version, 64), secretValues),
    productName: redactCredentialText(boundText(record.ProductName, MAX_NAME), secretValues),
    operatingSystem: redactCredentialText(
      boundText(record.OperatingSystem, MAX_NAME),
      secretValues,
    ),
    startupWizardCompleted: parseOptionalBoolean(record.StartupWizardCompleted),
    hasPendingRestart: parseOptionalBoolean(record.HasPendingRestart),
  };
}

export function mapSessions(
  value: unknown,
  secretValues: readonly string[] = [],
): JellyfinSessionsDto {
  if (!Array.isArray(value))
    throw new IntegrationError("INVALID_RESPONSE", "Jellyfin sessions payload is invalid");
  if (value.length > MAX_SESSIONS)
    throw new IntegrationError("INVALID_RESPONSE", "Jellyfin returned too many sessions");
  const seen = new Set<string>();
  const sessions = value.map((entry) => mapSession(entry, secretValues, seen));
  return {
    activeCount: sessions.filter((session) => session.isActive !== false).length,
    sessions,
  };
}

function mapSession(
  value: unknown,
  secretValues: readonly string[],
  seen: Set<string>,
): JellyfinSessionDto {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new IntegrationError("INVALID_RESPONSE", "Jellyfin session is invalid");
  const record = value as Record<string, unknown>;
  const playState =
    record.PlayState && typeof record.PlayState === "object" && !Array.isArray(record.PlayState)
      ? (record.PlayState as Record<string, unknown>)
      : {};
  const id = projectSessionId(boundText(record.Id, MAX_ID), secretValues);
  requireUniqueSessionId(seen, id);
  const userLabel =
    redactCredentialText(boundText(record.UserName, MAX_NAME), secretValues) ?? "Utilisateur";
  const nowPlaying = mapNowPlaying(record.NowPlayingItem, secretValues);
  const playbackMode = mapPlaybackMode(playState.PlayMethod);
  const transcoding =
    playbackMode === "transcode" ? mapTranscoding(record.TranscodingInfo, secretValues) : null;
  return {
    id,
    userLabel,
    client: redactCredentialText(boundText(record.Client, MAX_NAME), secretValues),
    deviceName: redactCredentialText(boundText(record.DeviceName, MAX_NAME), secretValues),
    isActive: parseOptionalBoolean(record.IsActive),
    paused: parseOptionalBoolean(playState.IsPaused),
    nowPlaying,
    playbackMode,
    transcoding,
  };
}

export function parseJsonObject(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Jellyfin returned invalid JSON");
  }
}
