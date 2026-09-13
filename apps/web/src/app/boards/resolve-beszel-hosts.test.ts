import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveBeszelHostsViews } from "./resolve-beszel-hosts";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "beszel-hosts",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveBeszelHostsViews", () => {
  it("maps overview hosts and isolates permission errors", async () => {
    const views = await resolveBeszelHostsViews(snapshot, {
      beszel: {
        overview: {
          get: async () => ({
            status: "degraded",
            fetchedAt: "2026-09-13T00:00:00.000Z",
            hosts: {
              status: "available",
              data: {
                hosts: [
                  {
                    id: "sys1",
                    name: "nas",
                    host: "10.0.0.2",
                    status: "up",
                    updatedAt: "2026-09-13 00:00:00",
                    cpuPercent: 12,
                    memoryPercent: 40,
                    diskPercent: 55,
                    networkBytes: 1024,
                    agentVersion: "0.12.0",
                  },
                  {
                    id: "sys2",
                    name: "down-host",
                    host: null,
                    status: "down",
                    updatedAt: null,
                    cpuPercent: 90,
                    memoryPercent: 10,
                    diskPercent: 20,
                    networkBytes: null,
                    agentVersion: null,
                  },
                ],
                truncated: false,
                hostCount: 2,
                upCount: 1,
                downCount: 1,
                pausedCount: 0,
                pendingCount: 0,
              },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      hostCount: 2,
      upCount: 1,
      downCount: 1,
      cpuPercent: 90,
      memoryPercent: 40,
      diskPercent: 55,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveBeszelHostsViews(snapshot, {
      beszel: {
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
