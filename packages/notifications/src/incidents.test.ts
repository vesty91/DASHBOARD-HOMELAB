import { describe, expect, it, vi } from "vitest";
import {
  createIncidentService,
  createNotificationService,
  type IncidentRecord,
  type IncidentStorePort,
  type NotificationCreateInput,
  type NotificationRecord,
  type NotificationStorePort,
} from "./index";

const INTEGRATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function baseIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  const now = new Date("2026-09-16T10:00:00.000Z");
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    integrationId: INTEGRATION_ID,
    kind: "availability",
    severity: "error",
    status: "open",
    openedAt: now,
    lastChangedAt: now,
    resolvedAt: null,
    openingEventId: "status:open:1",
    closingEventId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memoryIncidentStore(): IncidentStorePort & {
  incidents: IncidentRecord[];
  events: Array<{
    id: string;
    incidentId: string;
    eventType: "opened" | "resolved" | "note";
    summary: string;
    createdAt: Date;
  }>;
} {
  const incidents: IncidentRecord[] = [];
  const events: Array<{
    id: string;
    incidentId: string;
    eventType: "opened" | "resolved" | "note";
    summary: string;
    createdAt: Date;
  }> = [];
  return {
    incidents,
    events,
    async findOpen(integrationId, kind) {
      return (
        incidents.find(
          (row) =>
            row.integrationId === integrationId && row.kind === kind && row.status === "open",
        ) ?? null
      );
    },
    async findByOpeningEventId(openingEventId) {
      return incidents.find((row) => row.openingEventId === openingEventId) ?? null;
    },
    async findByClosingEventId(closingEventId) {
      return incidents.find((row) => row.closingEventId === closingEventId) ?? null;
    },
    async get(id) {
      return incidents.find((row) => row.id === id) ?? null;
    },
    async list(input) {
      return incidents
        .filter((row) => (input.status ? row.status === input.status : true))
        .filter((row) => (input.integrationId ? row.integrationId === input.integrationId : true))
        .filter((row) => (input.kind ? row.kind === input.kind : true))
        .sort((a, b) => b.lastChangedAt.getTime() - a.lastChangedAt.getTime())
        .slice(0, input.limit);
    },
    async openAvailability(input) {
      const existing = incidents.find(
        (row) =>
          row.integrationId === input.integrationId &&
          row.kind === "availability" &&
          row.status === "open",
      );
      if (existing) return existing;
      const row = baseIncident({
        id: crypto.randomUUID(),
        integrationId: input.integrationId,
        severity: input.severity,
        status: "open",
        openedAt: input.now,
        lastChangedAt: input.now,
        openingEventId: input.openingEventId,
        createdAt: input.now,
        updatedAt: input.now,
      });
      incidents.push(row);
      events.push({
        id: crypto.randomUUID(),
        incidentId: row.id,
        eventType: "opened",
        summary: input.summary,
        createdAt: input.now,
      });
      return row;
    },
    async resolve(input) {
      const row = incidents.find((item) => item.id === input.id && item.status === "open");
      if (!row) return null;
      row.status = "resolved";
      row.resolvedAt = input.now;
      row.lastChangedAt = input.now;
      row.closingEventId = input.closingEventId;
      row.updatedAt = input.now;
      events.push({
        id: crypto.randomUUID(),
        incidentId: row.id,
        eventType: "resolved",
        summary: input.summary,
        createdAt: input.now,
      });
      return row;
    },
    async listEvents(incidentId, limit) {
      return events
        .filter((row) => row.incidentId === incidentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit);
    },
  };
}

function memoryNotificationStore(): NotificationStorePort & { rows: NotificationRecord[] } {
  const rows: NotificationRecord[] = [];
  return {
    rows,
    async create(input: NotificationCreateInput & { now: Date }) {
      const row: NotificationRecord = {
        id: crypto.randomUUID(),
        userId: input.userId,
        category: input.category,
        severity: input.severity,
        title: input.title,
        body: input.body,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceIntegrationId: input.sourceIntegrationId ?? null,
        dedupKey: input.dedupKey ?? null,
        destinationPath: input.destinationPath ?? null,
        readAt: null,
        dismissedAt: null,
        expiresAt: input.expiresAt ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      rows.push(row);
      return row;
    },
    async updateCoalesced(id, patch) {
      const idx = rows.findIndex((row) => row.id === id);
      rows[idx] = { ...rows[idx]!, ...patch };
      return rows[idx]!;
    },
    async findRecentByDedup(input) {
      return (
        rows
          .filter(
            (row) =>
              row.userId === input.userId &&
              row.dedupKey === input.dedupKey &&
              row.createdAt >= input.since,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      );
    },
    async get(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async list() {
      return rows;
    },
    async countUnread() {
      return 0;
    },
    async markRead() {
      return null;
    },
    async markAllRead() {
      return 0;
    },
    async dismiss() {
      return null;
    },
    async countForUser() {
      return rows.length;
    },
    async deleteOldestBeyondCap() {
      return 0;
    },
    async purgeExpired() {
      return 0;
    },
  };
}

function statusEvent(
  status: "unknown" | "available" | "unavailable",
  occurredAt: string,
  integrationType = "sonarr",
) {
  return {
    integrationId: INTEGRATION_ID,
    integrationType,
    status,
    occurredAt,
  };
}

describe("incident engine", () => {
  it("opens on unavailable and notifies recipients", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const notifications = createNotificationService({ store: notificationStore });
    const service = createIncidentService({
      store: incidentStore,
      notifications,
      listRecipientUserIds: async () => [USER_A, USER_B],
    });
    const result = await service.handleStatusChanged(
      statusEvent("unavailable", "2026-09-16T10:00:00.000Z"),
    );
    expect(result.action).toBe("opened");
    expect(incidentStore.incidents).toHaveLength(1);
    expect(incidentStore.events).toHaveLength(1);
    expect(incidentStore.events[0]?.eventType).toBe("opened");
    expect(notificationStore.rows).toHaveLength(2);
    expect(notificationStore.rows.every((row) => row.severity === "error")).toBe(true);
    expect(notificationStore.rows.every((row) => row.sourceType === "incident")).toBe(true);
  });

  it("ignores duplicate DOWN while an open incident exists", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: notificationStore }),
      listRecipientUserIds: async () => [USER_A],
    });
    await service.handleStatusChanged(statusEvent("unavailable", "2026-09-16T10:00:00.000Z"));
    const duplicate = await service.handleStatusChanged(
      statusEvent("unavailable", "2026-09-16T10:01:00.000Z"),
    );
    expect(duplicate.action).toBe("noop");
    expect(incidentStore.incidents).toHaveLength(1);
    expect(notificationStore.rows).toHaveLength(1);
  });

  it("resolves on available and ignores duplicate recovery", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: notificationStore }),
      listRecipientUserIds: async () => [USER_A],
    });
    await service.handleStatusChanged(statusEvent("unavailable", "2026-09-16T10:00:00.000Z"));
    const resolved = await service.handleStatusChanged(
      statusEvent("available", "2026-09-16T10:05:00.000Z"),
    );
    expect(resolved.action).toBe("resolved");
    expect(incidentStore.incidents[0]?.status).toBe("resolved");
    expect(incidentStore.events.map((row) => row.eventType)).toEqual(["opened", "resolved"]);
    const duplicate = await service.handleStatusChanged(
      statusEvent("available", "2026-09-16T10:06:00.000Z"),
    );
    expect(duplicate.action).toBe("noop");
    expect(notificationStore.rows.filter((row) => row.severity === "success")).toHaveLength(1);
  });

  it("is flap resilient across open-resolve-open cycles", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: notificationStore }),
      listRecipientUserIds: async () => [USER_A],
    });
    await service.handleStatusChanged(statusEvent("unavailable", "2026-09-16T10:00:00.000Z"));
    await service.handleStatusChanged(statusEvent("available", "2026-09-16T10:01:00.000Z"));
    const second = await service.handleStatusChanged(
      statusEvent("unavailable", "2026-09-16T10:02:00.000Z"),
    );
    expect(second.action).toBe("opened");
    expect(incidentStore.incidents).toHaveLength(2);
    expect(incidentStore.incidents.filter((row) => row.status === "open")).toHaveLength(1);
  });

  it("treats identical Redis DOWN replay as idempotent", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: notificationStore }),
      listRecipientUserIds: async () => [USER_A],
    });
    const event = statusEvent("unavailable", "2026-09-16T10:00:00.000Z");
    await service.handleStatusChanged(event);
    const replay = await service.handleStatusChanged(event);
    expect(replay.action).toBe("noop");
    expect(incidentStore.incidents).toHaveLength(1);
  });

  it("never embeds secrets or raw payloads in summaries and notifications", async () => {
    const incidentStore = memoryIncidentStore();
    const notificationStore = memoryNotificationStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: notificationStore }),
      listRecipientUserIds: async () => [USER_A],
    });
    await service.handleStatusChanged({
      ...statusEvent("unavailable", "2026-09-16T10:00:00.000Z", "sonarr"),
    });
    const serialized = JSON.stringify({
      incidents: incidentStore.incidents,
      events: incidentStore.events,
      notifications: notificationStore.rows,
    });
    expect(serialized).not.toMatch(/api[_-]?key|bearer|sk-|eyJ/iu);
    expect(incidentStore.events[0]?.summary).toBe("sonarr became unavailable.");
  });

  it("redacts integrationId when access was revoked", async () => {
    const incidentStore = memoryIncidentStore();
    const open = await incidentStore.openAvailability({
      integrationId: INTEGRATION_ID,
      severity: "error",
      openingEventId: "seed",
      summary: "sonarr became unavailable.",
      now: new Date("2026-09-16T10:00:00.000Z"),
    });
    const accessible = vi.fn(async () => false);
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: memoryNotificationStore() }),
      listRecipientUserIds: async () => [],
      integrationAccessible: accessible,
    });
    const view = await service.get(open.id, {
      userId: USER_A,
      subject: {
        status: "active",
        isSystemAdmin: true,
        directPermissions: ["incident.read"],
      },
    });
    expect(view.integrationId).toBeNull();
    expect(accessible).toHaveBeenCalled();
  });

  it("no-ops unknown status without opening", async () => {
    const incidentStore = memoryIncidentStore();
    const service = createIncidentService({
      store: incidentStore,
      notifications: createNotificationService({ store: memoryNotificationStore() }),
      listRecipientUserIds: async () => [USER_A],
    });
    const result = await service.handleStatusChanged(
      statusEvent("unknown", "2026-09-16T10:00:00.000Z"),
    );
    expect(result).toEqual({ action: "noop", incidentId: null });
    expect(incidentStore.incidents).toHaveLength(0);
  });
});
