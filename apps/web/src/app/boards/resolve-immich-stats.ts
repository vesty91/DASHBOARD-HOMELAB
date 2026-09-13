import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { ImmichOverview } from "@dashboard/immich";
import { IMMICH_STATS_UNSET_INTEGRATION_ID, type ImmichStatsView } from "@dashboard/widgets";

export interface ImmichBoardCaller {
  immich: {
    overview: {
      get: (input: { integrationId: string }) => Promise<ImmichOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: ImmichOverview): Extract<ImmichStatsView, { status: "ready" }> {
  return {
    status: "ready",
    version: overview.server.data?.version ?? null,
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    healthOk: overview.health.data?.ok ?? null,
    photos: overview.stats.data?.photos ?? null,
    videos: overview.stats.data?.videos ?? null,
    diskUseBytes: overview.storage.data?.diskUseBytes ?? null,
    diskSizeBytes: overview.storage.data?.diskSizeBytes ?? null,
    diskUsagePercent: overview.storage.data?.diskUsagePercent ?? null,
  };
}

export async function resolveImmichStatsViews(
  snapshot: BoardSnapshot,
  caller: ImmichBoardCaller,
): Promise<Record<string, ImmichStatsView>> {
  const views: Record<string, ImmichStatsView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "immich-stats" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === IMMICH_STATS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.immich.overview.get({ integrationId: config.integrationId }),
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
