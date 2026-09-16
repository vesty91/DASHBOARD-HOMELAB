import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInMemoryActionRateLimiter } from "@dashboard/auth";
import { createPublicStatusCache } from "./cache";
import { StatusPageError } from "./errors";
import { createStatusPageService } from "./service";
import type {
  IntegrationStatusLookup,
  PublicStatusPageDto,
  StatusPageActor,
  StatusPageRecord,
  StatusPageServiceRecord,
  StatusPageSnapshot,
  StatusPageStorePort,
} from "./types";
import {
  PUBLIC_STATUS_CACHE_TTL_MS,
  PUBLIC_STATUS_RATE_LIMIT,
  PUBLIC_STATUS_RATE_WINDOW_MS,
} from "./types";

function actor(permissions: readonly string[], userId = randomUUID()): StatusPageActor {
  return {
    userId,
    subject: {
      status: "active",
      isSystemAdmin: false,
      directPermissions: permissions,
    },
  };
}

function createMemoryStore(): StatusPageStorePort & {
  pages: Map<string, StatusPageRecord>;
  services: Map<string, StatusPageServiceRecord[]>;
  integrations: Map<string, IntegrationStatusLookup>;
  openIncidents: Set<string>;
  activeMaintenance: Set<string>;
} {
  const pages = new Map<string, StatusPageRecord>();
  const services = new Map<string, StatusPageServiceRecord[]>();
  const integrations = new Map<string, IntegrationStatusLookup>();
  const openIncidents = new Set<string>();
  const activeMaintenance = new Set<string>();

  function snapshot(page: StatusPageRecord): StatusPageSnapshot {
    return {
      page,
      services: [...(services.get(page.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  return {
    pages,
    services,
    integrations,
    openIncidents,
    activeMaintenance,
    async listPages() {
      return [...pages.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async findPageById(id) {
      return pages.get(id) ?? null;
    },
    async findPageBySlug(slug) {
      return [...pages.values()].find((page) => page.slug === slug) ?? null;
    },
    async findSnapshotById(id) {
      const page = pages.get(id);
      return page ? snapshot(page) : null;
    },
    async findSnapshotBySlug(slug) {
      const page = [...pages.values()].find((entry) => entry.slug === slug);
      return page ? snapshot(page) : null;
    },
    async createPage(input) {
      const id = randomUUID();
      const record: StatusPageRecord = {
        id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        visibility: input.visibility,
        enabled: input.enabled,
        createdBy: input.createdBy,
        configRevision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      };
      pages.set(id, record);
      services.set(id, []);
      return record;
    },
    async updatePage(input) {
      const current = pages.get(input.id);
      if (!current) throw new StatusPageError("NOT_FOUND", "Status page not found");
      if (current.configRevision !== input.expectedConfigRevision) {
        throw new StatusPageError("CONFLICT", "Status page revision conflict");
      }
      const updated: StatusPageRecord = {
        ...current,
        name: input.name,
        slug: input.slug,
        description: input.description,
        visibility: input.visibility,
        enabled: input.enabled,
        configRevision: current.configRevision + 1,
        updatedAt: input.now,
      };
      pages.set(input.id, updated);
      return updated;
    },
    async deletePage(id, expectedConfigRevision) {
      const current = pages.get(id);
      if (!current) throw new StatusPageError("NOT_FOUND", "Status page not found");
      if (current.configRevision !== expectedConfigRevision) {
        throw new StatusPageError("CONFLICT", "Status page revision conflict");
      }
      pages.delete(id);
      services.delete(id);
    },
    async replaceServices(input) {
      const current = pages.get(input.statusPageId);
      if (!current) throw new StatusPageError("NOT_FOUND", "Status page not found");
      if (current.configRevision !== input.expectedConfigRevision) {
        throw new StatusPageError("CONFLICT", "Status page revision conflict");
      }
      const nextServices = input.services.map((service, index) => ({
        id: randomUUID(),
        statusPageId: input.statusPageId,
        sourceIntegrationId: service.sourceIntegrationId,
        displayName: service.displayName,
        description: service.description,
        sortOrder: service.sortOrder ?? index,
        showIncidentHistory: service.showIncidentHistory,
        createdAt: input.now,
        updatedAt: input.now,
      }));
      const updated: StatusPageRecord = {
        ...current,
        configRevision: current.configRevision + 1,
        updatedAt: input.now,
      };
      pages.set(input.statusPageId, updated);
      services.set(input.statusPageId, nextServices);
      return snapshot(updated);
    },
    async listOpenAvailabilityIncidentIntegrationIds(ids) {
      return new Set(ids.filter((id) => openIncidents.has(id)));
    },
    async listActiveMaintenanceIntegrationIds(ids, _now) {
      void _now;
      return new Set(ids.filter((id) => activeMaintenance.has(id)));
    },
    async findIntegrationStatuses(ids) {
      const map = new Map<string, IntegrationStatusLookup>();
      for (const id of ids) {
        const found = integrations.get(id);
        if (found) map.set(id, found);
      }
      return map;
    },
    async listMaintenanceWindows() {
      return [];
    },
    async findMaintenanceById() {
      return null;
    },
    async listNonTerminalMaintenanceWindows() {
      return [];
    },
    async listPublicMaintenancesForIntegrations() {
      return [];
    },
    async listStatusPageIdsForIntegrations() {
      return [];
    },
    async findExistingIntegrationIds(ids) {
      return new Set(ids);
    },
    async createMaintenanceWindow() {
      throw new StatusPageError("VALIDATION_ERROR", "not implemented in memory store");
    },
    async updateMaintenanceStatus() {
      return null;
    },
  };
}

describe("status page service", () => {
  it("keeps pages private by default and requires opt-in for public reads", async () => {
    const store = createMemoryStore();
    const cache = createPublicStatusCache<PublicStatusPageDto>(PUBLIC_STATUS_CACHE_TTL_MS);
    const service = createStatusPageService({ store, publicCache: cache });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const created = await service.create(
      {
        name: "Core",
        slug: "core",
        description: null,
        visibility: "private",
        enabled: true,
      },
      manager,
    );
    expect(created.visibility).toBe("private");
    await expect(service.getPublicBySlug("core")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const published = await service.update(
      {
        id: created.id,
        expectedConfigRevision: 1,
        name: "Core",
        slug: "core",
        description: null,
        visibility: "public",
        enabled: true,
      },
      manager,
    );
    expect(published.visibility).toBe("public");
    await expect(service.getPublicBySlug("core")).resolves.toMatchObject({
      slug: "core",
      overallStatus: "unknown",
    });
  });

  it("hides disabled public pages", async () => {
    const store = createMemoryStore();
    const service = createStatusPageService({ store });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const created = await service.create(
      {
        name: "Ops",
        slug: "ops",
        description: null,
        visibility: "public",
        enabled: false,
      },
      manager,
    );
    expect(created.enabled).toBe(false);
    await expect(service.getPublicBySlug("ops")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects unauthorized manage and read", async () => {
    const store = createMemoryStore();
    const service = createStatusPageService({ store });
    await expect(
      service.create(
        {
          name: "X",
          slug: "x-page",
          description: null,
          visibility: "private",
          enabled: true,
        },
        actor([]),
      ),
    ).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
    await expect(service.list(actor([]))).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
    await expect(service.list({ userId: null, subject: null })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects slug collisions and revision conflicts", async () => {
    const store = createMemoryStore();
    const service = createStatusPageService({ store });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const first = await service.create(
      {
        name: "One",
        slug: "one",
        description: null,
        visibility: "private",
        enabled: true,
      },
      manager,
    );
    await service.create(
      {
        name: "Two",
        slug: "two",
        description: null,
        visibility: "private",
        enabled: true,
      },
      manager,
    );
    await expect(
      service.create(
        {
          name: "Dup",
          slug: "one",
          description: null,
          visibility: "private",
          enabled: true,
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.update(
        {
          id: first.id,
          expectedConfigRevision: 99,
          name: "One",
          slug: "one",
          description: null,
          visibility: "private",
          enabled: true,
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps missing sources to unknown and never leaks ids/urls in public DTO", async () => {
    const store = createMemoryStore();
    const service = createStatusPageService({ store });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, {
      id: integrationId,
      status: "available",
      baseUrl: "https://secret.internal:8443",
    });
    const missingId = randomUUID();
    const created = await service.create(
      {
        name: "Public",
        slug: "public-lab",
        description: null,
        visibility: "public",
        enabled: true,
      },
      manager,
    );
    await service.replaceServices(
      {
        statusPageId: created.id,
        expectedConfigRevision: 1,
        services: [
          {
            sourceIntegrationId: integrationId,
            displayName: "API",
            description: null,
            sortOrder: 0,
            showIncidentHistory: true,
          },
          {
            sourceIntegrationId: missingId,
            displayName: "Ghost",
            description: null,
            sortOrder: 1,
            showIncidentHistory: false,
          },
        ],
      },
      manager,
    );
    const publicDto = await service.getPublicBySlug("public-lab");
    expect(publicDto.services.map((service) => service.status)).toEqual(["operational", "unknown"]);
    const serialized = JSON.stringify(publicDto);
    expect(serialized).not.toContain(integrationId);
    expect(serialized).not.toContain("secret.internal");
    expect(serialized).not.toContain("sourceIntegrationId");
    expect(serialized).not.toContain("https://");
  });

  it("rate-limits public endpoints via shared action limiter", () => {
    const limiter = createInMemoryActionRateLimiter(
      PUBLIC_STATUS_RATE_LIMIT,
      PUBLIC_STATUS_RATE_WINDOW_MS,
    );
    const key = "statusPage.publicGet:127.0.0.1";
    for (let index = 0; index < PUBLIC_STATUS_RATE_LIMIT; index += 1) {
      expect(limiter.tryConsume(key)).toBe(true);
    }
    expect(limiter.tryConsume(key)).toBe(false);
  });
});
