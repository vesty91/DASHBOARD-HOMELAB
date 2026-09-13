import {
  IntegrationError,
  type IntegrationClientContext,
  type JsonObject,
} from "@dashboard/integrations";
import { mapHealth, mapServer, mapStats, mapStorage, parseJsonObject } from "./dto";
import { ImmichError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  IMMICH_ABOUT_PATH,
  IMMICH_PING_PATH,
  IMMICH_STATISTICS_PATH,
  IMMICH_STORAGE_PATH,
  IMMICH_VERSION_PATH,
} from "./policy";
import type { ImmichConfig, ImmichSecrets } from "./schemas";
import { IMMICH_JSON_MAX_BYTES, immichFetch, type ImmichRequestFn } from "./transport";
import type { ImmichTransportContext } from "./transport";
import type {
  ImmichHealthDto,
  ImmichOverview,
  ImmichOverviewStatus,
  ImmichSection,
  ImmichSectionReason,
  ImmichServerDto,
  ImmichStatsDto,
  ImmichStorageDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 15_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 8_000;
export const IMMICH_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface ImmichClientContext extends ImmichTransportContext {
  readonly request: ImmichRequestFn;
  readonly secretValues: readonly string[];
}

export function immichContextFromIntegration(
  ctx: IntegrationClientContext<ImmichConfig, ImmichSecrets> & { secretValues?: readonly string[] },
): ImmichClientContext {
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

function sectionFromError<T>(error: unknown): ImmichSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: ImmichRequestFn,
  ctx: ImmichTransportContext,
  pathname: string,
): Promise<unknown> {
  const result = await immichFetch(request, ctx, "GET", pathname, {
    maxBodyBytes: IMMICH_JSON_MAX_BYTES,
  });
  return parseJsonObject(result.body);
}

export async function testImmichConnection(
  ctx: ImmichClientContext,
): Promise<{ version: string | null }> {
  const payload = await readJson(ctx.request, ctx, IMMICH_VERSION_PATH);
  const server = mapServer(payload, {}, ctx.secretValues);
  return { version: server.version };
}

async function loadServer(ctx: ImmichClientContext): Promise<ImmichSection<ImmichServerDto>> {
  try {
    const [version, about] = await Promise.all([
      readJson(ctx.request, ctx, IMMICH_VERSION_PATH),
      readJson(ctx.request, ctx, IMMICH_ABOUT_PATH),
    ]);
    return { status: "available", data: mapServer(version, about, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ImmichError || error instanceof IntegrationError)
      return sectionFromError(error);
    throw error;
  }
}

async function loadHealth(ctx: ImmichClientContext): Promise<ImmichSection<ImmichHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, IMMICH_PING_PATH);
    return { status: "available", data: mapHealth(payload) };
  } catch (error) {
    if (error instanceof ImmichError || error instanceof IntegrationError)
      return sectionFromError(error);
    throw error;
  }
}

async function loadStorage(ctx: ImmichClientContext): Promise<ImmichSection<ImmichStorageDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, IMMICH_STORAGE_PATH);
    return { status: "available", data: mapStorage(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ImmichError || error instanceof IntegrationError)
      return sectionFromError(error);
    throw error;
  }
}

async function loadStats(ctx: ImmichClientContext): Promise<ImmichSection<ImmichStatsDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, IMMICH_STATISTICS_PATH);
    return { status: "available", data: mapStats(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ImmichError || error instanceof IntegrationError)
      return sectionFromError(error);
    throw error;
  }
}

function throwFromSectionReason(reason: ImmichSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new ImmichError("UNAUTHORIZED", "Immich API key is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Immich request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Immich rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Immich request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Immich request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Immich request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Immich access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Immich endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Immich overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export function overviewCacheTtl(overview: ImmichOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

export async function fetchImmichOverview(ctx: ImmichClientContext): Promise<ImmichOverview> {
  const [server, health, storage, stats] = await Promise.all([
    loadServer(ctx),
    loadHealth(ctx),
    loadStorage(ctx),
    loadStats(ctx),
  ]);
  const sections = [server, health, storage, stats];
  const available = sections.filter((section) => section.status === "available").length;
  if (available === 0) {
    throwFromSectionReason(
      server.reason ?? health.reason ?? storage.reason ?? stats.reason ?? "unknown",
    );
  }
  const status: ImmichOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    server,
    health,
    storage,
    stats,
  };
}

export function timeoutFromConfig(config: JsonObject): number {
  const raw = config.timeoutMs;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return 8_000;
  return raw;
}
