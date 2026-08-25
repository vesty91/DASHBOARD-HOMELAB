import { describe, expect, it } from "vitest";
import { createPostgresqlClient } from "./client/postgresql";
import { migratePostgresql } from "./migrations";
import { createPostgresqlRepositories } from "./repositories/postgresql";
import { createPostgresqlAuthStore } from "./repositories/auth";

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("PostgreSQL database foundation", () => {
  it("runs real migrations, repositories, constraints and rollback", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await migratePostgresql(client.pool);
      const r = createPostgresqlRepositories(client);
      const user = await r.users.create({ username: "postgres-admin" });
      expect((await r.users.findById(user.id))?.username).toBe("postgres-admin");
      await expect(r.users.create({ username: "postgres-admin" })).rejects.toThrow();
      await expect(
        r.createBoardWithLayouts({ slug: "rollback", name: "Rollback" }, [
          { name: "One", breakpoint: "desktop", columns: 12, rowHeight: 32, sortOrder: 0 },
          { name: "Duplicate", breakpoint: "desktop", columns: 6, rowHeight: 32, sortOrder: 1 },
        ]),
      ).rejects.toThrow();
      expect(await r.boards.list()).toHaveLength(0);
      const auth = createPostgresqlAuthStore(client.pool);
      const attempts = await Promise.allSettled([
        auth.createFirstAdmin({
          username: "First",
          usernameCanonical: "first",
          passwordHash: "hash-one",
        }),
        auth.createFirstAdmin({
          username: "Second",
          usernameCanonical: "second",
          passwordHash: "hash-two",
        }),
      ]);
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
      const admin = (
        attempts.find((attempt) => attempt.status === "fulfilled") as PromiseFulfilledResult<
          Awaited<ReturnType<typeof auth.createFirstAdmin>>
        >
      ).value;
      expect((await auth.findCredential(admin.username.toLowerCase()))?.passwordHash).toMatch(
        /^hash-/,
      );
      expect(await auth.changePassword(admin.id, "updated-hash")).toBe(2);
      expect((await auth.findUser(admin.id))?.authVersion).toBe(2);
      await expect(auth.setUserStatus(admin.id, "disabled")).rejects.toMatchObject({
        code: "LAST_SYSTEM_ADMIN",
      });
      await client.pool.query(
        "insert into groups(id,name,created_at,updated_at) values($1,'PG viewers',now(),now())",
        ["00000000-0000-4000-8000-000000000099"],
      );
      await client.pool.query(
        "insert into group_members(group_id,user_id,created_at) values($1,$2,now())",
        ["00000000-0000-4000-8000-000000000099", admin.id],
      );
      await client.pool.query("insert into group_roles(group_id,role_id) values($1,$2)", [
        "00000000-0000-4000-8000-000000000099",
        "00000000-0000-4000-8000-000000000005",
      ]);
      expect((await auth.resolvePermissionSubject(admin.id))?.groupPermissions).toContain(
        "app.read",
      );
    } finally {
      await client.close();
    }
  });
});
