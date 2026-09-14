import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { mapAlerts, mapDatasources, mapFolders, mapHealth, mapSearch, parseJsonValue } from "./dto";
import { GrafanaError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  GRAFANA_ALERTS_PATH,
  GRAFANA_DATASOURCES_PATH,
  GRAFANA_FOLDERS_PATH,
  GRAFANA_HEALTH_PATH,
  GRAFANA_QUERY_LIMIT_MAX,
  GRAFANA_SEARCH_PATH,
  GRAFANA_SEARCH_TYPE,
} from "./policy";
import type { GrafanaConfig, GrafanaSecrets } from "./schemas";
import {
  GRAFANA_JSON_MAX_BYTES,
  GRAFANA_LIST_MAX_BYTES,
  grafanaFetch,
  type GrafanaRequestFn,
  type GrafanaTransportContext,
} from "./transport";
import type {
  GrafanaAlertsDto,
  GrafanaDashboardsDto,
  GrafanaDatasourcesDto,
  GrafanaFoldersDto,
  GrafanaHealthDto,
  GrafanaOverview,
  GrafanaOverviewStatus,
  GrafanaSection,
  GrafanaSectionReason,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const GRAFANA_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface GrafanaClientContext extends GrafanaTransportContext {
  readonly request: GrafanaRequestFn;
  readonly secretValues: readonly string[];
}

export function grafanaContextFromIntegration(
  ctx: IntegrationClientContext<GrafanaConfig, GrafanaSecrets> & {
    secretValues?: readonly string[];
  },
): GrafanaClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    serviceAccountToken: ctx.secrets.serviceAccountToken,
    request: ctx.request,
    secretValues: ctx.secretValues ?? [ctx.secrets.serviceAccountToken],
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

function sectionFromError<T>(error: unknown): GrafanaSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: GrafanaRequestFn,
  ctx: GrafanaTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number; query?: Readonly<Record<string, string>> },
): Promise<unknown> {
  const result = await grafanaFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function testGrafanaConnection(
  ctx: GrafanaClientContext,
): Promise<{ version: string | null; database: GrafanaHealthDto["database"] }> {
  const payload = await readJson(ctx.request, ctx, GRAFANA_HEALTH_PATH, {
    maxBodyBytes: GRAFANA_JSON_MAX_BYTES,
  });
  const health = mapHealth(payload, ctx.secretValues);
  return { version: health.version, database: health.database };
}

async function loadHealth(ctx: GrafanaClientContext): Promise<GrafanaSection<GrafanaHealthDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, GRAFANA_HEALTH_PATH, {
      maxBodyBytes: GRAFANA_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapHealth(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof GrafanaError || error instanceof IntegrationError)
      return sectionFromError<GrafanaHealthDto>(error);
    throw error;
  }
}

async function loadDashboards(
  ctx: GrafanaClientContext,
): Promise<GrafanaSection<GrafanaDashboardsDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, GRAFANA_SEARCH_PATH, {
      maxBodyBytes: GRAFANA_LIST_MAX_BYTES,
      query: { type: GRAFANA_SEARCH_TYPE, limit: String(GRAFANA_QUERY_LIMIT_MAX) },
    });
    return { status: "available", data: mapSearch(payload) };
  } catch (error) {
    if (error instanceof GrafanaError || error instanceof IntegrationError)
      return sectionFromError<GrafanaDashboardsDto>(error);
    throw error;
  }
}

async function loadFolders(ctx: GrafanaClientContext): Promise<GrafanaSection<GrafanaFoldersDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, GRAFANA_FOLDERS_PATH, {
      maxBodyBytes: GRAFANA_LIST_MAX_BYTES,
      query: { limit: String(GRAFANA_QUERY_LIMIT_MAX) },
    });
    return { status: "available", data: mapFolders(payload) };
  } catch (error) {
    if (error instanceof GrafanaError || error instanceof IntegrationError)
      return sectionFromError<GrafanaFoldersDto>(error);
    throw error;
  }
}

async function loadAlerts(ctx: GrafanaClientContext): Promise<GrafanaSection<GrafanaAlertsDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, GRAFANA_ALERTS_PATH, {
      maxBodyBytes: GRAFANA_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapAlerts(payload) };
  } catch (error) {
    if (error instanceof GrafanaError || error instanceof IntegrationError)
      return sectionFromError<GrafanaAlertsDto>(error);
    throw error;
  }
}

async function loadDatasources(
  ctx: GrafanaClientContext,
): Promise<GrafanaSection<GrafanaDatasourcesDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, GRAFANA_DATASOURCES_PATH, {
      maxBodyBytes: GRAFANA_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapDatasources(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof GrafanaError || error instanceof IntegrationError)
      return sectionFromError<GrafanaDatasourcesDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: GrafanaOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: GrafanaSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(
        new GrafanaError("UNAUTHORIZED", "Grafana service account token is invalid"),
      );
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Grafana request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Grafana rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Grafana request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Grafana request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Grafana request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Grafana access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Grafana endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Grafana overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchGrafanaOverview(ctx: GrafanaClientContext): Promise<GrafanaOverview> {
  const [health, dashboards, folders, alerts, datasources] = await Promise.all([
    loadHealth(ctx),
    loadDashboards(ctx),
    loadFolders(ctx),
    loadAlerts(ctx),
    loadDatasources(ctx),
  ]);
  const sections = [health, dashboards, folders, alerts, datasources];
  const available = sections.filter((section) => section.status === "available").length;
  if (available === 0) {
    throwFromSectionReason(
      health.reason ??
        dashboards.reason ??
        folders.reason ??
        alerts.reason ??
        datasources.reason ??
        "unknown",
    );
  }
  const healthFailing = health.status === "available" && health.data?.database === "failing";
  const status: GrafanaOverviewStatus =
    available === sections.length && !healthFailing ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    health,
    dashboards,
    folders,
    alerts,
    datasources,
  };
}
