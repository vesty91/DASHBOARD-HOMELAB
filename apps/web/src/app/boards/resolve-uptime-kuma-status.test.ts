import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveUptimeKumaStatusViews } from "./resolve-uptime-kuma-status";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "uptime-kuma-status",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveUptimeKumaStatusViews", () => {
  it("maps overview monitors and isolates permission errors", async () => {
    const views = await resolveUptimeKumaStatusViews(snapshot, {
      uptimeKuma: {
        overview: {
          get: async () => ({
            status: "degraded",
            fetchedAt: "2026-09-13T00:00:00.000Z",
            monitors: {
              status: "available",
              data: {
                monitors: [
                  {
                    id: "1",
                    name: "web",
                    status: "up",
                    latencyMs: 12,
                    uptimePercent: 99,
                  },
                  {
                    id: "2",
                    name: "down",
                    status: "down",
                    latencyMs: 80,
                    uptimePercent: null,
                  },
                ],
                truncated: false,
                monitorCount: 2,
                upCount: 1,
                downCount: 1,
                pendingCount: 0,
                maintenanceCount: 0,
              },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      monitorCount: 2,
      upCount: 1,
      downCount: 1,
      latencyMs: 80,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveUptimeKumaStatusViews(snapshot, {
      uptimeKuma: {
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
