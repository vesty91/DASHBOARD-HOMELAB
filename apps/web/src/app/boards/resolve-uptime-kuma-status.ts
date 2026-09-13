import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { UptimeKumaMonitorDto, UptimeKumaOverview } from "@dashboard/uptime-kuma";
import {
  UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID,
  type UptimeKumaStatusView,
} from "@dashboard/widgets";

export interface UptimeKumaBoardCaller {
  uptimeKuma: {
    overview: {
      get: (input: { integrationId: string }) => Promise<UptimeKumaOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function usefulLatency(monitors: readonly UptimeKumaMonitorDto[]): number | null {
  const values = monitors
    .map((monitor) => monitor.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function toView(overview: UptimeKumaOverview): Extract<UptimeKumaStatusView, { status: "ready" }> {
  const monitors = overview.monitors.data;
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    monitorCount: monitors?.monitorCount ?? 0,
    upCount: monitors?.upCount ?? 0,
    downCount: monitors?.downCount ?? 0,
    pendingCount: monitors?.pendingCount ?? 0,
    maintenanceCount: monitors?.maintenanceCount ?? 0,
    truncated: monitors?.truncated ?? false,
    latencyMs: monitors ? usefulLatency(monitors.monitors) : null,
  };
}

export async function resolveUptimeKumaStatusViews(
  snapshot: BoardSnapshot,
  caller: UptimeKumaBoardCaller,
): Promise<Record<string, UptimeKumaStatusView>> {
  const views: Record<string, UptimeKumaStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "uptime-kuma-status" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.uptimeKuma.overview.get({ integrationId: config.integrationId }),
      );
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
