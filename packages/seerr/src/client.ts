import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { mapCounts, mapStatus, parseJsonValue } from "./dto";
import { SeerrError, sectionReasonFromError, toIntegrationError } from "./errors";
import { SEERR_REQUEST_COUNT_PATH, SEERR_STATUS_PATH } from "./policy";
import type { SeerrConfig, SeerrSecrets } from "./schemas";
import {
  SEERR_JSON_MAX_BYTES,
  seerrFetch,
  seerrRequestStatus,
  type SeerrRequestFn,
  type SeerrTransportContext,
} from "./transport";
import type { SeerrRequestAction } from "./request-action";
import type {
  SeerrCountsDto,
  SeerrOverview,
  SeerrOverviewStatus,
  SeerrSection,
  SeerrSectionReason,
  SeerrStatusDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const SEERR_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface SeerrClientContext extends SeerrTransportContext {
  readonly request: SeerrRequestFn;
  readonly secretValues: readonly string[];
}

export function seerrContextFromIntegration(
  ctx: IntegrationClientContext<SeerrConfig, SeerrSecrets> & {
    secretValues?: readonly string[];
  },
): SeerrClientContext {
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

function sectionFromError<T>(error: unknown): SeerrSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: SeerrRequestFn,
  ctx: SeerrTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await seerrFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testSeerrConnection(ctx: SeerrClientContext): Promise<SeerrStatusDto> {
  const payload = await readJson(ctx.request, ctx, SEERR_STATUS_PATH, {
    maxBodyBytes: SEERR_JSON_MAX_BYTES,
  });
  return mapStatus(payload, ctx.secretValues);
}

async function loadSystem(ctx: SeerrClientContext): Promise<SeerrSection<SeerrStatusDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SEERR_STATUS_PATH, {
      maxBodyBytes: SEERR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapStatus(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof SeerrError || error instanceof IntegrationError)
      return sectionFromError<SeerrStatusDto>(error);
    throw error;
  }
}

async function loadCounts(ctx: SeerrClientContext): Promise<SeerrSection<SeerrCountsDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, SEERR_REQUEST_COUNT_PATH, {
      maxBodyBytes: SEERR_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapCounts(payload) };
  } catch (error) {
    if (error instanceof SeerrError || error instanceof IntegrationError)
      return sectionFromError<SeerrCountsDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: SeerrOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: SeerrSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new SeerrError("UNAUTHORIZED", "Seerr API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Seerr request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Seerr rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Seerr request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Seerr request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Seerr request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Seerr access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Seerr endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Seerr overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchSeerrOverview(ctx: SeerrClientContext): Promise<SeerrOverview> {
  const [system, counts] = await Promise.all([loadSystem(ctx), loadCounts(ctx)]);
  if (system.status === "unavailable") {
    if (system.reason === "unauthorized" || system.reason === "permission-denied")
      throwFromSectionReason(system.reason);
  }
  const sections = [system, counts];
  const available = sections.filter((section) => section.status === "available").length;
  if (available === 0) {
    throwFromSectionReason(system.reason ?? counts.reason ?? "unknown");
  }
  const status: SeerrOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    system,
    counts,
  };
}

export async function postSeerrRequestAction(
  ctx: SeerrClientContext,
  requestId: number,
  action: SeerrRequestAction,
): Promise<void> {
  await seerrRequestStatus(ctx.request, ctx, requestId, action);
}
