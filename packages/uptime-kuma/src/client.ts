import { type IntegrationClientContext } from "@dashboard/integrations";
import { assembleMonitorsDto, parsePrometheusMonitors } from "./dto";
import { UPTIME_KUMA_METRICS_PATH } from "./policy";
import type { UptimeKumaConfig, UptimeKumaSecrets } from "./schemas";
import {
  UPTIME_KUMA_METRICS_MAX_BYTES,
  uptimeKumaFetch,
  type UptimeKumaRequestFn,
  type UptimeKumaTransportContext,
} from "./transport";
import type { UptimeKumaMonitorDto, UptimeKumaOverview, UptimeKumaOverviewStatus } from "./types";

export const OVERVIEW_CACHE_TTL_MS = 15_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 8_000;
export const UPTIME_KUMA_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface UptimeKumaClientContext extends UptimeKumaTransportContext {
  readonly request: UptimeKumaRequestFn;
  readonly secretValues: readonly string[];
}

export function uptimeKumaContextFromIntegration(
  ctx: IntegrationClientContext<UptimeKumaConfig, UptimeKumaSecrets> & {
    secretValues?: readonly string[];
  },
): UptimeKumaClientContext {
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

export async function fetchUptimeKumaMonitors(
  ctx: UptimeKumaClientContext,
): Promise<{ monitors: UptimeKumaMonitorDto[]; truncated: boolean }> {
  const result = await uptimeKumaFetch(ctx.request, ctx, "GET", UPTIME_KUMA_METRICS_PATH, {
    maxBodyBytes: UPTIME_KUMA_METRICS_MAX_BYTES,
  });
  return parsePrometheusMonitors(result.body, ctx.secretValues);
}

export async function testUptimeKumaConnection(
  ctx: UptimeKumaClientContext,
): Promise<{ monitorCount: number }> {
  const { monitors } = await fetchUptimeKumaMonitors(ctx);
  return { monitorCount: monitors.length };
}

export function overviewCacheTtl(overview: UptimeKumaOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

export async function fetchUptimeKumaOverview(
  ctx: UptimeKumaClientContext,
): Promise<UptimeKumaOverview> {
  const loaded = await fetchUptimeKumaMonitors(ctx);
  const data = assembleMonitorsDto(loaded.monitors, loaded.truncated);
  const unhealthy = data.downCount > 0 || data.pendingCount > 0;
  const status: UptimeKumaOverviewStatus = unhealthy || data.truncated ? "degraded" : "available";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    monitors: { status: "available", data },
  };
}
