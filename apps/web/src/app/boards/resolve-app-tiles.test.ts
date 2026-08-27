import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveAppTileViews } from "./resolve-app-tiles";

const snapshot = {
  board: { id: "board", visibility: "private" },
  items: [
    {
      id: "clock-1",
      widgetType: "clock",
      runtimeStatus: "ready",
      config: { timezone: "UTC" },
    },
    {
      id: "tile-1",
      widgetType: "app-tile",
      runtimeStatus: "ready",
      config: { appId: "22222222-2222-4222-8222-222222222222" },
    },
  ],
  placements: [],
  layouts: [],
} as unknown as BoardSnapshot;

describe("resolveAppTileViews isolation", () => {
  it("maps an unexpected App Tile error locally without throwing", async () => {
    const views = await resolveAppTileViews(snapshot, {
      app: {
        get: vi.fn(async () => {
          throw new Error("resolver boom");
        }),
      },
    });
    expect(views["tile-1"]).toEqual({ status: "error" });
    expect(views["clock-1"]).toBeUndefined();
  });

  it("maps NOT_FOUND and FORBIDDEN without exposing raw errors", async () => {
    const missing = await resolveAppTileViews(snapshot, {
      app: {
        get: vi.fn(async () => {
          throw new TRPCError({ code: "NOT_FOUND", message: "missing" });
        }),
      },
    });
    expect(missing["tile-1"]).toEqual({ status: "empty" });
    const denied = await resolveAppTileViews(snapshot, {
      app: {
        get: vi.fn(async () => {
          throw new TRPCError({ code: "FORBIDDEN", message: "nope" });
        }),
      },
    });
    expect(denied["tile-1"]).toEqual({ status: "permission-denied" });
  });
});
