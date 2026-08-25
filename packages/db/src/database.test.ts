import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { createSqliteClient } from "./client/sqlite";
import { parseDatabaseConfig } from "./config";
import { migrateSqlite } from "./migrations";
import { DatabaseError, normalizeDatabaseError } from "./errors";
import { checkDatabaseConnection } from "./health";
import { createSqliteRepositories } from "./repositories/sqlite";
import { SCHEMA_CONTRACT, TABLE_NAMES } from "./schema/shared";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return client;
}

describe("database configuration", () => {
  it("validates both supported dialects", () => {
    expect(parseDatabaseConfig({ DB_DRIVER: "sqlite", DATABASE_URL: ":memory:" }).DB_DRIVER).toBe(
      "sqlite",
    );
    expect(
      parseDatabaseConfig({
        DB_DRIVER: "postgres",
        DATABASE_URL: "postgresql://user:pass@localhost/db",
      }).DB_DRIVER,
    ).toBe("postgres");
  });
  it("normalizes errors without exposing SQL or credentials", () => {
    const normalized = normalizeDatabaseError({ code: "23505", message: "secret SQL" });
    expect(normalized).toBeInstanceOf(DatabaseError);
    expect(normalized.code).toBe("UNIQUE_CONSTRAINT");
    expect(normalized.message).not.toContain("secret SQL");
  });
});

describe("SQLite database foundation", () => {
  it("migrates an empty database with every expected table", async () => {
    const client = await setup();
    try {
      const rows = client.sqlite
        .prepare("select name from sqlite_master where type = 'table'")
        .all() as { name: string }[];
      const names = rows.map((row) => row.name);
      for (const table of TABLE_NAMES) expect(names).toContain(table);
    } finally {
      client.close();
    }
  });
  it("provides a lightweight readiness query", async () => {
    const client = await setup();
    try {
      await expect(checkDatabaseConnection(client)).resolves.toBeUndefined();
    } finally {
      client.close();
    }
  });
  it("provides CRUD repositories and enforces unique constraints", async () => {
    const client = await setup();
    try {
      const repositories = createSqliteRepositories(client);
      const user = await repositories.users.create({
        username: "admin",
        email: "admin@example.test",
      });
      expect((await repositories.users.findById(user.id))?.username).toBe("admin");
      expect(await repositories.users.list()).toHaveLength(1);
      await expect(repositories.users.create({ username: "admin" })).rejects.toThrow();
    } finally {
      client.close();
    }
  });
  it("enforces FK deletion policies", async () => {
    const client = await setup();
    try {
      const r = createSqliteRepositories(client);
      const user = await r.users.create({ username: "owner" });
      const integration = await r.integrations.create({
        type: "test",
        name: "Test",
        baseUrl: "https://example.test",
        createdBy: user.id,
      });
      const board = await r.boards.create({ slug: "home", name: "Home", ownerUserId: user.id });
      await r.apps.create({
        name: "App",
        url: "https://example.test",
        integrationId: integration.id,
      });
      client.sqlite.prepare("delete from users where id = ?").run(user.id);
      expect(
        client.sqlite.prepare("select owner_user_id from boards where id = ?").get(board.id)
          ?.owner_user_id,
      ).toBeNull();
      client.sqlite.prepare("delete from integrations where id = ?").run(integration.id);
      expect(
        client.sqlite.prepare("select integration_id from apps limit 1").get()?.integration_id,
      ).toBeNull();
    } finally {
      client.close();
    }
  });
  it("creates board and layouts atomically and rolls back failures", async () => {
    const client = await setup();
    try {
      const r = createSqliteRepositories(client);
      await r.createBoardWithLayouts({ slug: "ok", name: "OK" }, [
        { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 32, sortOrder: 0 },
      ]);
      expect(await r.boards.list()).toHaveLength(1);
      await expect(
        r.createBoardWithLayouts({ slug: "rollback", name: "Rollback" }, [
          { name: "One", breakpoint: "desktop", columns: 12, rowHeight: 32, sortOrder: 0 },
          { name: "Duplicate", breakpoint: "desktop", columns: 6, rowHeight: 32, sortOrder: 1 },
        ]),
      ).rejects.toThrow();
      expect(
        client.sqlite.prepare("select id from boards where slug = ?").get("rollback"),
      ).toBeUndefined();
    } finally {
      client.close();
    }
  });
  it("enforces item/layout uniqueness and foreign keys", async () => {
    const client = await setup();
    try {
      expect(() =>
        client.sqlite
          .prepare("insert into group_members(group_id,user_id,created_at) values(?,?,?)")
          .run(randomUUID(), randomUUID(), Date.now()),
      ).toThrow();
      const now = Date.now();
      const boardId = randomUUID();
      const layoutId = randomUUID();
      const itemId = randomUUID();
      client.sqlite
        .prepare("insert into boards(id,slug,name,created_at,updated_at) values(?,?,?,?,?)")
        .run(boardId, "grid", "Grid", now, now);
      client.sqlite
        .prepare(
          "insert into layouts(id,board_id,name,breakpoint,columns,row_height,sort_order,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",
        )
        .run(layoutId, boardId, "Desktop", "desktop", 12, 32, 0, now, now);
      client.sqlite
        .prepare(
          "insert into items(id,board_id,widget_type,widget_version,created_at,updated_at) values(?,?,?,?,?,?)",
        )
        .run(itemId, boardId, "clock", 1, now, now);
      client.sqlite
        .prepare("insert into item_layouts(id,item_id,layout_id,x,y,w,h) values(?,?,?,?,?,?,?)")
        .run(randomUUID(), itemId, layoutId, 0, 0, 2, 2);
      expect(() =>
        client.sqlite
          .prepare("insert into item_layouts(id,item_id,layout_id,x,y,w,h) values(?,?,?,?,?,?,?)")
          .run(randomUUID(), itemId, layoutId, 1, 1, 2, 2),
      ).toThrow();
    } finally {
      client.close();
    }
  });
  it("keeps SQLite and PostgreSQL business columns in parity", () => {
    const sqliteTables = {
      users: sqliteSchema.users,
      groups: sqliteSchema.groups,
      group_members: sqliteSchema.groupMembers,
      boards: sqliteSchema.boards,
      layouts: sqliteSchema.layouts,
      items: sqliteSchema.items,
      item_layouts: sqliteSchema.itemLayouts,
      apps: sqliteSchema.apps,
      integrations: sqliteSchema.integrations,
      integration_secrets: sqliteSchema.integrationSecrets,
      server_settings: sqliteSchema.serverSettings,
    };
    const postgresTables = {
      users: postgresqlSchema.users,
      groups: postgresqlSchema.groups,
      group_members: postgresqlSchema.groupMembers,
      boards: postgresqlSchema.boards,
      layouts: postgresqlSchema.layouts,
      items: postgresqlSchema.items,
      item_layouts: postgresqlSchema.itemLayouts,
      apps: postgresqlSchema.apps,
      integrations: postgresqlSchema.integrations,
      integration_secrets: postgresqlSchema.integrationSecrets,
      server_settings: postgresqlSchema.serverSettings,
    };
    for (const tableName of TABLE_NAMES) {
      const expected = SCHEMA_CONTRACT[tableName];
      const sqliteColumns = Object.keys(getTableColumns(sqliteTables[tableName]));
      const postgresColumns = Object.keys(getTableColumns(postgresTables[tableName]));
      for (const column of expected) {
        expect(sqliteColumns).toContain(column);
        expect(postgresColumns).toContain(column);
      }
      expect(sqliteColumns.sort()).toEqual(postgresColumns.sort());
    }
  });
});
