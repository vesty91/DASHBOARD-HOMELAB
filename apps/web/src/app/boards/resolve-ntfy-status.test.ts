import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveNtfyStatusViews } from "./resolve-ntfy-status";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "ntfy-status",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveNtfyStatusViews", () => {
  it("maps health, version and public counters and isolates permission errors", async () => {
    const views = await resolveNtfyStatusViews(snapshot, {
      ntfy: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            health: { status: "available", data: { healthy: true } },
            stats: { status: "available", data: { messages: 12, messagesRate: 0.5 } },
            version: {
              status: "available",
              data: { version: "2.11.0", commit: "deadbeef", date: "2026-01-01" },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      healthy: true,
      version: "2.11.0",
      messages: 12,
      messagesRate: 0.5,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveNtfyStatusViews(snapshot, {
      ntfy: {
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
