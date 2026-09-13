import {
  IntegrationError,
  type IntegrationClientContext,
  type JsonObject,
} from "@dashboard/integrations";
import { mapServerInfo, mapSessions, parseJsonObject } from "./dto";
import { JellyfinError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  JELLYFIN_ACTIVE_WITHIN_SECONDS,
  JELLYFIN_SESSIONS_PATH,
  JELLYFIN_SYSTEM_INFO_PATH,
} from "./policy";
import type { JellyfinConfig, JellyfinSecrets } from "./schemas";
import {
  JELLYFIN_JSON_MAX_BYTES,
  JELLYFIN_SESSIONS_MAX_BYTES,
  jellyfinFetch,
  type JellyfinRequestFn,
  type JellyfinTransportContext,
} from "./transport";
import type {
  JellyfinOverview,
  JellyfinOverviewStatus,
  JellyfinSection,
  JellyfinSectionReason,
  JellyfinServerDto,
  JellyfinSessionsDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const JELLYFIN_OVERVIEW_FAILURE_TTL_MS = 15_000;
export const SERVER_INFO_CACHE_TTL_MS = 30_000;

export interface JellyfinClientContext extends JellyfinTransportContext {
  readonly request: JellyfinRequestFn;
  readonly secretValues: readonly string[];
}

export function jellyfinContextFromIntegration(
  ctx: IntegrationClientContext<JellyfinConfig, JellyfinSecrets> & {
    secretValues?: readonly string[];
  },
): JellyfinClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    apiKey: ctx.secrets.apiKey,
    request: ctx.request,
    secretValues: ctx.secretValues ?? [ctx.secrets.apiKey],
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

function sectionFromError<T>(error: unknown): JellyfinSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: JellyfinRequestFn,
  ctx: JellyfinTransportContext,
  pathname: string,
  options?: { search?: URLSearchParams; maxBodyBytes?: number },
): Promise<unknown> {
  const result = await jellyfinFetch(request, ctx, "GET", pathname, options);
  return parseJsonObject(result.body);
}

export async function testJellyfinConnection(
  ctx: JellyfinClientContext,
): Promise<{ serverName: string | null; version: string | null }> {
  const payload = await readJson(ctx.request, ctx, JELLYFIN_SYSTEM_INFO_PATH, {
    maxBodyBytes: JELLYFIN_JSON_MAX_BYTES,
  });
  const server = mapServerInfo(payload, ctx.secretValues);
  return { serverName: server.serverName, version: server.version };
}

async function loadServer(ctx: JellyfinClientContext): Promise<JellyfinSection<JellyfinServerDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, JELLYFIN_SYSTEM_INFO_PATH, {
      maxBodyBytes: JELLYFIN_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapServerInfo(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof JellyfinError) return sectionFromError(error);
    if (error instanceof IntegrationError) return sectionFromError(error);
    throw error;
  }
}

async function loadSessions(
  ctx: JellyfinClientContext,
): Promise<JellyfinSection<JellyfinSessionsDto>> {
  try {
    const search = new URLSearchParams({
      activeWithinSeconds: String(JELLYFIN_ACTIVE_WITHIN_SECONDS),
    });
    const payload = await readJson(ctx.request, ctx, JELLYFIN_SESSIONS_PATH, {
      search,
      maxBodyBytes: JELLYFIN_SESSIONS_MAX_BYTES,
    });
    return { status: "available", data: mapSessions(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof JellyfinError) return sectionFromError(error);
    if (error instanceof IntegrationError) return sectionFromError(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: JellyfinOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: JellyfinSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new JellyfinError("UNAUTHORIZED", "Jellyfin API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Jellyfin request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Jellyfin rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Jellyfin request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Jellyfin request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Jellyfin request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Jellyfin access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Jellyfin endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Jellyfin overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchJellyfinOverview(ctx: JellyfinClientContext): Promise<JellyfinOverview> {
  const [server, sessions] = await Promise.all([loadServer(ctx), loadSessions(ctx)]);
  const status: JellyfinOverviewStatus =
    server.status === "available" && sessions.status === "available" ? "available" : "degraded";
  if (server.status === "unavailable" && sessions.status === "unavailable") {
    const reason =
      server.reason && sessions.reason && server.reason !== sessions.reason
        ? server.reason
        : (server.reason ?? sessions.reason ?? "unknown");
    throwFromSectionReason(reason);
  }
  return {
    status,
    fetchedAt: new Date().toISOString(),
    server,
    sessions,
  };
}

export function timeoutFromConfig(config: JsonObject): number {
  const raw = config.timeoutMs;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return 8_000;
  return raw;
}
