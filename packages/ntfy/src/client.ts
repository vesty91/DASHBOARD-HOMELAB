import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { mapHealth, mapStats, mapVersion, parseJsonValue } from "./dto";
import { NtfyError, sectionReasonFromError, toIntegrationError } from "./errors";
import { NTFY_HEALTH_PATH, NTFY_STATS_PATH, NTFY_VERSION_PATH } from "./policy";
import type { NtfyConfig, NtfySecrets } from "./schemas";
import {
  assertNtfyMessage,
  assertNtfyPriority,
  assertNtfyTags,
  assertNtfyTitle,
  ntfyPublishPath,
} from "./topic";
import {
  NTFY_JSON_MAX_BYTES,
  ntfyFetch,
  ntfyPublish,
  type NtfyRequestFn,
  type NtfyTransportContext,
} from "./transport";
import type {
  NtfyHealthDto,
  NtfyOverview,
  NtfyOverviewStatus,
  NtfySection,
  NtfySectionReason,
  NtfyStatsDto,
  NtfyVersionDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const NTFY_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface NtfyClientContext extends NtfyTransportContext {
  readonly request: NtfyRequestFn;
  readonly secretValues: readonly string[];
}

export function ntfyContextFromIntegration(
  ctx: IntegrationClientContext<NtfyConfig, NtfySecrets> & {
    secretValues?: readonly string[];
  },
): NtfyClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  const configuredToken =
    "accessToken" in ctx.secrets && typeof ctx.secrets.accessToken === "string"
      ? ctx.secrets.accessToken
      : undefined;
  const accessToken =
    configuredToken !== undefined && configuredToken.length > 0 ? configuredToken : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    request: ctx.request,
    secretValues: ctx.secretValues ?? (accessToken === undefined ? [] : [accessToken]),
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

function sectionFromError<T>(error: unknown): NtfySection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: NtfyRequestFn,
  ctx: NtfyTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await ntfyFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testNtfyConnection(ctx: NtfyClientContext): Promise<NtfyHealthDto> {
  const payload = await readJson(ctx.request, ctx, NTFY_HEALTH_PATH, {
    maxBodyBytes: NTFY_JSON_MAX_BYTES,
  });
  return mapHealth(payload);
}

async function loadHealth(ctx: NtfyClientContext): Promise<NtfySection<NtfyHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, NTFY_HEALTH_PATH, {
      maxBodyBytes: NTFY_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapHealth(payload) };
  } catch (error) {
    if (error instanceof NtfyError || error instanceof IntegrationError)
      return sectionFromError<NtfyHealthDto>(error);
    throw error;
  }
}

async function loadStats(ctx: NtfyClientContext): Promise<NtfySection<NtfyStatsDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, NTFY_STATS_PATH, {
      maxBodyBytes: NTFY_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapStats(payload) };
  } catch (error) {
    if (error instanceof NtfyError || error instanceof IntegrationError)
      return sectionFromError<NtfyStatsDto>(error);
    throw error;
  }
}

async function loadVersion(ctx: NtfyClientContext): Promise<NtfySection<NtfyVersionDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, NTFY_VERSION_PATH, {
      maxBodyBytes: NTFY_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapVersion(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof NtfyError || error instanceof IntegrationError)
      return sectionFromError<NtfyVersionDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: NtfyOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: NtfySectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new NtfyError("UNAUTHORIZED", "ntfy access token is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "ntfy request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "ntfy rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "ntfy request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "ntfy request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "ntfy request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "ntfy access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "ntfy endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "ntfy overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchNtfyOverview(ctx: NtfyClientContext): Promise<NtfyOverview> {
  const [health, stats, version] = await Promise.all([
    loadHealth(ctx),
    loadStats(ctx),
    loadVersion(ctx),
  ]);
  const sections = [health, stats, version];
  const available = sections.filter((section) => section.status === "available").length;
  if (health.status === "unavailable" && health.reason === "unauthorized") {
    throwFromSectionReason("unauthorized");
  }
  if (available === 0) {
    throwFromSectionReason(health.reason ?? stats.reason ?? version.reason ?? "unknown");
  }
  const unhealthy = health.status === "available" && health.data?.healthy === false;
  const status: NtfyOverviewStatus =
    available === sections.length && !unhealthy ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    health,
    stats,
    version,
  };
}

export async function postNtfyPublish(
  ctx: NtfyClientContext,
  input: {
    topic: string;
    message: string;
    title?: string;
    priority: string;
    tags?: readonly string[];
  },
): Promise<void> {
  const title = assertNtfyTitle(input.title);
  await ntfyPublish(
    ctx.request,
    ctx,
    ntfyPublishPath(input.topic),
    assertNtfyMessage(input.message),
    {
      priority: assertNtfyPriority(input.priority),
      tags: assertNtfyTags(input.tags),
      ...(title === undefined ? {} : { title }),
    },
  );
}
