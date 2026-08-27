import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createPostgresqlClient } from "./client/postgresql";
import { executePostgresqlMigration, migratePostgresql } from "./migrations";
import { createPostgresqlRepositories } from "./repositories/postgresql";
import { createPostgresqlAuthStore } from "./repositories/auth";
import { createPostgresqlBoardStore } from "./board-runtime";
import { createPostgresqlAppStore } from "./app-runtime";

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("PostgreSQL database foundation", () => {
  it("rejects canonical username collisions and rolls back the Phase 3 migration", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await client.pool.query(
        await readFile(
          new URL("../drizzle/postgresql/0000_kind_pride.sql", import.meta.url),
          "utf8",
        ),
      );
      await client.pool.query(
        "insert into users(id,username,status,is_system_admin,created_at,updated_at) values($1,'Alice','active',false,now(),now()),($2,'alice','active',false,now(),now())",
        ["00000000-0000-4000-8000-000000000091", "00000000-0000-4000-8000-000000000092"],
      );
      const migration = await readFile(
        new URL("../drizzle/postgresql/0001_slim_kabuki.sql", import.meta.url),
        "utf8",
      );
      await expect(executePostgresqlMigration(client.pool, migration)).rejects.toThrow(
        "USERNAME_CANONICAL_COLLISION",
      );
      expect(await client.pool.query("select id,username from users order by id")).toMatchObject({
        rows: [
          { id: "00000000-0000-4000-8000-000000000091", username: "Alice" },
          { id: "00000000-0000-4000-8000-000000000092", username: "alice" },
        ],
      });
      expect(
        await client.pool.query(
          "select count(*)::int count from information_schema.columns where table_schema='public' and table_name='users' and column_name='username_canonical'",
        ),
      ).toMatchObject({ rows: [{ count: 0 }] });
    } finally {
      await client.close();
    }
  });

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
      const boardStore = createPostgresqlBoardStore(client.pool);
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
      const persistedBoard = await boardStore.createBoardWithLayouts({
        slug: "pg-board",
        name: "PG Board",
        description: null,
        visibility: "private",
        ownerUserId: admin.id,
        layouts: [
          { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 72, sortOrder: 0 },
          { name: "Mobile", breakpoint: "mobile", columns: 4, rowHeight: 72, sortOrder: 1 },
        ],
      });
      expect(persistedBoard.layouts).toHaveLength(2);
      await expect(
        boardStore.updateBoard({
          boardId: persistedBoard.board.id,
          expectedRevision: 1,
          name: "Updated",
          description: null,
        }),
      ).resolves.toBe(2);
      await expect(
        boardStore.updateBoard({
          boardId: persistedBoard.board.id,
          expectedRevision: 1,
          name: "Stale",
          description: null,
        }),
      ).rejects.toMatchObject({ code: "BOARD_REVISION_CONFLICT" });
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
      const group = await auth.createGroupWithRoleAndOptionalMember({
        name: "PG operators",
        roleName: "VIEWER",
        userId: admin.id,
      });
      expect(
        await client.pool.query("select count(*)::int count from group_roles where group_id=$1", [
          group.id,
        ]),
      ).toMatchObject({ rows: [{ count: 1 }] });
      expect(
        await client.pool.query(
          "select count(*)::int count from group_members where group_id=$1 and user_id=$2",
          [group.id, admin.id],
        ),
      ).toMatchObject({ rows: [{ count: 1 }] });
      const groupsBeforeRollback = (await auth.listGroups()).length;
      await expect(
        auth.createGroupWithRoleAndOptionalMember({ name: "Missing role", roleName: "MISSING" }),
      ).rejects.toMatchObject({ code: "ROLE_NOT_FOUND" });
      await expect(
        auth.createGroupWithRoleAndOptionalMember({
          name: "Missing member",
          roleName: "VIEWER",
          userId: "00000000-0000-4000-8000-000000000098",
        }),
      ).rejects.toThrow();
      expect(await auth.listGroups()).toHaveLength(groupsBeforeRollback);
      const appStore = createPostgresqlAppStore(client.pool);
      const app = await appStore.create({
        name: "PG App",
        description: "preserved",
        url: "http://192.168.1.5/",
        iconRef: null,
        color: "#123456",
        target: "new-tab",
        tags: ["NAS"],
        healthcheckEnabled: true,
        healthcheckConfig: {
          path: "/health",
          method: "GET",
          timeoutMs: 5000,
          expectedStatusMin: 200,
          expectedStatusMax: 399,
        },
      });
      expect(app.tags).toEqual(["NAS"]);
      expect(
        await appStore.persistHealthResult(app.id, 1, {
          status: "up",
          latencyMs: 8,
          httpStatus: 204,
          errorCode: null,
        }),
      ).toBe(true);
      expect(
        await appStore.persistHealthResult(app.id, 2, {
          status: "down",
          latencyMs: 8,
          httpStatus: 500,
          errorCode: "HTTP_STATUS",
        }),
      ).toBe(false);
      expect(
        await appStore.update({ id: app.id, tags: ["Storage"], url: "http://192.168.1.6/" }),
      ).toMatchObject({
        healthStatus: "unknown",
        healthConfigRevision: 2,
        tags: ["Storage"],
        integrationId: null,
      });
      await Promise.all([
        appStore.update({ id: app.id, url: "http://192.168.1.7/" }),
        appStore.update({ id: app.id, url: "http://192.168.1.8/" }),
      ]);
      expect((await appStore.findById(app.id))?.healthConfigRevision).toBe(4);
      expect(await appStore.delete(app.id)).toBe(true);
      expect((await client.pool.query("select count(*)::int count from app_tags")).rows[0]).toEqual(
        { count: 0 },
      );
    } finally {
      await client.close();
    }
  });
});
