import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { BeszelHostDto, BeszelOverview } from "@dashboard/beszel";
import { BESZEL_HOSTS_UNSET_INTEGRATION_ID, type BeszelHostsView } from "@dashboard/widgets";

export interface BeszelBoardCaller {
  beszel: {
    overview: {
      get: (input: { integrationId: string }) => Promise<BeszelOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function maxPercent(hosts: readonly BeszelHostDto[], key: keyof BeszelHostDto): number | null {
  const values = hosts
    .map((host) => host[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function toView(overview: BeszelOverview): Extract<BeszelHostsView, { status: "ready" }> {
  const hosts = overview.hosts.data;
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    hostCount: hosts?.hostCount ?? 0,
    upCount: hosts?.upCount ?? 0,
    downCount: hosts?.downCount ?? 0,
    pausedCount: hosts?.pausedCount ?? 0,
    pendingCount: hosts?.pendingCount ?? 0,
    truncated: hosts?.truncated ?? false,
    cpuPercent: hosts ? maxPercent(hosts.hosts, "cpuPercent") : null,
    memoryPercent: hosts ? maxPercent(hosts.hosts, "memoryPercent") : null,
    diskPercent: hosts ? maxPercent(hosts.hosts, "diskPercent") : null,
  };
}

export async function resolveBeszelHostsViews(
  snapshot: BoardSnapshot,
  caller: BeszelBoardCaller,
): Promise<Record<string, BeszelHostsView>> {
  const views: Record<string, BeszelHostsView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "beszel-hosts" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === BESZEL_HOSTS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.beszel.overview.get({ integrationId: config.integrationId }),
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
