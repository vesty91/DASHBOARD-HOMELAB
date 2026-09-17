import { describe, expect, it } from "vitest";
import { ReliabilityError } from "./errors";
import { createReliabilityService } from "./service";
import type { ReliabilityStorePort } from "./ports";

function emptyStore(): ReliabilityStorePort {
  return {
    listIntegrationPresence: async () => [],
    integrationExists: async () => false,
    listIncidentsBetween: async () => [],
    listMaintenancesBetween: async () => [],
    upsertDaily: async () => undefined,
    listDaily: async () => [],
    deleteOlderThan: async () => 0,
    upsertHourly: async () => undefined,
    listHourly: async () => [],
    deleteHourlyOlderThan: async () => 0,
    listSlos: async () => [],
    getSlo: async () => null,
    createSlo: async () => {
      throw new Error("not implemented");
    },
    updateSlo: async () => {
      throw new Error("not implemented");
    },
    deleteSlo: async () => {
      throw new Error("not implemented");
    },
  };
}

describe("reliability service permissions", () => {
  it("rejects listDaily without reliability.read", async () => {
    const service = createReliabilityService({ store: emptyStore() });
    await expect(
      service.listDaily(
        {
          serviceKeys: ["svc"],
          fromDateUtc: "2030-01-01",
          toDateUtc: "2030-01-02",
          limit: 10,
        },
        {
          userId: "u1",
          subject: { status: "active", isSystemAdmin: false, directPermissions: [] },
        },
      ),
    ).rejects.toBeInstanceOf(ReliabilityError);
  });

  it("rejects createSlo without slo.manage", async () => {
    const service = createReliabilityService({ store: emptyStore() });
    await expect(
      service.createSlo(
        {
          serviceKey: "svc",
          name: "Primary",
          objectiveBasisPoints: 99_900,
          windowDays: 30,
          excludeMaintenance: true,
          enabled: true,
        },
        {
          userId: "u1",
          subject: {
            status: "active",
            isSystemAdmin: false,
            directPermissions: ["reliability.read"],
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("evaluateBurnRate returns insufficient-data with empty hourly store", async () => {
    const sloId = "11111111-1111-4111-8111-111111111111";
    const store: ReliabilityStorePort = {
      ...emptyStore(),
      getSlo: async () => ({
        id: sloId,
        serviceKey: "svc-a",
        name: "Primary",
        objectiveBasisPoints: 99_900,
        windowDays: 30,
        excludeMaintenance: true,
        enabled: true,
        configRevision: 1,
        createdAt: new Date("2030-01-01T00:00:00.000Z"),
        updatedAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    };
    const service = createReliabilityService({
      store,
      now: () => new Date("2030-01-10T15:30:00.000Z"),
    });
    const result = await service.evaluateBurnRate(
      { id: sloId },
      {
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["reliability.read"],
        },
      },
    );
    expect(result.evaluation.state).toBe("insufficient-data");
    expect(result.closedHourCount).toBe(72);
    expect(result.toHourUtc).toBe("2030-01-10T14");
  });
});
