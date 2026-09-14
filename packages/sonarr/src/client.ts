import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import {
  mapDiskSpace,
  mapHealth,
  mapQueueStatus,
  mapSeries,
  mapSystemStatus,
  parseJsonValue,
} from "./dto";
import { SonarrError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  SONARR_DISKSPACE_PATH,
  SONARR_HEALTH_PATH,
  SONARR_QUEUE_STATUS_PATH,
  SONARR_SERIES_PATH,
  SONARR_SYSTEM_STATUS_PATH,
} from "./policy";
import type { SonarrConfig, SonarrSecrets } from "./schemas";
import {
  SONARR_JSON_MAX_BYTES,
  SONARR_LIST_MAX_BYTES,
  sonarrFetch,
  type SonarrRequestFn,
  type SonarrTransportContext,
} from "./transport";
import type {
  SonarrDiskSpaceDto,
  SonarrHealthDto,
  SonarrOverview,
  SonarrOverviewStatus,
  SonarrQueueStatusDto,
  SonarrSection,
  SonarrSectionReason,
  SonarrSeriesDto,
  SonarrSystemStatusDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const SONARR_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface SonarrClientContext extends SonarrTransportContext {
  readonly request: SonarrRequestFn;
  readonly secretValues: readonly string[];
}

export function sonarrContextFromIntegration(
  ctx: IntegrationClientContext<SonarrConfig, SonarrSecrets> & {
    secretValues?: readonly string[];
  },
): SonarrClientContext {
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

function sectionFromError<T>(error: unknown): SonarrSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: SonarrRequestFn,
  ctx: SonarrTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await sonarrFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testSonarrConnection(
  ctx: SonarrClientContext,
): Promise<SonarrSystemStatusDto> {
  const payload = await readJson(ctx.request, ctx, SONARR_SYSTEM_STATUS_PATH, {
    maxBodyBytes: SONARR_JSON_MAX_BYTES,
  });
  return mapSystemStatus(payload, ctx.secretValues);
}

async function loadSystem(ctx: SonarrClientContext): Promise<SonarrSection<SonarrSystemStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SONARR_SYSTEM_STATUS_PATH, {
      maxBodyBytes: SONARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapSystemStatus(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof SonarrError || error instanceof IntegrationError)
      return sectionFromError<SonarrSystemStatusDto>(error);
    throw error;
  }
}

async function loadHealth(ctx: SonarrClientContext): Promise<SonarrSection<SonarrHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SONARR_HEALTH_PATH, {
      maxBodyBytes: SONARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapHealth(payload) };
  } catch (error) {
    if (error instanceof SonarrError || error instanceof IntegrationError)
      return sectionFromError<SonarrHealthDto>(error);
    throw error;
  }
}

async function loadQueue(ctx: SonarrClientContext): Promise<SonarrSection<SonarrQueueStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SONARR_QUEUE_STATUS_PATH, {
      maxBodyBytes: SONARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapQueueStatus(payload) };
  } catch (error) {
    if (error instanceof SonarrError || error instanceof IntegrationError)
      return sectionFromError<SonarrQueueStatusDto>(error);
    throw error;
  }
}

async function loadSeries(ctx: SonarrClientContext): Promise<SonarrSection<SonarrSeriesDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SONARR_SERIES_PATH, {
      maxBodyBytes: SONARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapSeries(payload) };
  } catch (error) {
    if (error instanceof SonarrError || error instanceof IntegrationError)
      return sectionFromError<SonarrSeriesDto>(error);
    throw error;
  }
}

async function loadDiskSpace(ctx: SonarrClientContext): Promise<SonarrSection<SonarrDiskSpaceDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SONARR_DISKSPACE_PATH, {
      maxBodyBytes: SONARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapDiskSpace(payload) };
  } catch (error) {
    if (error instanceof SonarrError || error instanceof IntegrationError)
      return sectionFromError<SonarrDiskSpaceDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: SonarrOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: SonarrSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new SonarrError("UNAUTHORIZED", "Sonarr API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Sonarr request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Sonarr rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Sonarr request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Sonarr request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Sonarr request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Sonarr access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Sonarr endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Sonarr overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchSonarrOverview(ctx: SonarrClientContext): Promise<SonarrOverview> {
  const [system, health, queue, series, diskSpace] = await Promise.all([
    loadSystem(ctx),
    loadHealth(ctx),
    loadQueue(ctx),
    loadSeries(ctx),
    loadDiskSpace(ctx),
  ]);
  const sections = [system, health, queue, series, diskSpace];
  const available = sections.filter((section) => section.status === "available").length;
  if (system.status === "unavailable" && system.reason === "unauthorized") {
    throwFromSectionReason("unauthorized");
  }
  if (available === 0) {
    throwFromSectionReason(
      system.reason ??
        health.reason ??
        queue.reason ??
        series.reason ??
        diskSpace.reason ??
        "unknown",
    );
  }
  const status: SonarrOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    system,
    health,
    queue,
    series,
    diskSpace,
  };
}
