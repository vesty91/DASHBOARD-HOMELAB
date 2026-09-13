import { describe, expect, it } from "vitest";
import { MemoryServiceStatusCoalescer } from "./service-status-coalescer";
import {
  createServiceStatusService,
  matchesSelectedIds,
  serviceStatusQuerySchema,
} from "./service-status";
import type {
  ServiceStatusActor,
  ServiceStatusCatalogItem,
  ServiceStatusCollector,
  ServiceStatusItem,
} from "./service-status-types";

const actor: ServiceStatusActor = { userId: "user-1" };

function item(
  overrides: Partial<ServiceStatusItem> & Pick<ServiceStatusItem, "id" | "name" | "sourceType">,
): ServiceStatusItem {
  return {
    integrationId: null,
    status: "up",
    detail: null,
    updatedAt: null,
    ...overrides,
  };
}

function collector(
  sourceType: ServiceStatusCollector["sourceType"],
  options: {
    canRead?: boolean | ((actor: ServiceStatusActor) => boolean);
    items?: readonly ServiceStatusItem[];
    identities?: readonly ServiceStatusCatalogItem[];
    fail?: boolean;
    collectCalls?: { count: number };
    hold?: Promise<void>;
  } = {},
): ServiceStatusCollector {
  return {
    sourceType,
    canRead(actor) {
      if (typeof options.canRead === "function") return options.canRead(actor);
      return options.canRead !== false;
    },
    async listIdentities() {
      if (options.fail) throw new Error("identity failed");
      return (
        options.identities ??
        options.items?.map(({ id, name, sourceType: type }) => ({ id, name, sourceType: type })) ??
        []
      );
    },
    async collect() {
      if (options.hold) await options.hold;
      if (options.collectCalls) options.collectCalls.count += 1;
      if (options.fail) throw new Error("collect failed");
      return options.items ?? [];
    },
  };
}

function hasDirectPermission(actor: ServiceStatusActor, permission: string): boolean {
  if (!actor.subject || typeof actor.subject !== "object") return false;
  const direct = (actor.subject as { directPermissions?: unknown }).directPermissions;
  return Array.isArray(direct) && direct.includes(permission);
}

describe("service status aggregator", () => {
  it("returns an empty list when no collector is readable", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("synology", {
          canRead: false,
          items: [
            item({
              id: "synology:11111111-1111-4111-8111-111111111111",
              name: "NAS",
              sourceType: "synology",
            }),
          ],
        }),
      ],
      now: () => new Date("2026-09-13T00:00:00.000Z"),
    });
    await expect(service.list({}, actor)).resolves.toEqual({
      status: "available",
      items: [],
      truncated: false,
      partial: false,
      fetchedAt: "2026-09-13T00:00:00.000Z",
    });
  });

  it("maps a single up service", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("jellyfin", {
          items: [
            item({
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
              integrationId: "11111111-1111-4111-8111-111111111111",
            }),
          ],
        }),
      ],
    });
    const result = await service.list({}, actor);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe("up");
    expect(result.status).toBe("available");
  });

  it("keeps mixed statuses and a stable source/name order", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("synology", {
          items: [
            item({
              id: "synology:22222222-2222-4222-8222-222222222222",
              name: "NAS",
              sourceType: "synology",
              status: "down",
            }),
          ],
        }),
        collector("jellyfin", {
          items: [
            item({
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
              status: "up",
            }),
          ],
        }),
      ],
    });
    const result = await service.list({}, actor);
    expect(result.items.map((entry) => entry.name)).toEqual(["NAS", "Media"]);
    expect(result.items.map((entry) => entry.status)).toEqual(["down", "up"]);
  });

  it("covers degraded, unknown, paused and maintenance", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("app", {
          items: [
            item({
              id: "app:11111111-1111-4111-8111-111111111111",
              name: "A",
              sourceType: "app",
              status: "degraded",
            }),
            item({
              id: "app:22222222-2222-4222-8222-222222222222",
              name: "B",
              sourceType: "app",
              status: "unknown",
            }),
            item({
              id: "app:33333333-3333-4333-8333-333333333333",
              name: "C",
              sourceType: "app",
              status: "paused",
            }),
            item({
              id: "app:44444444-4444-4444-8444-444444444444",
              name: "D",
              sourceType: "app",
              status: "maintenance",
            }),
          ],
        }),
      ],
    });
    const result = await service.list({}, actor);
    expect(result.items.map((entry) => entry.status)).toEqual([
      "degraded",
      "unknown",
      "paused",
      "maintenance",
    ]);
  });

  it("excludes unauthorized sources even when they are selected", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("jellyfin", {
          items: [
            item({
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
            }),
          ],
        }),
        collector("synology", {
          canRead: false,
          items: [
            item({
              id: "synology:22222222-2222-4222-8222-222222222222",
              name: "Secret NAS",
              sourceType: "synology",
            }),
          ],
        }),
      ],
    });
    const result = await service.list(
      {
        selectedSources: ["jellyfin", "synology"],
        selectedIds: [
          "jellyfin:11111111-1111-4111-8111-111111111111",
          "synology:22222222-2222-4222-8222-222222222222",
        ],
      },
      actor,
    );
    expect(result.items.map((entry) => entry.name)).toEqual(["Media"]);
    expect(JSON.stringify(result)).not.toMatch(/Secret NAS|synology:2222/u);
  });

  it("keeps other services when one collector fails", async () => {
    const service = createServiceStatusService({
      collectors: [
        collector("jellyfin", {
          items: [
            item({
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
            }),
          ],
        }),
        collector("prometheus", { fail: true }),
      ],
    });
    const result = await service.list({}, actor);
    expect(result.status).toBe("degraded");
    expect(result.partial).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("Media");
  });

  it("deduplicates ids, rejects invalid ids and bounds maxItems", () => {
    expect(
      serviceStatusQuerySchema.parse({
        selectedIds: [
          "jellyfin:11111111-1111-4111-8111-111111111111",
          "jellyfin:11111111-1111-4111-8111-111111111111",
        ],
        maxItems: 2,
      }).selectedIds,
    ).toEqual(["jellyfin:11111111-1111-4111-8111-111111111111"]);
    expect(() => serviceStatusQuerySchema.parse({ selectedIds: ["not-an-id"] })).toThrow();
    expect(() => serviceStatusQuerySchema.parse({ maxItems: 0 })).toThrow();
    expect(() => serviceStatusQuerySchema.parse({ maxItems: 25 })).toThrow();
  });

  it("truncates after a stable sort and coalesces in-flight lists", async () => {
    const calls = { count: 0 };
    const coalescer = new MemoryServiceStatusCoalescer();
    const service = createServiceStatusService({
      collectors: [
        collector("app", {
          collectCalls: calls,
          items: [
            item({
              id: "app:11111111-1111-4111-8111-111111111111",
              name: "Zed",
              sourceType: "app",
            }),
            item({
              id: "app:22222222-2222-4222-8222-222222222222",
              name: "Alpha",
              sourceType: "app",
            }),
            item({
              id: "app:33333333-3333-4333-8333-333333333333",
              name: "Beta",
              sourceType: "app",
            }),
          ],
        }),
      ],
      coalescer,
    });
    const [first, second] = await Promise.all([
      service.list({ maxItems: 2 }, actor),
      service.list({ maxItems: 2 }, actor),
    ]);
    expect(calls.count).toBe(1);
    expect(first.items.map((entry) => entry.name)).toEqual(["Alpha", "Beta"]);
    expect(first.truncated).toBe(true);
    expect(second.items.map((entry) => entry.name)).toEqual(["Alpha", "Beta"]);
  });

  it("does not coalesce in-flight lists across different authorizations", async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coalescer = new MemoryServiceStatusCoalescer();
    const service = createServiceStatusService({
      collectors: [
        collector("synology", {
          hold,
          canRead: (current) => hasDirectPermission(current, "synology.read"),
          items: [
            item({
              id: "synology:11111111-1111-4111-8111-111111111111",
              name: "NAS",
              sourceType: "synology",
            }),
          ],
        }),
        collector("jellyfin", {
          hold,
          canRead: (current) => hasDirectPermission(current, "jellyfin.read"),
          items: [
            item({
              id: "jellyfin:22222222-2222-4222-8222-222222222222",
              name: "Media",
              sourceType: "jellyfin",
            }),
          ],
        }),
      ],
      coalescer,
    });
    const privileged: ServiceStatusActor = {
      userId: "user-1",
      subject: {
        status: "active",
        isSystemAdmin: false,
        directPermissions: ["synology.read", "jellyfin.read"],
      },
    };
    const reduced: ServiceStatusActor = {
      userId: "user-1",
      subject: {
        status: "active",
        isSystemAdmin: false,
        directPermissions: ["jellyfin.read"],
      },
    };
    const first = service.list({}, privileged);
    const second = service.list({}, reduced);
    release();
    const [privilegedResult, reducedResult] = await Promise.all([first, second]);
    expect(privilegedResult.items.map((entry) => entry.sourceType)).toEqual([
      "synology",
      "jellyfin",
    ]);
    expect(reducedResult.items.map((entry) => entry.sourceType)).toEqual(["jellyfin"]);
    expect(JSON.stringify(reducedResult)).not.toMatch(/NAS|synology/u);
  });

  it("never invents placeholder services", async () => {
    const service = createServiceStatusService({ collectors: [collector("app", { items: [] })] });
    const result = await service.list({}, actor);
    expect(result.items).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/example|localhost|fake/iu);
  });

  it("matches selected docker integration prefixes", () => {
    expect(
      matchesSelectedIds(
        "docker:11111111-1111-4111-8111-111111111111:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ["docker:11111111-1111-4111-8111-111111111111"],
      ),
    ).toBe(true);
    expect(
      matchesSelectedIds(
        "docker:11111111-1111-4111-8111-111111111112:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ["docker:11111111-1111-4111-8111-111111111111"],
      ),
    ).toBe(false);
  });
});
