import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveRadarrOverviewViews } from "./resolve-radarr-overview";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "radarr-overview",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveRadarrOverviewViews", () => {
  it("maps version, movies, queue and health counters and isolates permission errors", async () => {
    const views = await resolveRadarrOverviewViews(snapshot, {
      radarr: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            system: { status: "available", data: { version: "5.26.2.10099" } },
            health: {
              status: "available",
              data: { error: 1, warning: 2, notice: 0, other: 0 },
            },
            queue: { status: "available", data: { totalCount: 4 } },
            movie: { status: "available", data: { count: 12, truncated: false } },
            diskSpace: { status: "available", data: { freeBytes: 10, totalBytes: 20 } },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "5.26.2.10099",
      movieCount: 12,
      queueTotalCount: 4,
      healthErrors: 1,
      healthWarnings: 2,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveRadarrOverviewViews(snapshot, {
      radarr: {
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
