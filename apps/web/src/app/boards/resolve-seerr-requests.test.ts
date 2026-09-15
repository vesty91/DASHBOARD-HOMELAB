import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveSeerrRequestsViews } from "./resolve-seerr-requests";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "seerr-requests",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveSeerrRequestsViews", () => {
  it("maps version and request counters and isolates permission errors", async () => {
    const views = await resolveSeerrRequestsViews(snapshot, {
      seerr: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            system: {
              status: "available",
              data: { version: "2.5.0", compatibleProduct: "seerr-family" },
            },
            counts: {
              status: "available",
              data: { pending: 2, approved: 5, processing: 1, available: 8, total: 16 },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "2.5.0",
      pending: 2,
      approved: 5,
      processing: 1,
      available: 8,
    });
    expect(JSON.stringify(views["item-1"])).not.toMatch(/Dune|email|tmdb|requestedBy/u);
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveSeerrRequestsViews(snapshot, {
      seerr: {
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
