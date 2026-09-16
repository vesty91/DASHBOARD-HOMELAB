import { describe, expect, it } from "vitest";
import { createNotificationService } from "@dashboard/notifications";
import { createSqliteNotificationStore } from "./notification-runtime";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteRepositories } from "./repositories/sqlite";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  const repos = createSqliteRepositories(client);
  const user = await repos.users.create({ username: "reader" });
  const other = await repos.users.create({ username: "other" });
  const store = createSqliteNotificationStore(client);
  const service = createNotificationService({ store });
  return { client, user, other, store, service };
}

describe("SQLite notification persistence", () => {
  it("persists, paginates, dedups, and isolates users at schema 9", async () => {
    const { client, user, other, service } = await setup();
    try {
      expect(
        client.sqlite.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 9 });
      const first = await service.createForUser({
        userId: user.id,
        category: "system",
        severity: "info",
        title: "Hello",
        body: "World",
        sourceType: "system",
        dedupKey: "system:hello",
      });
      const coalesced = await service.createForUser({
        userId: user.id,
        category: "system",
        severity: "warning",
        title: "Hello again",
        body: "Updated",
        sourceType: "system",
        dedupKey: "system:hello",
      });
      expect(coalesced.id).toBe(first.id);
      expect(coalesced.severity).toBe("warning");
      for (let index = 0; index < 3; index += 1) {
        await service.createForUser({
          userId: user.id,
          category: "backup",
          severity: "info",
          title: `Backup ${index}`,
          body: `Body ${index}`,
          sourceType: "backup",
        });
      }
      const actor = {
        userId: user.id,
        subject: { status: "active" as const, isSystemAdmin: true },
      };
      const page = await service.list(actor, { limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeTruthy();
      await service.createForUser({
        userId: other.id,
        category: "system",
        severity: "info",
        title: "Other",
        body: "Private",
        sourceType: "system",
      });
      const selfList = await service.list(actor, { limit: 50 });
      expect(selfList.items.some((item) => item.title === "Other")).toBe(false);
      expect(await service.countUnread(actor)).toBeGreaterThan(0);
      await service.markAllRead(actor);
      expect(await service.countUnread(actor)).toBe(0);
    } finally {
      client.close();
    }
  });
});
