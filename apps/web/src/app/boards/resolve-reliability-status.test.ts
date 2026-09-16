import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveReliabilityStatusViews } from "./resolve-reliability-status";

const integrationId = "11111111-1111-4111-8111-111111111111";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "reliability-status",
      runtimeStatus: "ready",
      config: { serviceKey: integrationId, windowDays: 30, showSparkline: true },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveReliabilityStatusViews", () => {
  it("maps summarize output and isolates permission errors", async () => {
    const views = await resolveReliabilityStatusViews(snapshot, {
      reliability: {
        summarize: async () => ({
          fromDateUtc: "2026-09-01",
          toDateUtc: "2026-09-17",
          services: [
            {
              serviceKey: integrationId,
              days: [
                {
                  dateUtc: "2026-09-16",
                  observedSeconds: 86400,
                  availableSeconds: 86000,
                  degradedSeconds: 0,
                  unavailableSeconds: 400,
                  maintenanceSeconds: 0,
                  unknownSeconds: 0,
                },
              ],
              slo: { name: "Core", objectiveBasisPoints: 99900 },
              availabilityBasisPoints: 99500,
              sloMet: true,
              remainingBudgetBasisPoints: 50000,
            },
          ],
        }),
      },
      integration: {
        get: async () => ({ name: "Lab ntfy" }),
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      serviceName: "Lab ntfy",
      availabilityBasisPoints: 99500,
      sloMet: true,
      sloName: "Core",
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveReliabilityStatusViews(snapshot, {
      reliability: {
        summarize: async () => {
          throw new TRPCError({ code: "FORBIDDEN", message: "no" });
        },
      },
      integration: {
        get: async () => ({ name: "Lab ntfy" }),
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });
  });
});
