import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { mapHealth, mapIndexer, mapIndexerStatus, mapSystemStatus, parseJsonValue } from "./dto";
import { ProwlarrError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  PROWLARR_HEALTH_PATH,
  PROWLARR_INDEXER_PATH,
  PROWLARR_INDEXERSTATUS_PATH,
  PROWLARR_SYSTEM_STATUS_PATH,
} from "./policy";
import type { ProwlarrConfig, ProwlarrSecrets } from "./schemas";
import {
  PROWLARR_JSON_MAX_BYTES,
  PROWLARR_LIST_MAX_BYTES,
  prowlarrFetch,
  type ProwlarrRequestFn,
  type ProwlarrTransportContext,
} from "./transport";
import type {
  ProwlarrHealthDto,
  ProwlarrIndexerDto,
  ProwlarrIndexerStatusDto,
  ProwlarrOverview,
  ProwlarrOverviewStatus,
  ProwlarrSection,
  ProwlarrSectionReason,
  ProwlarrSystemStatusDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const PROWLARR_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface ProwlarrClientContext extends ProwlarrTransportContext {
  readonly request: ProwlarrRequestFn;
  readonly secretValues: readonly string[];
}

export function prowlarrContextFromIntegration(
  ctx: IntegrationClientContext<ProwlarrConfig, ProwlarrSecrets> & {
    secretValues?: readonly string[];
  },
): ProwlarrClientContext {
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

function sectionFromError<T>(error: unknown): ProwlarrSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: ProwlarrRequestFn,
  ctx: ProwlarrTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await prowlarrFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testProwlarrConnection(
  ctx: ProwlarrClientContext,
): Promise<ProwlarrSystemStatusDto> {
  const payload = await readJson(ctx.request, ctx, PROWLARR_SYSTEM_STATUS_PATH, {
    maxBodyBytes: PROWLARR_JSON_MAX_BYTES,
  });
  return mapSystemStatus(payload, ctx.secretValues);
}

async function loadSystem(
  ctx: ProwlarrClientContext,
): Promise<ProwlarrSection<ProwlarrSystemStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROWLARR_SYSTEM_STATUS_PATH, {
      maxBodyBytes: PROWLARR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapSystemStatus(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ProwlarrError || error instanceof IntegrationError)
      return sectionFromError<ProwlarrSystemStatusDto>(error);
    throw error;
  }
}

async function loadHealth(ctx: ProwlarrClientContext): Promise<ProwlarrSection<ProwlarrHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROWLARR_HEALTH_PATH, {
      maxBodyBytes: PROWLARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapHealth(payload) };
  } catch (error) {
    if (error instanceof ProwlarrError || error instanceof IntegrationError)
      return sectionFromError<ProwlarrHealthDto>(error);
    throw error;
  }
}

async function loadIndexer(
  ctx: ProwlarrClientContext,
): Promise<ProwlarrSection<ProwlarrIndexerDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROWLARR_INDEXER_PATH, {
      maxBodyBytes: PROWLARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapIndexer(payload) };
  } catch (error) {
    if (error instanceof ProwlarrError || error instanceof IntegrationError)
      return sectionFromError<ProwlarrIndexerDto>(error);
    throw error;
  }
}

async function loadIndexerStatus(
  ctx: ProwlarrClientContext,
): Promise<ProwlarrSection<ProwlarrIndexerStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROWLARR_INDEXERSTATUS_PATH, {
      maxBodyBytes: PROWLARR_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapIndexerStatus(payload) };
  } catch (error) {
    if (error instanceof ProwlarrError || error instanceof IntegrationError)
      return sectionFromError<ProwlarrIndexerStatusDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: ProwlarrOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: ProwlarrSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new ProwlarrError("UNAUTHORIZED", "Prowlarr API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Prowlarr request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Prowlarr rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Prowlarr request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Prowlarr request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Prowlarr request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Prowlarr access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Prowlarr endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Prowlarr overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchProwlarrOverview(ctx: ProwlarrClientContext): Promise<ProwlarrOverview> {
  const [system, health, indexer, indexerStatus] = await Promise.all([
    loadSystem(ctx),
    loadHealth(ctx),
    loadIndexer(ctx),
    loadIndexerStatus(ctx),
  ]);
  const sections = [system, health, indexer, indexerStatus];
  const available = sections.filter((section) => section.status === "available").length;
  if (system.status === "unavailable" && system.reason === "unauthorized") {
    throwFromSectionReason("unauthorized");
  }
  if (available === 0) {
    throwFromSectionReason(
      system.reason ?? health.reason ?? indexer.reason ?? indexerStatus.reason ?? "unknown",
    );
  }
  const status: ProwlarrOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    system,
    health,
    indexer,
    indexerStatus,
  };
}
