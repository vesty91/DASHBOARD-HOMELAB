import { describe, expect, it } from "vitest";
import { ReliabilityError } from "./errors";
import { createReliabilityService } from "./service";
import type { ReliabilityStorePort } from "./ports";

function emptyStore(): ReliabilityStorePort {
  return {
    listIntegrationPresence: async () => [],
    listIncidentsBetween: async () => [],
    listMaintenancesBetween: async () => [],
    upsertDaily: async () => undefined,
    listDaily: async () => [],
    deleteOlderThan: async () => 0,
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
});
