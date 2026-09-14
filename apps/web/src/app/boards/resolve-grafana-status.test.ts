import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveGrafanaStatusViews } from "./resolve-grafana-status";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "grafana-status",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveGrafanaStatusViews", () => {
  it("maps health, dashboard and alert counts and isolates permission errors", async () => {
    const views = await resolveGrafanaStatusViews(snapshot, {
      grafana: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            health: { status: "available", data: { version: "11.2.0", database: "ok" } },
            dashboards: { status: "available", data: { count: 12, truncated: false } },
            folders: { status: "available", data: { count: 3, truncated: false } },
            alerts: {
              status: "available",
              data: { firing: 2, pending: 1, inactive: 4, other: 0 },
            },
            datasources: {
              status: "available",
              data: { count: 1, types: [{ type: "prometheus", count: 1 }] },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      version: "11.2.0",
      database: "ok",
      dashboardCount: 12,
      alertsFiring: 2,
      alertsPending: 1,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveGrafanaStatusViews(snapshot, {
      grafana: {
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
