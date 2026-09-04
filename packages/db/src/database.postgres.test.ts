import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createPostgresqlClient } from "./client/postgresql";
import { executePostgresqlMigration, migratePostgresql } from "./migrations";
import { createPostgresqlRepositories } from "./repositories/postgresql";
import { createPostgresqlAuthStore } from "./repositories/auth";
import { createPostgresqlBoardStore } from "./board-runtime";
import { createPostgresqlAppStore } from "./app-runtime";
import { createPostgresqlIntegrationStore } from "./integration-runtime";

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

  it("creates, updates and deletes board items with PostgreSQL revision CAS", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await migratePostgresql(client.pool);
      const auth = createPostgresqlAuthStore(client.pool);
      const admin = await auth.createFirstAdmin({
        username: "WidgetAdmin",
        usernameCanonical: "widgetadmin",
        passwordHash: "hash",
      });
      const boardStore = createPostgresqlBoardStore(client.pool);
      const board = await boardStore.createBoardWithLayouts({
        slug: "pg-widgets",
        name: "PG Widgets",
        description: null,
        visibility: "private",
        ownerUserId: admin.id,
        layouts: [
          { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 72, sortOrder: 0 },
          { name: "Mobile", breakpoint: "mobile", columns: 4, rowHeight: 72, sortOrder: 1 },
        ],
      });
      const desktop = board.layouts[0]!;
      const mobile = board.layouts[1]!;
      const itemA = randomUUID();
      const placementFor = (layoutId: string) => ({
        layoutId,
        x: 0,
        y: 0,
        w: 4,
        h: 2,
        minW: 2,
        minH: 1,
        maxW: 8,
        maxH: 4,
      });
      const createBody = (id: string) => ({
        boardId: board.board.id,
        expectedRevision: 1,
        item: {
          id,
          widgetType: "clock",
          widgetVersion: 1,
          title: null,
          configJson: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
          integrationId: null,
        },
        placements: [placementFor(desktop.id), placementFor(mobile.id)],
      });
      const itemB = randomUUID();
      const concurrent = await Promise.allSettled([
        boardStore.createItem(createBody(itemA)),
        boardStore.createItem(createBody(itemB)),
      ]);
      expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
      const rejected = concurrent.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: "BOARD_REVISION_CONFLICT" });
      const afterCreate = await boardStore.findSnapshotById(board.board.id);
      expect(afterCreate?.items).toHaveLength(1);
      expect(afterCreate?.placements).toHaveLength(2);
      expect(afterCreate?.board.revision).toBe(2);
      const surviving = afterCreate!.items[0]!;
      const updates = await Promise.allSettled([
        boardStore.updateItem({
          boardId: board.board.id,
          itemId: surviving.id,
          expectedRevision: 2,
          title: "One",
          configJson: {
            timezone: "Europe/Paris",
            showDate: false,
            showSeconds: true,
            hour12: false,
          },
          widgetVersion: 1,
        }),
        boardStore.updateItem({
          boardId: board.board.id,
          itemId: surviving.id,
          expectedRevision: 2,
          title: "Two",
          configJson: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
          widgetVersion: 1,
        }),
      ]);
      expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(updates.filter((result) => result.status === "rejected")).toHaveLength(1);
      await expect(
        boardStore.deleteItem({
          boardId: board.board.id,
          itemId: surviving.id,
          expectedRevision: 3,
        }),
      ).resolves.toBe(4);
      expect((await boardStore.findSnapshotById(board.board.id))?.items).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("migrates integration config_revision and enforces encrypted secret CAS", async () => {
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
        await readFile(
          new URL("../drizzle/postgresql/0001_slim_kabuki.sql", import.meta.url),
          "utf8",
        ),
      );
      await client.pool.query(
        await readFile(
          new URL("../drizzle/postgresql/0002_brief_captain_america.sql", import.meta.url),
          "utf8",
        ),
      );
      await client.pool.query(
        await readFile(
          new URL("../drizzle/postgresql/0003_known_doctor_spectrum.sql", import.meta.url),
          "utf8",
        ),
      );
      const integrationId = "00000000-0000-4000-8000-000000000077";
      await client.pool.query(
        "insert into integrations(id,type,name,base_url,enabled,config_json,status,created_at,updated_at) values($1,'legacy','NAS','https://192.168.1.5:5001',true,'{\"verifyTls\":true}'::jsonb,'available',now(),now())",
        [integrationId],
      );
      await client.pool.query(
        "insert into integration_secrets(id,integration_id,key,ciphertext,iv,auth_tag,key_version,created_at,updated_at) values($1,$2,'apiKey','Y2lwaGVy','aXY=','dGFn',1,now(),now())",
        ["00000000-0000-4000-8000-000000000078", integrationId],
      );
      await executePostgresqlMigration(
        client.pool,
        await readFile(
          new URL("../drizzle/postgresql/0004_classy_rocket_raccoon.sql", import.meta.url),
          "utf8",
        ),
      );
      expect(
        await client.pool.query(
          "select name,status,config_revision,config_json from integrations where id=$1",
          [integrationId],
        ),
      ).toMatchObject({
        rows: [
          {
            name: "NAS",
            status: "available",
            config_revision: 1,
            config_json: { verifyTls: true },
          },
        ],
      });
      const store = createPostgresqlIntegrationStore(client.pool);
      const created = await store.create({
        type: "test-http",
        name: "Probe",
        baseUrl: "http://10.0.0.10:3000",
        enabled: true,
        config: { verifyTls: true },
        createdBy: null,
      });
      await store.upsertSecret(created.id, {
        key: "apiKey",
        ciphertext: "Y2lwaGVy",
        iv: "aXY=",
        authTag: "dGFn",
        keyVersion: 1,
      });
      expect((await store.findById(created.id))?.configRevision).toBe(2);
      expect(
        await store.upsertSecretIfRevision(created.id, 2, {
          key: "deviceId",
          ciphertext: "ZGlk",
          iv: "aXY=",
          authTag: "dGFn",
          keyVersion: 1,
        }),
      ).toBe(true);
      expect((await store.findById(created.id))?.configRevision).toBe(3);
      expect(
        (await store.loadEncryptedSecrets(created.id)).some(
          (row) => row.key === "deviceId" && row.ciphertext === "ZGlk",
        ),
      ).toBe(true);
      expect(
        await store.upsertSecretIfRevision(created.id, 2, {
          key: "deviceId",
          ciphertext: "c3RhbGU=",
          iv: "aXY=",
          authTag: "dGFn",
          keyVersion: 1,
        }),
      ).toBe(false);
      expect((await store.findById(created.id))?.configRevision).toBe(3);
      expect(
        (await store.loadEncryptedSecrets(created.id)).find((row) => row.key === "deviceId")
          ?.ciphertext,
      ).toBe("ZGlk");
      expect(await store.persistConnectionResult(created.id, 3, "available")).toBe(true);
      expect(await store.persistConnectionResult(created.id, 1, "unavailable")).toBe(false);
      expect((await store.findById(created.id))?.status).toBe("available");
      await Promise.all([
        store.update({ id: created.id, enabled: false, bumpRevision: true, resetStatus: true }),
        store.update({
          id: created.id,
          baseUrl: "http://10.0.0.11:3000",
          bumpRevision: true,
          resetStatus: true,
        }),
      ]);
      expect(await store.findById(created.id)).toMatchObject({
        enabled: false,
        baseUrl: "http://10.0.0.11:3000",
        configRevision: 5,
      });
      await expect(
        client.pool.query("update integrations set config_revision=0 where id=$1", [created.id]),
      ).rejects.toThrow();
      await expect(
        client.pool.query(
          "insert into integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_at,updated_at) values($1,'test-http','Zero','http://10.0.0.9:3000',true,'{}'::jsonb,'unknown',0,now(),now())",
          ["00000000-0000-4000-8000-000000000079"],
        ),
      ).rejects.toThrow();
      expect(await store.delete(created.id)).toBe(true);
      expect(
        (
          await client.pool.query(
            "select count(*)::int count from integration_secrets where integration_id=$1",
            [created.id],
          )
        ).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      await client.close();
    }
  });

  it("persists extra group permission grants without changing builtin roles", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await migratePostgresql(client.pool);
      const auth = createPostgresqlAuthStore(client.pool);
      await auth.createFirstAdmin({
        username: "Admin",
        usernameCanonical: "admin",
        passwordHash: "hash",
      });
      const member = await auth.createLocalUser({
        username: "Reader",
        usernameCanonical: "reader",
        passwordHash: "hash",
        roleName: "VIEWER",
      });
      const group = await auth.createGroupWithRoleAndOptionalMember({
        name: "NAS readers",
        roleName: "VIEWER",
        userId: member.id,
      });
      const before = await auth.resolvePermissionSubject(member.id);
      expect(before?.groupPermissions).not.toContain("synology.read");
      const viewerCount = (
        await client.pool.query(
          "select count(*)::int count from role_permissions where role_id=$1",
          ["00000000-0000-4000-8000-000000000005"],
        )
      ).rows[0].count;
      await auth.setGroupPermissionGrants(group.id, ["synology.read", "integration.use"]);
      expect(await auth.listGroupPermissionGrants(group.id)).toEqual([
        "integration.use",
        "synology.read",
      ]);
      const granted = await auth.resolvePermissionSubject(member.id);
      expect(granted?.groupPermissions).toEqual(
        expect.arrayContaining([
          "app.read",
          "integration.read",
          "integration.use",
          "synology.read",
        ]),
      );
      expect(
        (
          await client.pool.query("select count(*)::int count from group_roles where group_id=$1", [
            group.id,
          ])
        ).rows[0].count,
      ).toBe(2);
      expect(
        (
          await client.pool.query(
            "select count(*)::int count from role_permissions where role_id=$1",
            ["00000000-0000-4000-8000-000000000005"],
          )
        ).rows[0].count,
      ).toBe(viewerCount);
      await auth.setGroupPermissionGrants(group.id, ["integration.use"]);
      const reduced = await auth.resolvePermissionSubject(member.id);
      expect(reduced?.groupPermissions).toContain("integration.use");
      expect(reduced?.groupPermissions).not.toContain("synology.read");
      await expect(
        auth.setGroupPermissionGrants(group.id, ["not.a.permission"]),
      ).rejects.toMatchObject({ code: "INVALID_PERMISSION" });
    } finally {
      await client.close();
    }
  });
});
