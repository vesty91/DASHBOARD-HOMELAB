import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveServiceStatusViews } from "./resolve-service-status";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "service-status",
      runtimeStatus: "ready",
      config: {
        selectedSources: ["jellyfin"],
        selectedIds: [],
        displayMode: "list",
        maxItems: 12,
      },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveServiceStatusViews", () => {
  it("maps aggregator results and isolates permission errors", async () => {
    const views = await resolveServiceStatusViews(snapshot, {
      serviceStatus: {
        list: async () => ({
          status: "degraded",
          truncated: false,
          partial: true,
          fetchedAt: "2026-09-13T00:00:00.000Z",
          items: [
            {
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
              integrationId: "11111111-1111-4111-8111-111111111111",
              status: "up",
              detail: null,
              updatedAt: "2026-09-13T00:00:00.000Z",
            },
          ],
        }),
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      overviewStatus: "degraded",
      partial: true,
      items: [{ name: "Media", status: "up" }],
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveServiceStatusViews(snapshot, {
      serviceStatus: {
        list: async () => {
          throw new TRPCError({ code: "FORBIDDEN", message: "no" });
        },
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });
  });
});
