import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { executeSqliteMigration } from "./migrations";

const phase2Migration = new URL("../drizzle/sqlite/0000_last_spyke.sql", import.meta.url);
const phase3Migration = new URL("../drizzle/sqlite/0001_sharp_doomsday.sql", import.meta.url);
const phase4Migration = new URL("../drizzle/sqlite/0002_wooden_callisto.sql", import.meta.url);
const phase5Migration = new URL("../drizzle/sqlite/0003_loud_titanium_man.sql", import.meta.url);
const phase6Migration = new URL("../drizzle/sqlite/0004_green_tenebrous.sql", import.meta.url);
const phase13JobsMigration = new URL(
  "../drizzle/sqlite/0005_wandering_mac_gargan.sql",
  import.meta.url,
);
const phase15SecurityMigration = new URL(
  "../drizzle/sqlite/0006_exotic_sugar_man.sql",
  import.meta.url,
);
const phase22AutomationMigration = new URL(
  "../drizzle/sqlite/0007_dashing_smasher.sql",
  import.meta.url,
);
const phase23NotificationMigration = new URL(
  "../drizzle/sqlite/0008_reflective_norman_osborn.sql",
  import.meta.url,
);
const phase24PushMigration = new URL("../drizzle/sqlite/0009_flimsy_arachne.sql", import.meta.url);

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

describe("Phase 4 to Phase 5 migration", () => {
  it("preserves existing App fields and applies safe health defaults", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO integrations(id,type,name,base_url,config_json,status,created_at,updated_at) VALUES('11111111-1111-4111-8111-111111111111','test','Test','https://example.com','{}','unknown',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO apps(id,name,description,url,icon_ref,color,healthcheck_enabled,healthcheck_config_json,integration_id,created_at,updated_at) VALUES('22222222-2222-4222-8222-222222222222','Existing','Kept','http://192.168.1.5:3000','https://example.com/icon.png','#123456',1,'{\"path\":\"/health\"}','11111111-1111-4111-8111-111111111111',1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      expect(
        database
          .prepare(
            "SELECT name,description,url,icon_ref,color,healthcheck_enabled,healthcheck_config_json,integration_id,target,health_status,health_config_revision FROM apps",
          )
          .get(),
      ).toMatchObject({
        name: "Existing",
        description: "Kept",
        url: "http://192.168.1.5:3000",
        icon_ref: "https://example.com/icon.png",
        color: "#123456",
        healthcheck_enabled: 1,
        healthcheck_config_json: '{"path":"/health"}',
        integration_id: "11111111-1111-4111-8111-111111111111",
        target: "new-tab",
        health_status: "unknown",
        health_config_revision: 1,
      });
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

describe("Phase 6 to Phase 7 migration", () => {
  it("preserves integrations and encrypted secrets while adding config_revision", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,created_at,updated_at) VALUES('11111111-1111-4111-8111-111111111111','legacy','NAS','https://192.168.1.5:5001',1,'{\"verifyTls\":true}','available',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO integration_secrets(id,integration_id,key,ciphertext,iv,auth_tag,key_version,created_at,updated_at) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','apiKey','Y2lwaGVy','aXY=','dGFn',1,1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      expect(
        database
          .prepare(
            "SELECT type,name,base_url,config_json,status,config_revision FROM integrations WHERE id='11111111-1111-4111-8111-111111111111'",
          )
          .get(),
      ).toMatchObject({
        type: "legacy",
        name: "NAS",
        base_url: "https://192.168.1.5:5001",
        config_json: '{"verifyTls":true}',
        status: "available",
        config_revision: 1,
      });
      expect(
        database
          .prepare(
            "SELECT key,ciphertext,iv,auth_tag,key_version FROM integration_secrets WHERE integration_id='11111111-1111-4111-8111-111111111111'",
          )
          .get(),
      ).toMatchObject({
        key: "apiKey",
        ciphertext: "Y2lwaGVy",
        iv: "aXY=",
        auth_tag: "dGFn",
        key_version: 1,
      });
      expect(() =>
        database
          .prepare(
            "UPDATE integrations SET config_revision=0 WHERE id='11111111-1111-4111-8111-111111111111'",
          )
          .run(),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});

describe("Phase 13 jobs migration", () => {
  it("adds the jobs table without dropping integrations", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      database
        .prepare(
          "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_at,updated_at) VALUES('11111111-1111-4111-8111-111111111111','legacy','NAS','https://192.168.1.5:5001',1,'{}','available',1,1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      expect(
        database
          .prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='jobs'")
          .get()?.count,
      ).toBe(1);
      expect(
        database
          .prepare("SELECT name FROM integrations WHERE id='11111111-1111-4111-8111-111111111111'")
          .get(),
      ).toMatchObject({ name: "NAS" });
    } finally {
      database.close();
    }
  });
});

describe("Phase 15 security migration", () => {
  it("adds OIDC, audit and session tables and bumps schema_version to 6", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase15SecurityMigration, "utf8"));
      for (const table of [
        "oidc_identities",
        "oidc_group_mappings",
        "oidc_secrets",
        "audit_logs",
        "auth_sessions",
      ]) {
        expect(
          database
            .prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name=?")
            .get(table)?.count,
        ).toBe(1);
      }
      expect(
        database.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 6 });
    } finally {
      database.close();
    }
  });

  it("AC-024 preserves an existing board, layout and widget across schema 5 to 6", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES('u1','Admin','admin',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO boards(id,slug,name,visibility,owner_user_id,theme_json,settings_json,revision,created_at,updated_at) VALUES('b1','kept','Kept Board','private','u1','{}','{}',4,1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO layouts(id,board_id,name,breakpoint,columns,row_height,sort_order,created_at,updated_at) VALUES('ld','b1','Desktop','desktop',12,72,0,1,1),('lm','b1','Mobile','mobile',4,72,1,1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,config_json,created_at,updated_at) VALUES('i1','b1','clock',1,'{}',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO item_layouts(id,item_id,layout_id,x,y,w,h) VALUES('p1','i1','ld',2,3,4,2),('p2','i1','lm',0,1,4,2)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase15SecurityMigration, "utf8"));
      expect(
        database.prepare("SELECT slug,name,revision FROM boards WHERE id='b1'").get(),
      ).toMatchObject({ slug: "kept", name: "Kept Board", revision: 4 });
      expect(
        database
          .prepare("SELECT breakpoint FROM layouts WHERE board_id='b1' ORDER BY breakpoint")
          .all(),
      ).toEqual([{ breakpoint: "desktop" }, { breakpoint: "mobile" }]);
      expect(database.prepare("SELECT widget_type FROM items WHERE id='i1'").get()).toMatchObject({
        widget_type: "clock",
      });
      expect(database.prepare("SELECT x,y,w,h FROM item_layouts ORDER BY id").all()).toEqual([
        { x: 2, y: 3, w: 4, h: 2 },
        { x: 0, y: 1, w: 4, h: 2 },
      ]);
      expect(
        database.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 6 });
    } finally {
      database.close();
    }
  });
});

describe("Phase 22 automation migration", () => {
  it("adds automation tables and bumps schema_version to 7 without dropping boards", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase15SecurityMigration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES('u1','Admin','admin',1,1)",
        )
        .run();
      database
        .prepare(
          "INSERT INTO boards(id,slug,name,visibility,theme_json,settings_json,revision,created_at,updated_at) VALUES('b1','kept','Kept Board','private','{}','{}',4,1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase22AutomationMigration, "utf8"));
      expect(
        database.prepare("SELECT slug,name,revision FROM boards WHERE id='b1'").get(),
      ).toMatchObject({ slug: "kept", name: "Kept Board", revision: 4 });
      expect(
        database.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 7 });
      for (const table of ["automation_rules", "automation_runtime_state", "automation_runs"]) {
        expect(
          database
            .prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name=?")
            .get(table)?.count,
        ).toBe(1);
      }
    } finally {
      database.close();
    }
  });
});

describe("Phase 23 notification migration", () => {
  it("adds notification and incident tables and bumps schema_version to 8", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase15SecurityMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase22AutomationMigration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES('u1','Admin','admin',1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase23NotificationMigration, "utf8"));
      expect(
        database.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 8 });
      for (const table of ["notifications", "incidents", "incident_events"]) {
        expect(
          database
            .prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name=?")
            .get(table)?.count,
        ).toBe(1);
      }
    } finally {
      database.close();
    }
  });
});

describe("Phase 24 web push migration", () => {
  it("adds push_subscriptions and bumps schema_version to 9", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    try {
      database.exec(await readFile(phase2Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase3Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase4Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase5Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase6Migration, "utf8"));
      executeSqliteMigration(database, await readFile(phase13JobsMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase15SecurityMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase22AutomationMigration, "utf8"));
      executeSqliteMigration(database, await readFile(phase23NotificationMigration, "utf8"));
      database
        .prepare(
          "INSERT INTO users(id,username,username_canonical,created_at,updated_at) VALUES('u1','Admin','admin',1,1)",
        )
        .run();
      executeSqliteMigration(database, await readFile(phase24PushMigration, "utf8"));
      expect(
        database.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 9 });
      expect(
        database
          .prepare(
            "SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='push_subscriptions'",
          )
          .get()?.count,
      ).toBe(1);
    } finally {
      database.close();
    }
  });
});
