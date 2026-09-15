import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { SeerrOverview } from "@dashboard/seerr";
import { SEERR_REQUESTS_UNSET_INTEGRATION_ID, type SeerrRequestsView } from "@dashboard/widgets";

export interface SeerrBoardCaller {
  seerr: {
    overview: {
      get: (input: { integrationId: string }) => Promise<SeerrOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: SeerrOverview): Extract<SeerrRequestsView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    version: overview.system.data?.version ?? null,
    pending: overview.counts.data?.pending ?? null,
    approved: overview.counts.data?.approved ?? null,
    processing: overview.counts.data?.processing ?? null,
    available: overview.counts.data?.available ?? null,
  };
}

export async function resolveSeerrRequestsViews(
  snapshot: BoardSnapshot,
  caller: SeerrBoardCaller,
): Promise<Record<string, SeerrRequestsView>> {
  const views: Record<string, SeerrRequestsView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "seerr-requests" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === SEERR_REQUESTS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.seerr.overview.get({ integrationId: config.integrationId }),
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
