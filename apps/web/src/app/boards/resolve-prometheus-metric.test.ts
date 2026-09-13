import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolvePrometheusMetricViews } from "./resolve-prometheus-metric";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "prometheus-metric",
      runtimeStatus: "ready",
      config: {
        integrationId: "11111111-1111-4111-8111-111111111111",
        query: "up",
        mode: "instant",
        rangeSeconds: 900,
        stepSeconds: 60,
      },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

const dto = {
  resultType: "vector" as const,
  series: [
    {
      labels: { __name__: "up", job: "prometheus" },
      points: [{ tMs: 1_700_000_000_000, value: 1 }],
    },
  ],
  truncated: false,
  seriesCount: 1,
  sampleCount: 1,
  fetchedAt: "2026-09-13T00:00:00.000Z",
  status: "available" as const,
};

describe("resolvePrometheusMetricViews", () => {
  it("maps a bounded query DTO and isolates permission errors", async () => {
    const views = await resolvePrometheusMetricViews(snapshot, {
      prometheus: {
        query: {
          instant: async () => dto,
          range: async () => dto,
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      queryName: "up",
      lastValue: 1,
      seriesCount: 1,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolvePrometheusMetricViews(snapshot, {
      prometheus: {
        query: {
          instant: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "no" });
          },
          range: async () => dto,
        },
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });
  });
});
