import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { executeSqliteMigration } from "./migrations";

const phase2Migration = new URL("../drizzle/sqlite/0000_last_spyke.sql", import.meta.url);
const phase3Migration = new URL("../drizzle/sqlite/0001_sharp_doomsday.sql", import.meta.url);
const phase4Migration = new URL("../drizzle/sqlite/0002_wooden_callisto.sql", import.meta.url);

describe("Phase 2 to Phase 3 migration", () => {
  it("preserves users and boards while adding auth tables", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,status,is_system_admin,created_at,updated_at) VALUES('u1','Existing','active',0,1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO boards(id,slug,name,visibility,theme_json,settings_json,revision,created_at,updated_at) VALUES('b1','existing','Existing','private','{}','{}',1,1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      expect(
        database.prepare("SELECT username,username_canonical FROM users WHERE id='u1'").get(),
      ).toMatchObject({ username: "Existing", username_canonical: "existing" });
      expect(database.prepare("SELECT name FROM boards WHERE id='b1'").get()).toMatchObject({
        name: "Existing",
      });
      expect(database.prepare("SELECT count(*) count FROM roles").get()?.count).toBe(5);
      expect(database.prepare("PRAGMA table_info(user_credentials)").all().length).toBeGreaterThan(
        0,
      );
    } finally {
      database.close();
    }
  });

  it("rejects canonical username collisions without altering Phase 2 users", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,status,is_system_admin,created_at,updated_at) VALUES(?,?,?,?,1,1)",
        )
        .run("u1", "Alice", "active", 0);
      database
        .prepare(
          "INSERT INTO users(id,username,status,is_system_admin,created_at,updated_at) VALUES(?,?,?,?,1,1)",
        )
        .run("u2", "alice", "active", 0);

      const migration = await readFile(phase3Migration, "utf8");
      expect(() => executeSqliteMigration(database, migration)).toThrow(
        "USERNAME_CANONICAL_COLLISION",
      );
      expect(database.prepare("SELECT id,username FROM users ORDER BY id").all()).toEqual([
        { id: "u1", username: "Alice" },
        { id: "u2", username: "alice" },
      ]);
      expect(database.prepare("PRAGMA table_info(users)").all()).not.toContainEqual(
        expect.objectContaining({ name: "username_canonical" }),
      );
      expect(
        database
          .prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='roles'")
          .get()?.count,
      ).toBe(0);
    } finally {
      database.close();
    }
  });
});

describe("Phase 3 to Phase 4 migration", () => {
  it("preserves board, layouts, items and placements while adding ACL tables", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES('u1','Owner','owner',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO boards(id,slug,name,visibility,owner_user_id,theme_json,settings_json,revision,created_at,updated_at) VALUES('b1','existing','Existing','private','u1','{}','{}',7,1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO layouts(id,board_id,name,breakpoint,columns,row_height,sort_order,created_at,updated_at) VALUES('ld','b1','Desktop','desktop',12,72,0,1,1),('lm','b1','Mobile','mobile',4,72,1,1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,config_json,created_at,updated_at) VALUES('i1','b1','fixture',1,'{}',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO item_layouts(id,item_id,layout_id,x,y,w,h) VALUES('p1','i1','ld',1,2,3,4),('p2','i1','lm',0,5,4,2)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      expect(database.prepare("SELECT revision FROM boards WHERE id='b1'").get()).toEqual({
        revision: 7,
      });
      expect(
        database
          .prepare("SELECT breakpoint FROM layouts WHERE board_id='b1' ORDER BY breakpoint")
          .all(),
      ).toEqual([{ breakpoint: "desktop" }, { breakpoint: "mobile" }]);
      expect(database.prepare("SELECT x,y,w,h FROM item_layouts ORDER BY id").all()).toEqual([
        { x: 1, y: 2, w: 3, h: 4 },
        { x: 0, y: 5, w: 4, h: 2 },
      ]);
      expect(database.prepare("SELECT count(*) count FROM items WHERE id='i1'").get()?.count).toBe(
        1,
      );
      expect(
        database.prepare("PRAGMA table_info(board_user_permissions)").all().length,
      ).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  });
});
