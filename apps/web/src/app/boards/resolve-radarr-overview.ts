import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { RadarrOverview } from "@dashboard/radarr";
import { RADARR_OVERVIEW_UNSET_INTEGRATION_ID, type RadarrOverviewView } from "@dashboard/widgets";

export interface RadarrBoardCaller {
  radarr: {
    overview: {
      get: (input: { integrationId: string }) => Promise<RadarrOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: RadarrOverview): Extract<RadarrOverviewView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    version: overview.system.data?.version ?? null,
    movieCount: overview.movie.data?.count ?? null,
    queueTotalCount: overview.queue.data?.totalCount ?? null,
    healthErrors: overview.health.data?.error ?? null,
    healthWarnings: overview.health.data?.warning ?? null,
  };
}

export async function resolveRadarrOverviewViews(
  snapshot: BoardSnapshot,
  caller: RadarrBoardCaller,
): Promise<Record<string, RadarrOverviewView>> {
  const views: Record<string, RadarrOverviewView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "radarr-overview" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === RADARR_OVERVIEW_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.radarr.overview.get({ integrationId: config.integrationId }),
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
