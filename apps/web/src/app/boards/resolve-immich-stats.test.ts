import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveImmichStatsViews } from "./resolve-immich-stats";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "immich-stats",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveImmichStatsViews", () => {
  it("maps overview stats and isolates permission errors", async () => {
    const views = await resolveImmichStatsViews(snapshot, {
      immich: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-13T00:00:00.000Z",
            server: { status: "available", data: { version: "1.142.3", licensed: false } },
            health: { status: "available", data: { ok: true } },
            storage: {
              status: "available",
              data: {
                diskSizeBytes: 1000,
                diskUseBytes: 250,
                diskAvailableBytes: 750,
                diskUsagePercent: 25,
              },
            },
            stats: { status: "available", data: { photos: 8, videos: 1, usageBytes: 99 } },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "1.142.3",
      photos: 8,
      videos: 1,
      diskUseBytes: 250,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveImmichStatsViews(snapshot, {
      immich: {
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
