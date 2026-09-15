import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { ProwlarrOverview } from "@dashboard/prowlarr";
import { PROWLARR_STATUS_UNSET_INTEGRATION_ID, type ProwlarrStatusView } from "@dashboard/widgets";

export interface ProwlarrBoardCaller {
  prowlarr: {
    overview: {
      get: (input: { integrationId: string }) => Promise<ProwlarrOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: ProwlarrOverview): Extract<ProwlarrStatusView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    version: overview.system.data?.version ?? null,
    indexerCount: overview.indexer.data?.count ?? null,
    enabledCount: overview.indexer.data?.enabledCount ?? null,
    indexerStatusCount: overview.indexerStatus.data?.count ?? null,
    healthErrors: overview.health.data?.error ?? null,
    healthWarnings: overview.health.data?.warning ?? null,
  };
}

export async function resolveProwlarrStatusViews(
  snapshot: BoardSnapshot,
  caller: ProwlarrBoardCaller,
): Promise<Record<string, ProwlarrStatusView>> {
  const views: Record<string, ProwlarrStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "prowlarr-status" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === PROWLARR_STATUS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.prowlarr.overview.get({ integrationId: config.integrationId }),
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
