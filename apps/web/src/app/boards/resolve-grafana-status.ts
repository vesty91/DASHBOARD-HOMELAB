import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { GrafanaOverview } from "@dashboard/grafana";
import { GRAFANA_STATUS_UNSET_INTEGRATION_ID, type GrafanaStatusView } from "@dashboard/widgets";

export interface GrafanaBoardCaller {
  grafana: {
    overview: {
      get: (input: { integrationId: string }) => Promise<GrafanaOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: GrafanaOverview): Extract<GrafanaStatusView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    version: overview.health.data?.version ?? null,
    database: overview.health.data?.database ?? null,
    dashboardCount: overview.dashboards.data?.count ?? null,
    alertsFiring: overview.alerts.data?.firing ?? null,
    alertsPending: overview.alerts.data?.pending ?? null,
  };
}

export async function resolveGrafanaStatusViews(
  snapshot: BoardSnapshot,
  caller: GrafanaBoardCaller,
): Promise<Record<string, GrafanaStatusView>> {
  const views: Record<string, GrafanaStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "grafana-status" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === GRAFANA_STATUS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.grafana.overview.get({ integrationId: config.integrationId }),
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
