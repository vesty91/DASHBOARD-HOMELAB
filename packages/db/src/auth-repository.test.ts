import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteAuthStore } from "./repositories/auth";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return { client, store: createSqliteAuthStore(client.sqlite) };
}
describe("SQLite authentication repository", () => {
  it("creates exactly one first administrator with credentials and role", async () => {
    const { client, store } = await setup();
    try {
      const admin = await store.createFirstAdmin({
        username: "Vesty",
        usernameCanonical: "vesty",
        passwordHash: "argon-hash",
      });
      expect(admin.isSystemAdmin).toBe(true);
      expect((await store.findCredential("vesty"))?.passwordHash).toBe("argon-hash");
      await expect(
        store.createFirstAdmin({
          username: "Other",
          usernameCanonical: "other",
          passwordHash: "hash",
        }),
      ).rejects.toMatchObject({ code: "ONBOARDING_ALREADY_COMPLETED" });
      expect(await store.isOnboardingCompleted()).toBe(true);
    } finally {
      client.close();
    }
  });
  it("invalidates sessions on password change and protects the last system admin", async () => {
    const { client, store } = await setup();
    try {
      const admin = await store.createFirstAdmin({
        username: "Admin",
        usernameCanonical: "admin",
        passwordHash: "old",
      });
      expect(await store.changePassword(admin.id, "new")).toBe(2);
      expect((await store.findCredential("admin"))?.passwordHash).toBe("new");
      await expect(store.setUserStatus(admin.id, "disabled")).rejects.toMatchObject({
        code: "LAST_SYSTEM_ADMIN",
      });
      expect((await store.findUser(admin.id))?.status).toBe("active");
    } finally {
      client.close();
    }
  });
  it("resolves permissions received through a group role", async () => {
    const { client, store } = await setup();
    try {
      const admin = await store.createFirstAdmin({
        username: "Admin",
        usernameCanonical: "admin",
        passwordHash: "hash",
      });
      client.sqlite
        .prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES('g1','Viewers',1,1)")
        .run();
      client.sqlite
        .prepare("INSERT INTO group_members(group_id,user_id,created_at) VALUES('g1',?,1)")
        .run(admin.id);
      client.sqlite
        .prepare(
          "INSERT INTO group_roles(group_id,role_id) VALUES('g1','00000000-0000-4000-8000-000000000005')",
        )
        .run();
      expect((await store.resolvePermissionSubject(admin.id))?.groupPermissions).toContain(
        "app.read",
      );
    } finally {
      client.close();
    }
  });
});
