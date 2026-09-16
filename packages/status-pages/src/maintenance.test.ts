import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveMaintenanceStatus, rangesOverlap } from "./maintenance-derive";
import { createMaintenanceWindowService } from "./maintenance";
import { scheduleMaintenanceWindowSchema } from "./maintenance-schemas";
import { StatusPageError } from "./errors";
import { createStatusPageService } from "./service";
import type {
  IntegrationStatusLookup,
  MaintenanceWindowRecord,
  MaintenanceWindowSnapshot,
  MaintenanceWindowStatus,
  StatusPageActor,
  StatusPageRecord,
  StatusPageServiceRecord,
  StatusPageSnapshot,
  StatusPageStorePort,
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

function createMemoryStore(_clock: { now: Date }): StatusPageStorePort & {
  pages: Map<string, StatusPageRecord>;
  services: Map<string, StatusPageServiceRecord[]>;
  integrations: Map<string, IntegrationStatusLookup>;
  openIncidents: Set<string>;
  windows: Map<string, MaintenanceWindowSnapshot>;
  notifications: Array<{ dedupKey: string; title: string; userId: string }>;
} {
  const pages = new Map<string, StatusPageRecord>();
  const services = new Map<string, StatusPageServiceRecord[]>();
  const integrations = new Map<string, IntegrationStatusLookup>();
  const openIncidents = new Set<string>();
  const windows = new Map<string, MaintenanceWindowSnapshot>();
  const notifications: Array<{ dedupKey: string; title: string; userId: string }> = [];

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
    windows,
    notifications,
    async listPages() {
      return [...pages.values()];
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
      const updated = {
        ...current,
        ...input,
        configRevision: current.configRevision + 1,
        updatedAt: input.now,
      };
      pages.set(input.id, updated);
      return updated;
    },
    async deletePage() {
      return;
    },
    async replaceServices(input) {
      const current = pages.get(input.statusPageId);
      if (!current) throw new StatusPageError("NOT_FOUND", "Status page not found");
      const next = input.services.map((service, index) => ({
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
      pages.set(input.statusPageId, {
        ...current,
        configRevision: current.configRevision + 1,
        updatedAt: input.now,
      });
      services.set(input.statusPageId, next);
      return snapshot(pages.get(input.statusPageId)!);
    },
    async listOpenAvailabilityIncidentIntegrationIds(ids) {
      return new Set(ids.filter((id) => openIncidents.has(id)));
    },
    async listActiveMaintenanceIntegrationIds(ids, now) {
      const active = new Set<string>();
      for (const entry of windows.values()) {
        if (entry.window.status === "cancelled" || entry.window.status === "completed") continue;
        if (
          entry.window.startsAt.getTime() <= now.getTime() &&
          entry.window.endsAt.getTime() > now.getTime()
        ) {
          for (const id of entry.integrationIds) {
            if (ids.includes(id)) active.add(id);
          }
        }
      }
      return active;
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
      return [...windows.values()];
    },
    async findMaintenanceById(id) {
      return windows.get(id) ?? null;
    },
    async listNonTerminalMaintenanceWindows() {
      return [...windows.values()].filter(
        (entry) => entry.window.status === "scheduled" || entry.window.status === "active",
      );
    },
    async listPublicMaintenancesForIntegrations(ids, now) {
      return [...windows.values()].filter((entry) => {
        if (entry.window.status === "cancelled" || entry.window.status === "completed")
          return false;
        if (entry.window.endsAt.getTime() <= now.getTime()) return false;
        return entry.integrationIds.some((id) => ids.includes(id));
      });
    },
    async listStatusPageIdsForIntegrations(ids) {
      const pageIds: string[] = [];
      for (const [pageId, rows] of services) {
        if (rows.some((row) => ids.includes(row.sourceIntegrationId))) pageIds.push(pageId);
      }
      return pageIds;
    },
    async findExistingIntegrationIds(ids) {
      return new Set(ids.filter((id) => integrations.has(id)));
    },
    async createMaintenanceWindow(input) {
      const id = randomUUID();
      const window: MaintenanceWindowRecord = {
        id,
        name: input.name,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      };
      const snapshot: MaintenanceWindowSnapshot = {
        window,
        integrationIds: [...input.integrationIds],
      };
      windows.set(id, snapshot);
      return snapshot;
    },
    async updateMaintenanceStatus(input) {
      const current = windows.get(input.id);
      if (!current) return null;
      if (!input.fromStatuses.includes(current.window.status)) return null;
      const updated: MaintenanceWindowSnapshot = {
        window: {
          ...current.window,
          status: input.toStatus,
          updatedAt: input.now,
        },
        integrationIds: current.integrationIds,
      };
      windows.set(input.id, updated);
      return updated;
    },
  };
}

describe("maintenance derive", () => {
  it("derives active from UTC clock and keeps terminal states sticky", () => {
    const startsAt = new Date("2026-09-16T10:00:00.000Z");
    const endsAt = new Date("2026-09-16T12:00:00.000Z");
    expect(
      deriveMaintenanceStatus("scheduled", startsAt, endsAt, new Date("2026-09-16T09:00:00.000Z")),
    ).toBe("scheduled");
    expect(
      deriveMaintenanceStatus("scheduled", startsAt, endsAt, new Date("2026-09-16T11:00:00.000Z")),
    ).toBe("active");
    expect(
      deriveMaintenanceStatus("active", startsAt, endsAt, new Date("2026-09-16T13:00:00.000Z")),
    ).toBe("completed");
    expect(
      deriveMaintenanceStatus("cancelled", startsAt, endsAt, new Date("2026-09-16T11:00:00.000Z")),
    ).toBe("cancelled");
  });

  it("detects overlapping ranges", () => {
    expect(
      rangesOverlap(
        new Date("2026-09-16T10:00:00.000Z"),
        new Date("2026-09-16T12:00:00.000Z"),
        new Date("2026-09-16T11:00:00.000Z"),
        new Date("2026-09-16T13:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        new Date("2026-09-16T10:00:00.000Z"),
        new Date("2026-09-16T11:00:00.000Z"),
        new Date("2026-09-16T11:00:00.000Z"),
        new Date("2026-09-16T12:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("maintenance windows", () => {
  it("schedules, validates, cancels, and rejects overlaps", async () => {
    const clock = { now: new Date("2026-09-16T08:00:00.000Z") };
    const store = createMemoryStore(clock);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, { id: integrationId, status: "available" });
    const notifications: Array<{ dedupKey: string }> = [];
    const service = createMaintenanceWindowService({
      store,
      now: () => clock.now,
      notifications: {
        async createForUser(input) {
          notifications.push({ dedupKey: input.dedupKey! });
          return {};
        },
      },
      listRecipientUserIds: async () => ["user-1"],
    });
    const manager = actor(["status-page.manage", "status-page.read"]);

    const startsAt = new Date("2026-09-16T10:00:00.000Z");
    const endsAt = new Date("2026-09-16T12:00:00.000Z");
    const created = await service.schedule(
      {
        name: "DB upgrade",
        description: null,
        startsAt,
        endsAt,
        integrationIds: [integrationId],
      },
      manager,
    );
    expect(created.status).toBe("scheduled");
    expect(notifications.map((entry) => entry.dedupKey)).toContain(
      `maintenance:${created.id}:scheduled`,
    );

    await expect(
      service.schedule(
        {
          name: "Overlap",
          description: null,
          startsAt: new Date("2026-09-16T11:00:00.000Z"),
          endsAt: new Date("2026-09-16T13:00:00.000Z"),
          integrationIds: [integrationId],
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const cancelled = await service.cancel(created.id, manager);
    expect(cancelled.status).toBe("cancelled");
  });

  it("rejects invalid duration and unauthorized actors", async () => {
    const clock = { now: new Date("2026-09-16T08:00:00.000Z") };
    const store = createMemoryStore(clock);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, { id: integrationId, status: "available" });
    const service = createMaintenanceWindowService({ store, now: () => clock.now });
    await expect(
      service.schedule(
        {
          name: "Too short",
          description: null,
          startsAt: new Date("2026-09-16T10:00:00.000Z"),
          endsAt: new Date("2026-09-16T10:00:30.000Z"),
          integrationIds: [integrationId],
        },
        actor(["status-page.manage"]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.list(actor([]))).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
    expect(
      scheduleMaintenanceWindowSchema.safeParse({
        name: "x",
        startsAt: "2026-09-16T10:00:00.000Z",
        endsAt: "2026-09-16T09:00:00.000Z",
        integrationIds: [integrationId],
      }).success,
    ).toBe(false);
  });

  it("transitions via worker tick with idempotent notifications", async () => {
    const clock = { now: new Date("2026-09-16T08:00:00.000Z") };
    const store = createMemoryStore(clock);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, { id: integrationId, status: "available" });
    const notifications: Array<{ dedupKey: string }> = [];
    const service = createMaintenanceWindowService({
      store,
      now: () => clock.now,
      notifications: {
        async createForUser(input) {
          notifications.push({ dedupKey: input.dedupKey! });
          return {};
        },
      },
      listRecipientUserIds: async () => ["user-1"],
    });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const created = await service.schedule(
      {
        name: "Rolling restart",
        description: null,
        startsAt: new Date("2026-09-16T10:00:00.000Z"),
        endsAt: new Date("2026-09-16T11:00:00.000Z"),
        integrationIds: [integrationId],
      },
      manager,
    );

    clock.now = new Date("2026-09-16T10:05:00.000Z");
    expect(await service.tick()).toEqual({ transitioned: 1 });
    expect(await service.tick()).toEqual({ transitioned: 0 });
    expect(notifications.filter((entry) => entry.dedupKey.endsWith(":starting")).length).toBe(1);

    clock.now = new Date("2026-09-16T11:05:00.000Z");
    expect(await service.tick()).toEqual({ transitioned: 1 });
    expect(await service.tick()).toEqual({ transitioned: 0 });
    expect(notifications.filter((entry) => entry.dedupKey.endsWith(":completed")).length).toBe(1);

    const listed = await service.get(created.id, manager);
    expect(listed.status).toBe("completed");
  });

  it("projects maintenance on public DTO without deleting incidents", async () => {
    const clock = { now: new Date("2026-09-16T10:30:00.000Z") };
    const store = createMemoryStore(clock);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, { id: integrationId, status: "available" });
    store.openIncidents.add(integrationId);
    const pageService = createStatusPageService({ store, now: () => clock.now });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const page = await pageService.create(
      {
        name: "Public",
        slug: "public-lab",
        description: null,
        visibility: "public",
        enabled: true,
      },
      manager,
    );
    await pageService.replaceServices(
      {
        statusPageId: page.id,
        expectedConfigRevision: 1,
        services: [
          {
            sourceIntegrationId: integrationId,
            displayName: "API",
            description: null,
            sortOrder: 0,
            showIncidentHistory: true,
          },
        ],
      },
      manager,
    );
    await store.createMaintenanceWindow({
      name: "Planned",
      description: null,
      startsAt: new Date("2026-09-16T10:00:00.000Z"),
      endsAt: new Date("2026-09-16T12:00:00.000Z"),
      status: "active" as MaintenanceWindowStatus,
      integrationIds: [integrationId],
      createdBy: manager.userId,
      now: clock.now,
    });

    const publicDto = await pageService.getPublicBySlug("public-lab");
    expect(publicDto.services[0]?.status).toBe("outage");
    expect(store.openIncidents.has(integrationId)).toBe(true);
    expect(publicDto.maintenances).toHaveLength(1);
    expect(publicDto.maintenances[0]?.status).toBe("active");
    expect(JSON.stringify(publicDto)).not.toContain(integrationId);
  });

  it("prefers maintenance display when healthy under active maintenance", async () => {
    const clock = { now: new Date("2026-09-16T10:30:00.000Z") };
    const store = createMemoryStore(clock);
    const integrationId = randomUUID();
    store.integrations.set(integrationId, { id: integrationId, status: "available" });
    const pageService = createStatusPageService({ store, now: () => clock.now });
    const manager = actor(["status-page.manage", "status-page.read"]);
    const page = await pageService.create(
      {
        name: "Lab",
        slug: "lab",
        description: null,
        visibility: "public",
        enabled: true,
      },
      manager,
    );
    await pageService.replaceServices(
      {
        statusPageId: page.id,
        expectedConfigRevision: 1,
        services: [
          {
            sourceIntegrationId: integrationId,
            displayName: "API",
            description: null,
            sortOrder: 0,
            showIncidentHistory: true,
          },
        ],
      },
      manager,
    );
    await store.createMaintenanceWindow({
      name: "Planned",
      description: null,
      startsAt: new Date("2026-09-16T10:00:00.000Z"),
      endsAt: new Date("2026-09-16T12:00:00.000Z"),
      status: "scheduled",
      integrationIds: [integrationId],
      createdBy: null,
      now: clock.now,
    });
    const publicDto = await pageService.getPublicBySlug("lab");
    expect(publicDto.services[0]?.status).toBe("maintenance");
    expect(publicDto.overallStatus).toBe("maintenance");
  });
});
