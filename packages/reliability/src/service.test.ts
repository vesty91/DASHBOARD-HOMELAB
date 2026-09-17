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
});
