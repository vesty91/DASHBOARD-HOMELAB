import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveProxmoxResourcesViews } from "./resolve-proxmox-resources";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "proxmox-resources",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveProxmoxResourcesViews", () => {
  it("maps cluster counts and isolates permission errors", async () => {
    const views = await resolveProxmoxResourcesViews(snapshot, {
      proxmox: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-14T00:00:00.000Z",
            version: { status: "available", data: { version: "8.2.4", release: "8.2" } },
            cluster: {
              status: "available",
              data: { name: "homelab", quorate: true, nodeCount: 1, onlineNodeCount: 1 },
            },
            nodes: {
              status: "available",
              data: {
                nodes: [
                  {
                    id: "pve1",
                    name: "pve1",
                    status: "online",
                    cpuRatio: 0.2,
                    memoryUsedBytes: 4,
                    memoryTotalBytes: 16,
                    uptimeSeconds: 9,
                  },
                ],
                truncated: false,
              },
            },
            guests: {
              status: "available",
              data: { vmCount: 2, vmRunning: 1, lxcCount: 1, lxcRunning: 0 },
            },
            storage: {
              status: "available",
              data: { storageCount: 1, usedBytes: 10, totalBytes: 100 },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      nodeCount: 1,
      onlineNodeCount: 1,
      vmRunning: 1,
      lxcCount: 1,
      cpuRatio: 0.2,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveProxmoxResourcesViews(snapshot, {
      proxmox: {
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
