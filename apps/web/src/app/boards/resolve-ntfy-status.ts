import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { NtfyOverview } from "@dashboard/ntfy";
import { NTFY_STATUS_UNSET_INTEGRATION_ID, type NtfyStatusView } from "@dashboard/widgets";

export interface NtfyBoardCaller {
  ntfy: {
    overview: {
      get: (input: { integrationId: string }) => Promise<NtfyOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: NtfyOverview): Extract<NtfyStatusView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    healthy: overview.health.data?.healthy ?? null,
    version: overview.version.data?.version ?? null,
    messages: overview.stats.data?.messages ?? null,
    messagesRate: overview.stats.data?.messagesRate ?? null,
  };
}

export async function resolveNtfyStatusViews(
  snapshot: BoardSnapshot,
  caller: NtfyBoardCaller,
): Promise<Record<string, NtfyStatusView>> {
  const views: Record<string, NtfyStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "ntfy-status" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === NTFY_STATUS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.ntfy.overview.get({ integrationId: config.integrationId }),
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
