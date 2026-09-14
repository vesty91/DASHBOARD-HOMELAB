import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteSecurityStore } from "./security-runtime";
import { createSqliteAuthStore } from "./repositories/auth";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return client;
}

describe("security runtime", () => {
  it("records sanitized audit events, paginates, and never stores secrets", async () => {
    const client = await setup();
    try {
      const store = createSqliteSecurityStore(client.sqlite);
      await store.recordAudit({
        actorUserId: null,
        action: "auth.login.failure",
        targetType: "user",
        outcome: "failure",
        metadata: { password: "hunter2", token: "secret-token", reason: "invalid" },
      });
      await store.recordAudit({
        actorUserId: null,
        action: "backup.export",
        targetType: "backup",
        outcome: "success",
      });
      const first = await store.listAudit({ limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      const filtered = await store.listAudit({ limit: 10, action: "auth.login.failure" });
      expect(filtered.items).toHaveLength(1);
      expect(JSON.stringify(filtered.items[0]?.metadata)).not.toMatch(/hunter2|secret-token/u);
      expect(filtered.items[0]?.metadata).toMatchObject({
        reason: "invalid",
        password: "[REDACTED]",
      });
    } finally {
      client.close();
    }
  });

  it("creates sessions and makes a revoked session unusable", async () => {
    const client = await setup();
    try {
      const auth = createSqliteAuthStore(client.sqlite);
      const admin = await auth.createFirstAdmin({
        username: "Admin",
        usernameCanonical: "admin",
        passwordHash: "hash",
      });
      const store = createSqliteSecurityStore(client.sqlite);
      const sessionId = randomUUID();
      await store.createSession({
        id: sessionId,
        userId: admin.id,
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: "Mozilla/5.0 Test",
        ip: null,
      });
      expect(await store.findSession(sessionId)).toMatchObject({ id: sessionId, revokedAt: null });
      await store.revokeSession(sessionId, admin.id);
      const revoked = await store.findSession(sessionId);
      expect(revoked?.revokedAt).toBeInstanceOf(Date);
      expect(await store.listSessions(admin.id)).toEqual([]);
    } finally {
      client.close();
    }
  });
});
