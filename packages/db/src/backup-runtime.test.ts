import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLE_NAMES,
  buildArchive,
  parseBackupArchive,
} from "@dashboard/backup";
import { TABLE_NAMES } from "./schema/shared";
import { createSqliteAutomationStore } from "./automation-runtime";
import { createPostgresqlBackupStore, createSqliteBackupStore } from "./backup-runtime";
import { createPostgresqlClient } from "./client/postgresql";
import { createSqliteClient } from "./client/sqlite";
import { migratePostgresql, migrateSqlite } from "./migrations";
import { createSqliteRepositories } from "./repositories/sqlite";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return client;
}

describe("backup runtime", () => {
  it("keeps the backup vocabulary aligned with the restorable database tables", () => {
    for (const table of BACKUP_TABLE_NAMES) expect(TABLE_NAMES).toContain(table);
    expect(TABLE_NAMES).toContain("audit_logs");
    expect(TABLE_NAMES).toContain("auth_sessions");
    expect(BACKUP_TABLE_NAMES).not.toContain("audit_logs");
    expect(BACKUP_TABLE_NAMES).not.toContain("auth_sessions");
    expect(BACKUP_TABLE_NAMES).toContain("automation_rules");
    expect(BACKUP_TABLE_NAMES).not.toContain("automation_runtime_state");
    expect(BACKUP_TABLE_NAMES).not.toContain("automation_runs");
    expect(BACKUP_TABLE_NAMES).not.toContain("notifications");
    expect(BACKUP_TABLE_NAMES).not.toContain("incidents");
    expect(BACKUP_TABLE_NAMES).not.toContain("incident_events");
    expect(TABLE_NAMES).toContain("notifications");
    expect(TABLE_NAMES).toContain("incidents");
    expect(TABLE_NAMES).toContain("incident_events");
  });

  it("round-trips a snapshot, keeps secrets encrypted, and rolls back failed restores", async () => {
    const client = await setup();
    try {
      const store = createSqliteBackupStore(client);
      const repositories = createSqliteRepositories(client);
      const empty = await store.exportSnapshot();
      const user = await repositories.users.create({ username: "keeper" });
      await client.sqlite
        .prepare(
          "INSERT INTO user_credentials(user_id,password_hash,password_updated_at,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(user.id, "hashed-password-not-logged", Date.now(), Date.now(), Date.now());
      const integrationId = randomUUID();
      const now = Date.now();
      client.sqlite
        .prepare(
          "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_at,updated_at) VALUES(?,?,?,?,1,'{}','unknown',1,?,?)",
        )
        .run(integrationId, "docker", "Docker", "http://127.0.0.1:2375", now, now);
      client.sqlite
        .prepare(
          "INSERT INTO integration_secrets(id,integration_id,key,ciphertext,iv,auth_tag,key_version,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)",
        )
        .run(
          randomUUID(),
          integrationId,
          "apiKey",
          "encrypted-cipher",
          "iv-bytes",
          "tag-bytes",
          now,
          now,
        );
      const automations = createSqliteAutomationStore(client);
      const rule = await automations.create({
        name: "Backup rule",
        ownerUserId: user.id,
        triggerType: "schedule",
        triggerConfigJson: { everyMinutes: 15 },
        actionType: "ntfy.publish",
        actionConfigJson: { integrationId, topic: "homelab" },
      });
      await automations.recordRun({
        automationId: rule.id,
        runKey: `${rule.id}:schedule:1`,
        triggerType: "schedule",
        status: "succeeded",
        startedAt: new Date(),
        finishedAt: new Date(),
        actionType: "ntfy.publish",
        resourceId: "homelab",
      });
      const populated = await store.exportSnapshot();
      expect(populated.automation_rules).toHaveLength(1);
      expect(populated).not.toHaveProperty("automation_runs");
      expect(populated).not.toHaveProperty("automation_runtime_state");
      const archive = buildArchive(populated, "2026-09-14T12:00:00.000Z");
      expect(archive.manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      expect(JSON.stringify(archive.tables.integration_secrets)).toContain("encrypted-cipher");
      expect(JSON.stringify(archive)).not.toMatch(/"password"\s*:|"apiKey"\s*:\s*"super/u);
      const parsed = parseBackupArchive(archive);
      expect(parsed.tables.users.some((row) => row.username === "keeper")).toBe(true);

      await store.replaceSnapshot(empty);
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM users").get() as { count: number },
      ).toMatchObject({ count: 0 });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM automation_rules").get() as {
          count: number;
        },
      ).toMatchObject({ count: 0 });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM automation_runs").get() as {
          count: number;
        },
      ).toMatchObject({ count: 0 });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM automation_runtime_state").get() as {
          count: number;
        },
      ).toMatchObject({ count: 0 });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM integration_secrets").get() as {
          count: number;
        },
      ).toMatchObject({ count: 0 });

      await store.replaceSnapshot(populated);
      expect(
        client.sqlite.prepare("SELECT username FROM users").get() as { username: string },
      ).toMatchObject({ username: "keeper" });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM automation_rules").get() as {
          count: number;
        },
      ).toMatchObject({ count: 1 });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM automation_runs").get() as {
          count: number;
        },
      ).toMatchObject({ count: 0 });
      expect(
        client.sqlite.prepare("SELECT ciphertext FROM integration_secrets").get() as {
          ciphertext: string;
        },
      ).toMatchObject({ ciphertext: "encrypted-cipher" });

      const broken = structuredClone(populated);
      broken.items = [
        {
          id: randomUUID(),
          boardId: randomUUID(),
          widgetType: "clock",
          widgetVersion: 1,
          title: null,
          configJson: {},
          integrationId: null,
          createdAt: "2026-09-14T12:00:00.000Z",
          updatedAt: "2026-09-14T12:00:00.000Z",
        },
      ];
      await expect(store.replaceSnapshot(broken)).rejects.toThrow();
      expect(
        client.sqlite.prepare("SELECT username FROM users").get() as { username: string },
      ).toMatchObject({ username: "keeper" });
      expect(
        client.sqlite.prepare("SELECT count(*) AS count FROM items").get() as { count: number },
      ).toMatchObject({ count: 0 });
    } finally {
      client.close();
    }
  });
});

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("PostgreSQL backup runtime", () => {
  it("round-trips a snapshot inside a transaction", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await migratePostgresql(client.pool);
      const store = createPostgresqlBackupStore(client);
      const before = await store.exportSnapshot();
      await client.pool.query(
        "insert into users(id,username,username_canonical,status,is_system_admin,created_at,updated_at) values($1,'pg-backup','pg-backup','active',false,now(),now())",
        ["00000000-0000-4000-8000-000000000041"],
      );
      const populated = await store.exportSnapshot();
      expect(populated.users.some((row) => row.username === "pg-backup")).toBe(true);
      await store.replaceSnapshot(before);
      expect(await client.pool.query("select count(*)::int as count from users")).toMatchObject({
        rows: [{ count: 0 }],
      });
      await store.replaceSnapshot(populated);
      expect(
        await client.pool.query("select username from users where username='pg-backup'"),
      ).toMatchObject({ rows: [{ username: "pg-backup" }] });
    } finally {
      await client.close();
    }
  });
});
