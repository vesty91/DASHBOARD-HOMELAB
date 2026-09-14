import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { SonarrOverview } from "@dashboard/sonarr";
import { SONARR_OVERVIEW_UNSET_INTEGRATION_ID, type SonarrOverviewView } from "@dashboard/widgets";

export interface SonarrBoardCaller {
  sonarr: {
    overview: {
      get: (input: { integrationId: string }) => Promise<SonarrOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: SonarrOverview): Extract<SonarrOverviewView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    version: overview.system.data?.version ?? null,
    seriesCount: overview.series.data?.count ?? null,
    queueTotalCount: overview.queue.data?.totalCount ?? null,
    healthErrors: overview.health.data?.error ?? null,
    healthWarnings: overview.health.data?.warning ?? null,
  };
}

export async function resolveSonarrOverviewViews(
  snapshot: BoardSnapshot,
  caller: SonarrBoardCaller,
): Promise<Record<string, SonarrOverviewView>> {
  const views: Record<string, SonarrOverviewView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "sonarr-overview" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === SONARR_OVERVIEW_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.sonarr.overview.get({ integrationId: config.integrationId }),
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
