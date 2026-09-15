import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import {
  mapDiskSpace,
  mapHealth,
  mapQueueStatus,
  mapMovie,
  mapSystemStatus,
  parseJsonValue,
} from "./dto";
import { RadarrError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  RADARR_DISKSPACE_PATH,
  RADARR_HEALTH_PATH,
  RADARR_QUEUE_STATUS_PATH,
  RADARR_MOVIE_PATH,
  RADARR_SYSTEM_STATUS_PATH,
} from "./policy";
import type { RadarrConfig, RadarrSecrets } from "./schemas";
import {
  RADARR_JSON_MAX_BYTES,
  RADARR_LIST_MAX_BYTES,
  radarrCommand,
  radarrFetch,
  type RadarrRequestFn,
  type RadarrTransportContext,
} from "./transport";
import type { RadarrQueuedCommand } from "./command";
import type {
  RadarrDiskSpaceDto,
  RadarrHealthDto,
  RadarrOverview,
  RadarrOverviewStatus,
  RadarrQueueStatusDto,
  RadarrSection,
  RadarrSectionReason,
  RadarrMovieDto,
  RadarrSystemStatusDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const RADARR_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface RadarrClientContext extends RadarrTransportContext {
  readonly request: RadarrRequestFn;
  readonly secretValues: readonly string[];
}

export function radarrContextFromIntegration(
  ctx: IntegrationClientContext<RadarrConfig, RadarrSecrets> & {
    secretValues?: readonly string[];
  },
): RadarrClientContext {
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

function sectionFromError<T>(error: unknown): RadarrSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: RadarrRequestFn,
  ctx: RadarrTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await radarrFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testRadarrConnection(
  ctx: RadarrClientContext,
): Promise<RadarrSystemStatusDto> {
  const payload = await readJson(ctx.request, ctx, RADARR_SYSTEM_STATUS_PATH, {
    maxBodyBytes: RADARR_JSON_MAX_BYTES,
  });
  return mapSystemStatus(payload, ctx.secretValues);
}

async function loadSystem(ctx: RadarrClientContext): Promise<RadarrSection<RadarrSystemStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, RADARR_SYSTEM_STATUS_PATH, {
      maxBodyBytes: RADARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapSystemStatus(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof RadarrError || error instanceof IntegrationError)
      return sectionFromError<RadarrSystemStatusDto>(error);
    throw error;
  }
}

async function loadHealth(ctx: RadarrClientContext): Promise<RadarrSection<RadarrHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, RADARR_HEALTH_PATH, {
      maxBodyBytes: RADARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapHealth(payload) };
  } catch (error) {
    if (error instanceof RadarrError || error instanceof IntegrationError)
      return sectionFromError<RadarrHealthDto>(error);
    throw error;
  }
}

async function loadQueue(ctx: RadarrClientContext): Promise<RadarrSection<RadarrQueueStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, RADARR_QUEUE_STATUS_PATH, {
      maxBodyBytes: RADARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapQueueStatus(payload) };
  } catch (error) {
    if (error instanceof RadarrError || error instanceof IntegrationError)
      return sectionFromError<RadarrQueueStatusDto>(error);
    throw error;
  }
}

async function loadMovie(ctx: RadarrClientContext): Promise<RadarrSection<RadarrMovieDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, RADARR_MOVIE_PATH, {
      maxBodyBytes: RADARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapMovie(payload) };
  } catch (error) {
    if (error instanceof RadarrError || error instanceof IntegrationError)
      return sectionFromError<RadarrMovieDto>(error);
    throw error;
  }
}

async function loadDiskSpace(ctx: RadarrClientContext): Promise<RadarrSection<RadarrDiskSpaceDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, RADARR_DISKSPACE_PATH, {
      maxBodyBytes: RADARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapDiskSpace(payload) };
  } catch (error) {
    if (error instanceof RadarrError || error instanceof IntegrationError)
      return sectionFromError<RadarrDiskSpaceDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: RadarrOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: RadarrSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new RadarrError("UNAUTHORIZED", "Radarr API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Radarr request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Radarr rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Radarr request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Radarr request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Radarr request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Radarr access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Radarr endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Radarr overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchRadarrOverview(ctx: RadarrClientContext): Promise<RadarrOverview> {
  const [system, health, queue, movie, diskSpace] = await Promise.all([
    loadSystem(ctx),
    loadHealth(ctx),
    loadQueue(ctx),
    loadMovie(ctx),
    loadDiskSpace(ctx),
  ]);
  const sections = [system, health, queue, movie, diskSpace];
  const available = sections.filter((section) => section.status === "available").length;
  if (system.status === "unavailable" && system.reason === "unauthorized") {
    throwFromSectionReason("unauthorized");
  }
  if (available === 0) {
    throwFromSectionReason(
      system.reason ??
        health.reason ??
        queue.reason ??
        movie.reason ??
        diskSpace.reason ??
        "unknown",
    );
  }
  const status: RadarrOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    system,
    health,
    queue,
    movie,
    diskSpace,
  };
}

export async function postRadarrCommand(
  ctx: RadarrClientContext,
  command: RadarrQueuedCommand,
): Promise<void> {
  await radarrCommand(ctx.request, ctx, command);
}
