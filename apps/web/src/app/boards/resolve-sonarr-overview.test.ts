import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveSonarrOverviewViews } from "./resolve-sonarr-overview";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "sonarr-overview",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveSonarrOverviewViews", () => {
  it("maps version, series, queue and health counters and isolates permission errors", async () => {
    const views = await resolveSonarrOverviewViews(snapshot, {
      sonarr: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            system: { status: "available", data: { version: "4.0.14.2939" } },
            health: {
              status: "available",
              data: { error: 1, warning: 2, notice: 0, other: 0 },
            },
            queue: { status: "available", data: { totalCount: 4 } },
            series: { status: "available", data: { count: 12, truncated: false } },
            diskSpace: { status: "available", data: { freeBytes: 10, totalBytes: 20 } },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "4.0.14.2939",
      seriesCount: 12,
      queueTotalCount: 4,
      healthErrors: 1,
      healthWarnings: 2,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveSonarrOverviewViews(snapshot, {
      sonarr: {
        overview: {
          get: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "no" });
          },
        },
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });
  });
});
