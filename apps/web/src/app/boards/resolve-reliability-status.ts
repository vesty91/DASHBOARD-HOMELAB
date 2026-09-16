import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import {
  RELIABILITY_STATUS_UNSET_SERVICE_KEY,
  reliabilityStatusConfigSchema,
  type ReliabilityStatusView,
} from "@dashboard/widgets";

export interface ReliabilityBoardCaller {
  reliability: {
    summarize: (input: { serviceKeys: string[]; windowDays: 7 | 30 | 90 }) => Promise<{
      fromDateUtc: string;
      toDateUtc: string;
      services: Array<{
        serviceKey: string;
        days: Array<{
          dateUtc: string;
          observedSeconds: number;
          availableSeconds: number;
          degradedSeconds: number;
          unavailableSeconds: number;
          maintenanceSeconds: number;
          unknownSeconds: number;
        }>;
        slo: {
          name: string;
          objectiveBasisPoints: number;
        } | null;
        availabilityBasisPoints: number | null;
        sloMet: boolean | null;
        remainingBudgetBasisPoints: number | null;
      }>;
    }>;
  };
  integration: {
    get: (input: { id: string }) => Promise<{ name: string }>;
  };
}

function dailyAvailabilityBps(day: {
  observedSeconds: number;
  availableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
}): number | null {
  const eligible = Math.max(0, day.observedSeconds - day.maintenanceSeconds - day.unknownSeconds);
  if (eligible === 0) return null;
  return Math.floor((day.availableSeconds * 100_000) / eligible);
}

export async function resolveReliabilityStatusViews(
  snapshot: BoardSnapshot,
  caller: ReliabilityBoardCaller,
): Promise<Record<string, ReliabilityStatusView>> {
  const views: Record<string, ReliabilityStatusView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "reliability-status" || item.runtimeStatus !== "ready") continue;
    const parsed = reliabilityStatusConfigSchema.safeParse(item.config);
    if (!parsed.success || parsed.data.serviceKey === RELIABILITY_STATUS_UNSET_SERVICE_KEY) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      const summary = await caller.reliability.summarize({
        serviceKeys: [parsed.data.serviceKey],
        windowDays: parsed.data.windowDays,
      });
      const service = summary.services[0];
      if (!service) {
        views[item.id] = { status: "empty" };
        continue;
      }
      let serviceName = "Intégration";
      try {
        const integration = await caller.integration.get({ id: parsed.data.serviceKey });
        serviceName = integration.name;
      } catch {
        serviceName = "Intégration";
      }
      const sortedDays = [...service.days].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
      const sparkline = parsed.data.showSparkline
        ? sortedDays.map((day) => dailyAvailabilityBps(day) ?? 0)
        : [];
      views[item.id] = {
        status: "ready",
        serviceKey: parsed.data.serviceKey,
        serviceName,
        windowDays: parsed.data.windowDays,
        fromDateUtc: summary.fromDateUtc,
        toDateUtc: summary.toDateUtc,
        availabilityBasisPoints: service.availabilityBasisPoints,
        sloMet: service.sloMet,
        sloName: service.slo?.name ?? null,
        objectiveBasisPoints: service.slo?.objectiveBasisPoints ?? null,
        remainingBudgetBasisPoints: service.remainingBudgetBasisPoints,
        sparkline,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
