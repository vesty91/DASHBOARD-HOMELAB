import { describe, expect, it, vi } from "vitest";
import { createEnvKeyring } from "@dashboard/secrets";
import { NotificationError } from "./errors";
import { buildSafePushPayload, hashPushEndpoint } from "./push-payload";
import { createPushService, type WebPushSender } from "./push-service";
import {
  PUSH_MAX_SUBSCRIPTIONS_PER_USER,
  type PushSubscriptionRecord,
  type PushSubscriptionStorePort,
} from "./push-types";
import type { NotificationRecord } from "./service";

const KEY = Buffer.alloc(32, 17).toString("base64");
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const VAPID = {
  publicKey: "BPpublic",
  privateKey: "private-vapid-key-never-log",
  subject: "mailto:admin@example.com",
};

function actor(userId: string, options?: { admin?: boolean; allow?: boolean }) {
  const allow = options?.allow ?? true;
  const admin = options?.admin ?? true;
  return {
    userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: admin,
      ...(allow && !admin
        ? {
            directPermissions: ["notification.read.self", "notification.manage.self"] as const,
          }
        : {}),
    },
  };
}

function createMemoryStore(): PushSubscriptionStorePort & {
  rows: Map<string, PushSubscriptionRecord>;
} {
  const rows = new Map<string, PushSubscriptionRecord>();
  return {
    rows,
    async findByUserAndEndpointHash(userId, endpointHash) {
      for (const row of rows.values()) {
        if (row.userId === userId && row.endpointHash === endpointHash) return row;
      }
      return null;
    },
    async countActiveForUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId && !row.disabledAt).length;
    },
    async listActiveForUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId && !row.disabledAt);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async insert(input) {
      const row: PushSubscriptionRecord = {
        id: input.id,
        userId: input.userId,
        endpointHash: input.endpointHash,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        keyVersion: input.keyVersion,
        userAgent: input.userAgent,
        disabledAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      rows.set(row.id, row);
      return row;
    },
    async updateEncrypted(id, patch) {
      const existing = rows.get(id);
      if (!existing) throw new NotificationError("NOT_FOUND", "missing");
      const updated = {
        ...existing,
        endpoint: patch.endpoint,
        p256dh: patch.p256dh,
        auth: patch.auth,
        keyVersion: patch.keyVersion,
        userAgent: patch.userAgent,
        disabledAt: patch.disabledAt,
        updatedAt: patch.updatedAt,
      };
      rows.set(id, updated);
      return updated;
    },
    async disable(id, at) {
      const existing = rows.get(id);
      if (!existing) return;
      rows.set(id, { ...existing, disabledAt: at, updatedAt: at });
    },
    async deleteForUser(id, userId) {
      const existing = rows.get(id);
      if (!existing || existing.userId !== userId) return false;
      rows.delete(id);
      return true;
    },
    async deleteAllForUser(userId) {
      let removed = 0;
      for (const [id, row] of rows) {
        if (row.userId !== userId) continue;
        rows.delete(id);
        removed += 1;
      }
      return removed;
    },
  };
}

function notification(userId = USER_A): NotificationRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId,
    category: "system",
    severity: "info",
    title: "Torrent finished: Secret.Movie.2024",
    body: "user@example.com download complete with API_KEY=sk-abcdef",
    sourceType: "system",
    sourceId: null,
    sourceIntegrationId: null,
    dedupKey: null,
    destinationPath: "/notifications",
    readAt: null,
    dismissedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("push payload", () => {
  it("keeps lock-screen payload conservative", () => {
    const payload = buildSafePushPayload(notification());
    expect(payload.title).toBe("Homelab Dashboard");
    expect(payload.body).toBe("You have a new notification");
    expect(payload.body).not.toContain("Secret.Movie");
    expect(payload.body).not.toContain("user@example.com");
    expect(payload.data.path).toBe("/notifications");
  });

  it("only allowlists destination paths", () => {
    const payload = buildSafePushPayload({
      ...notification(),
      destinationPath: "https://evil.example/phish",
    });
    expect(payload.data.path).toBe("/notifications");
  });
});

describe("push service", () => {
  it("subscribes, upserts duplicates, lists, and unsubscribes self-only", async () => {
    const store = createMemoryStore();
    const send = vi.fn<WebPushSender>(async () => ({ statusCode: 201 }));
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send,
    });

    const created = await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/a",
      keys: { p256dh: "BNcRdtrerQ", auth: "tBHItJI5svw" },
      userAgent: "TestAgent",
    });
    expect(created.endpointHash).toBe(hashPushEndpoint("https://push.example/a"));
    expect(JSON.stringify(created)).not.toContain("https://push.example/a");
    expect(JSON.stringify([...store.rows.values()])).not.toContain("https://push.example/a");

    const upserted = await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/a",
      keys: { p256dh: "BNcRdtrerQ2", auth: "tBHItJI5svw2" },
    });
    expect(upserted.id).toBe(created.id);
    expect(await service.list(actor(USER_A))).toMatchObject({ items: [{ id: created.id }] });

    await expect(service.unsubscribe(actor(USER_B), { id: created.id })).resolves.toEqual({
      removed: false,
    });
    await expect(service.unsubscribe(actor(USER_A), { id: created.id })).resolves.toEqual({
      removed: true,
    });
  });

  it("unsubscribes all devices for the actor only", async () => {
    const store = createMemoryStore();
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send: async () => ({ statusCode: 201 }),
    });
    await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/a1",
      keys: { p256dh: "p1", auth: "a1" },
    });
    await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/a2",
      keys: { p256dh: "p2", auth: "a2" },
    });
    await service.subscribe(actor(USER_B), {
      endpoint: "https://push.example/b1",
      keys: { p256dh: "p3", auth: "a3" },
    });
    await expect(service.unsubscribeAll(actor(USER_A))).resolves.toEqual({ removed: 2 });
    expect(await service.list(actor(USER_A))).toEqual({ items: [] });
    expect(await service.list(actor(USER_B))).toMatchObject({
      items: [{ endpointHash: hashPushEndpoint("https://push.example/b1") }],
    });
  });

  it("rejects invalid endpoints, oversized keys, and missing VAPID", async () => {
    const store = createMemoryStore();
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send: async () => ({ statusCode: 201 }),
    });
    await expect(
      service.subscribe(actor(USER_A), {
        endpoint: "http://evil.example/push",
        keys: { p256dh: "a", auth: "b" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.subscribe(actor(USER_A), {
        endpoint: "https://push.example/a",
        keys: { p256dh: "x".repeat(600), auth: "b" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const misconfigured = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: { publicKey: "only-public" },
      send: async () => ({ statusCode: 201 }),
    });
    await expect(
      misconfigured.subscribe(actor(USER_A), {
        endpoint: "https://push.example/a",
        keys: { p256dh: "a", auth: "b" },
      }),
    ).rejects.toMatchObject({ code: "MISCONFIGURED" });
    expect(misconfigured.getVapidPublicKey(actor(USER_A))).toEqual({ publicKey: null });
  });

  it("enforces the active device limit", async () => {
    const store = createMemoryStore();
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send: async () => ({ statusCode: 201 }),
    });
    for (let index = 0; index < PUSH_MAX_SUBSCRIPTIONS_PER_USER; index += 1) {
      await service.subscribe(actor(USER_A), {
        endpoint: `https://push.example/${index}`,
        keys: { p256dh: `p${index}`, auth: `a${index}` },
      });
    }
    await expect(
      service.subscribe(actor(USER_A), {
        endpoint: "https://push.example/overflow",
        keys: { p256dh: "p", auth: "a" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("disables gone subscriptions and does not retry transient failures", async () => {
    const store = createMemoryStore();
    const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const send = vi
      .fn<WebPushSender>()
      .mockResolvedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({ statusCode: 503 });
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send,
      logger: {
        warn(message, meta) {
          warnings.push(meta === undefined ? { message } : { message, meta });
        },
      },
    });
    await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/gone",
      keys: { p256dh: "p1", auth: "a1" },
    });
    await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/transient",
      keys: { p256dh: "p2", auth: "a2" },
    });

    await service.deliverForNotification(notification());
    expect(send).toHaveBeenCalledTimes(2);
    const active = await service.list(actor(USER_A));
    expect(active.items).toHaveLength(1);
    expect(active.items[0]?.endpointHash).toBe(hashPushEndpoint("https://push.example/transient"));
    expect(warnings.some((entry) => entry.message === "web_push_transient_failure")).toBe(true);
    expect(JSON.stringify(warnings)).not.toContain(VAPID.privateKey);
    expect(JSON.stringify(warnings)).not.toContain("https://push.example");
  });

  it("denies cross-user list and subscribe without permission", async () => {
    const store = createMemoryStore();
    const service = createPushService({
      store,
      keyring: createEnvKeyring(KEY),
      vapid: VAPID,
      send: async () => ({ statusCode: 201 }),
    });
    await service.subscribe(actor(USER_A), {
      endpoint: "https://push.example/a",
      keys: { p256dh: "p", auth: "a" },
    });
    const denied = {
      userId: USER_B,
      subject: {
        status: "active" as const,
        isSystemAdmin: false,
        directPermissions: [] as const,
      },
    };
    await expect(service.list(denied)).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
    expect(await service.list(actor(USER_B))).toEqual({ items: [] });
  });
});
