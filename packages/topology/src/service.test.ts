import { describe, expect, it } from "vitest";
import { createTopologyService } from "./service";
import type { TopologyStorePort } from "./ports";
import type { ServiceDependency } from "./types";
import { TopologyError } from "./errors";

function memoryStore(existingKeys: string[]): TopologyStorePort {
  const rows: ServiceDependency[] = [];
  return {
    async integrationExists(serviceKey) {
      return existingKeys.includes(serviceKey);
    },
    async listDependencies() {
      return [...rows];
    },
    async getDependency(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async createDependency(input) {
      const row: ServiceDependency = {
        id: input.id,
        upstreamServiceKey: input.upstreamServiceKey,
        downstreamServiceKey: input.downstreamServiceKey,
        relationship: input.relationship,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      };
      rows.push(row);
      return row;
    },
    async deleteDependency(id) {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}

const admin = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: true },
};

const viewer = {
  userId: "00000000-0000-4000-8000-000000000002",
  subject: {
    status: "active" as const,
    isSystemAdmin: false,
    directPermissions: ["topology.read"] as const,
  },
};

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";

describe("createTopologyService", () => {
  it("creates a dependency when authorized", async () => {
    const service = createTopologyService({ store: memoryStore([a, b]) });
    const created = await service.createDependency(
      { upstreamServiceKey: a, downstreamServiceKey: b },
      admin,
    );
    expect(created.upstreamServiceKey).toBe(a);
    expect(created.downstreamServiceKey).toBe(b);
  });

  it("rejects unknown services", async () => {
    const service = createTopologyService({ store: memoryStore([a]) });
    await expect(
      service.createDependency({ upstreamServiceKey: a, downstreamServiceKey: b }, admin),
    ).rejects.toMatchObject({ code: "UNKNOWN_SERVICE" } satisfies Partial<TopologyError>);
  });

  it("rejects cycles", async () => {
    const store = memoryStore([a, b]);
    const service = createTopologyService({ store });
    await service.createDependency({ upstreamServiceKey: a, downstreamServiceKey: b }, admin);
    await expect(
      service.createDependency({ upstreamServiceKey: b, downstreamServiceKey: a }, admin),
    ).rejects.toMatchObject({ code: "CYCLE" });
  });

  it("rejects manage without permission", async () => {
    const service = createTopologyService({ store: memoryStore([a, b, c]) });
    await expect(
      service.createDependency({ upstreamServiceKey: a, downstreamServiceKey: b }, viewer),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
