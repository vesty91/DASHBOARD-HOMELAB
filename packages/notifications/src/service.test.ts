import { describe, expect, it, vi } from "vitest";
import {
  NotificationError,
  assertSafeDestinationPath,
  createNotificationService,
  sanitizeNotificationText,
  type NotificationRecord,
  type NotificationStorePort,
} from "./index";

function baseRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  const now = new Date("2026-09-16T10:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    category: "system",
    severity: "info",
    title: "Hello",
    body: "World",
    sourceType: "system",
    sourceId: null,
    sourceIntegrationId: null,
    dedupKey: null,
    destinationPath: null,
    readAt: null,
    dismissedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memoryStore(seed: NotificationRecord[] = []): NotificationStorePort {
  const rows = [...seed];
  return {
    async create(input) {
      const row = baseRecord({
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
        expiresAt: input.expiresAt ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      });
      rows.push(row);
      return row;
    },
    async updateCoalesced(id, patch) {
      const idx = rows.findIndex((row) => row.id === id);
      if (idx < 0) throw new NotificationError("NOT_FOUND", "missing");
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
    async list(input) {
      return rows
        .filter((row) => row.userId === input.userId)
        .filter((row) => input.includeDismissed || !row.dismissedAt)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit);
    },
    async countUnread(userId) {
      return rows.filter((row) => row.userId === userId && !row.readAt && !row.dismissedAt).length;
    },
    async markRead(id, userId, at) {
      const row = rows.find((item) => item.id === id && item.userId === userId);
      if (!row || row.dismissedAt) return null;
      row.readAt = at;
      row.updatedAt = at;
      return row;
    },
    async markAllRead(userId, at) {
      let count = 0;
      for (const row of rows) {
        if (row.userId !== userId || row.readAt || row.dismissedAt) continue;
        row.readAt = at;
        row.updatedAt = at;
        count += 1;
      }
      return count;
    },
    async dismiss(id, userId, at) {
      const row = rows.find((item) => item.id === id && item.userId === userId);
      if (!row || row.dismissedAt) return null;
      row.dismissedAt = at;
      row.readAt = at;
      row.updatedAt = at;
      return row;
    },
    async countForUser(userId) {
      return rows.filter((row) => row.userId === userId).length;
    },
    async deleteOldestBeyondCap() {
      return 0;
    },
    async purgeExpired(now, cutoffs) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i]!;
        const expired = row.expiresAt && row.expiresAt < now;
        const readOld = (row.readAt || row.dismissedAt) && row.updatedAt < cutoffs.readOrDismissed;
        const unreadOld = !row.readAt && !row.dismissedAt && row.createdAt < cutoffs.unread;
        if (expired || readOld || unreadOld) rows.splice(i, 1);
      }
      return before - rows.length;
    },
  };
}

const adminActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  subject: {
    status: "active" as const,
    isSystemAdmin: true,
  },
};

describe("notification content safety", () => {
  it("rejects html, secrets, oversized text, and unsafe destinations", () => {
    expect(() => sanitizeNotificationText("<b>x</b>", "title")).toThrow(NotificationError);
    expect(() => sanitizeNotificationText("api_key=supersecretvalue", "body")).toThrow(
      NotificationError,
    );
    expect(() => sanitizeNotificationText("x".repeat(201), "title")).toThrow(NotificationError);
    expect(assertSafeDestinationPath("/integrations/abc")).toBe("/integrations/abc");
    expect(() => assertSafeDestinationPath("https://evil.example")).toThrow(NotificationError);
    expect(() => assertSafeDestinationPath("/integrations/../admin")).toThrow(NotificationError);
  });
});

describe("notification service", () => {
  it("creates, lists, marks read, dismisses, and counts unread", async () => {
    const store = memoryStore();
    const service = createNotificationService({ store });
    const created = await service.createForUser({
      userId: adminActor.userId!,
      category: "system",
      severity: "info",
      title: "Hello",
      body: "World",
      sourceType: "system",
    });
    expect(created.title).toBe("Hello");
    expect(await service.countUnread(adminActor)).toBe(1);
    const listed = await service.list(adminActor, { limit: 10 });
    expect(listed.items).toHaveLength(1);
    await service.markRead(created.id, adminActor);
    expect(await service.countUnread(adminActor)).toBe(0);
    await service.dismiss(created.id, adminActor);
    const after = await service.list(adminActor, { limit: 10 });
    expect(after.items).toHaveLength(0);
  });

  it("coalesces by dedupKey within the window", async () => {
    const store = memoryStore();
    const service = createNotificationService({ store });
    const first = await service.createForUser({
      userId: adminActor.userId!,
      category: "integration",
      severity: "warning",
      title: "Down",
      body: "Service unavailable",
      sourceType: "integration",
      dedupKey: "integration:down:abc",
    });
    const second = await service.createForUser({
      userId: adminActor.userId!,
      category: "integration",
      severity: "error",
      title: "Still down",
      body: "Service still unavailable",
      sourceType: "integration",
      dedupKey: "integration:down:abc",
    });
    expect(second.id).toBe(first.id);
    expect(second.severity).toBe("error");
    expect(second.title).toBe("Still down");
  });

  it("redacts integration source when access is revoked", async () => {
    const integrationId = "33333333-3333-4333-8333-333333333333";
    const store = memoryStore([
      baseRecord({
        sourceIntegrationId: integrationId,
        sourceType: "integration",
        category: "integration",
      }),
    ]);
    const service = createNotificationService({
      store,
      integrationAccessible: async () => false,
    });
    const listed = await service.list(adminActor, { limit: 10 });
    expect(listed.items[0]?.sourceIntegrationId).toBeNull();
  });

  it("denies cross-user reads via actor permissions", async () => {
    const store = memoryStore([baseRecord({ userId: "44444444-4444-4444-8444-444444444444" })]);
    const service = createNotificationService({ store });
    await expect(
      service.list(
        {
          userId: "55555555-5555-4555-8555-555555555555",
          subject: { status: "active", isSystemAdmin: false, directPermissions: [] },
        },
        { limit: 10 },
      ),
    ).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
  });

  it("publishes realtime events for create and dismiss", async () => {
    const publish = vi.fn();
    const store = memoryStore();
    const service = createNotificationService({ store, publish });
    const created = await service.createForUser({
      userId: adminActor.userId!,
      category: "system",
      severity: "info",
      title: "Ping",
      body: "Pong",
      sourceType: "system",
    });
    await service.dismiss(created.id, adminActor);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notification.created", userId: adminActor.userId }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notification.dismissed", userId: adminActor.userId }),
    );
  });
});
