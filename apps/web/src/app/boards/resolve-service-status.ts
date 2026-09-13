import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { ServiceStatusListResult } from "@dashboard/monitoring";
import {
  serviceStatusConfigSchema,
  type ServiceStatusConfig,
  type ServiceStatusView,
} from "@dashboard/widgets";

export interface ServiceStatusBoardCaller {
  serviceStatus: {
    list: (input: {
      selectedSources?: ServiceStatusConfig["selectedSources"];
      selectedIds?: ServiceStatusConfig["selectedIds"];
      maxItems?: number;
    }) => Promise<ServiceStatusListResult>;
  };
}

function toView(
  result: ServiceStatusListResult,
  displayMode: ServiceStatusConfig["displayMode"],
): Extract<ServiceStatusView, { status: "ready" }> {
  return {
    status: "ready",
    overviewStatus: result.status,
    displayMode,
    fetchedAt: result.fetchedAt,
    truncated: result.truncated,
    partial: result.partial,
    items: result.items.map((item) => ({
      id: item.id,
      name: item.name,
      sourceType: item.sourceType,
      integrationId: item.integrationId,
      status: item.status,
      detail: item.detail,
      updatedAt: item.updatedAt,
    })),
  };
}

export async function resolveServiceStatusViews(
  snapshot: BoardSnapshot,
  caller: ServiceStatusBoardCaller,
): Promise<Record<string, ServiceStatusView>> {
  const views: Record<string, ServiceStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "service-status" || item.runtimeStatus !== "ready") continue;
    const parsed = serviceStatusConfigSchema.safeParse(item.config);
    if (!parsed.success) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.serviceStatus.list({
          selectedSources: parsed.data.selectedSources,
          selectedIds: parsed.data.selectedIds,
          maxItems: parsed.data.maxItems,
        }),
        parsed.data.displayMode,
      );
    } catch (error) {
      if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
