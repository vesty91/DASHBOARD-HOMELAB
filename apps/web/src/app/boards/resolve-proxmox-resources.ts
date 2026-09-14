import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { ProxmoxOverview } from "@dashboard/proxmox";
import {
  PROXMOX_RESOURCES_UNSET_INTEGRATION_ID,
  type ProxmoxResourcesView,
} from "@dashboard/widgets";

export interface ProxmoxBoardCaller {
  proxmox: {
    overview: {
      get: (input: { integrationId: string }) => Promise<ProxmoxOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: ProxmoxOverview): Extract<ProxmoxResourcesView, { status: "ready" }> {
  const nodes = overview.nodes.data?.nodes ?? [];
  const cpuValues = nodes
    .map((node) => node.cpuRatio)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const memoryUsed = nodes.reduce((sum, node) => sum + (node.memoryUsedBytes ?? 0), 0);
  const memoryTotal = nodes.reduce((sum, node) => sum + (node.memoryTotalBytes ?? 0), 0);
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    nodeCount: overview.cluster.data?.nodeCount ?? nodes.length,
    onlineNodeCount:
      overview.cluster.data?.onlineNodeCount ??
      nodes.filter((node) => node.status === "online").length,
    vmRunning: overview.guests.data?.vmRunning ?? 0,
    vmCount: overview.guests.data?.vmCount ?? 0,
    lxcRunning: overview.guests.data?.lxcRunning ?? 0,
    lxcCount: overview.guests.data?.lxcCount ?? 0,
    cpuRatio:
      cpuValues.length > 0
        ? cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length
        : null,
    memoryUsedBytes: memoryUsed > 0 ? memoryUsed : null,
    memoryTotalBytes: memoryTotal > 0 ? memoryTotal : null,
    truncated: overview.nodes.data?.truncated ?? false,
  };
}

export async function resolveProxmoxResourcesViews(
  snapshot: BoardSnapshot,
  caller: ProxmoxBoardCaller,
): Promise<Record<string, ProxmoxResourcesView>> {
  const views: Record<string, ProxmoxResourcesView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "proxmox-resources" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === PROXMOX_RESOURCES_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.proxmox.overview.get({ integrationId: config.integrationId }),
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
