import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveProwlarrStatusViews } from "./resolve-prowlarr-status";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "prowlarr-status",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveProwlarrStatusViews", () => {
  it("maps version, indexer counts and health counters and isolates permission errors", async () => {
    const views = await resolveProwlarrStatusViews(snapshot, {
      prowlarr: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            system: { status: "available", data: { version: "1.32.2.4987" } },
            health: {
              status: "available",
              data: { error: 1, warning: 2, notice: 0, other: 0 },
            },
            indexer: { status: "available", data: { count: 12, enabledCount: 8 } },
            indexerStatus: { status: "available", data: { count: 3 } },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "1.32.2.4987",
      indexerCount: 12,
      enabledCount: 8,
      indexerStatusCount: 3,
      healthErrors: 1,
      healthWarnings: 2,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveProwlarrStatusViews(snapshot, {
      prowlarr: {
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
