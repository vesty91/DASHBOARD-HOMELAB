import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AutomationError, evaluateAutomationOwner } from "@dashboard/automations";
import { createSqliteAutomationStore } from "./automation-runtime";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteRepositories } from "./repositories/sqlite";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  const users = createSqliteRepositories(client);
  const owner = await users.users.create({ username: "owner" });
  const store = createSqliteAutomationStore(client);
  return { client, owner, store };
}

function actionConfig(integrationId: string) {
  return { integrationId, topic: "homelab" };
}

describe("SQLite automation persistence", () => {
  it("creates rules disabled by default and bumps schema_version to 7", async () => {
    const { client, owner, store } = await setup();
    try {
      expect(
        client.sqlite.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 7 });
      const created = await store.create({
        name: "Down alert",
        ownerUserId: owner.id,
        triggerType: "event",
        triggerConfigJson: { eventType: "integration.status.changed" },
        actionType: "ntfy.publish",
        actionConfigJson: actionConfig(randomUUID()),
      });
      expect(created.enabled).toBe(false);
      expect(created.configRevision).toBe(1);
      expect(created.ownerUserId).toBe(owner.id);
      const listed = await store.list();
      expect(listed).toHaveLength(1);
    } finally {
      client.close();
    }
  });

  it("updates with optimistic revision and conflicts on stale writes", async () => {
    const { client, owner, store } = await setup();
    try {
      const created = await store.create({
        name: "Pause torrents",
        ownerUserId: owner.id,
        triggerType: "schedule",
        triggerConfigJson: { everyMinutes: 15 },
        actionType: "qbittorrent.pause",
        actionConfigJson: actionConfig(randomUUID()),
      });
      const updated = await store.update(created.id, {
        expectedConfigRevision: 1,
        name: "Pause overnight",
      });
      expect(updated.configRevision).toBe(2);
      expect(updated.name).toBe("Pause overnight");
      await expect(
        store.setEnabled(created.id, { expectedConfigRevision: 1, enabled: true }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        store.update(created.id, { expectedConfigRevision: 1, name: "stale" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      client.close();
    }
  });

  it("enables, disables, records runs, keeps history after delete, and nulls owner on user delete", async () => {
    const { client, owner, store } = await setup();
    try {
      const created = await store.create({
        name: "Refresh series",
        ownerUserId: owner.id,
        triggerType: "event",
        triggerConfigJson: { eventType: "integration.data.changed" },
        actionType: "sonarr.refresh-series",
        actionConfigJson: actionConfig(randomUUID()),
      });
      const enabled = await store.setEnabled(created.id, {
        expectedConfigRevision: 1,
        enabled: true,
      });
      expect(enabled.enabled).toBe(true);
      expect(enabled.lastEnabledAt).toBeInstanceOf(Date);
      const run = await store.recordRun({
        automationId: created.id,
        runKey: `${created.id}:event:1`,
        triggerType: "event",
        status: "denied",
        startedAt: new Date(),
        finishedAt: new Date(),
        actionType: "sonarr.refresh-series",
        errorCode: "DENIED_PERMISSION",
        resourceId: "series:12",
        summaryJson: { result: "denied" },
      });
      expect(run.status).toBe("denied");
      client.sqlite.prepare("DELETE FROM users WHERE id=?").run(owner.id);
      const afterOwnerDelete = await store.get(created.id);
      expect(afterOwnerDelete?.ownerUserId).toBeNull();
      expect(() => evaluateAutomationOwner(null, "run")).toThrow(AutomationError);
      await store.delete(created.id);
      expect(await store.get(created.id)).toBeNull();
      expect(
        (
          client.sqlite.prepare("SELECT count(*) AS count FROM automation_runtime_state").get() as {
            count: number;
          }
        ).count,
      ).toBe(0);
      expect(
        (
          client.sqlite.prepare("SELECT count(*) AS count FROM automation_runs").get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
      expect(
        (
          client.sqlite
            .prepare("SELECT automation_id FROM automation_runs WHERE id=?")
            .get(run.id) as {
            automation_id: string | null;
          }
        ).automation_id,
      ).toBeNull();
    } finally {
      client.close();
    }
  });

  it("rejects invalid JSON, secrets, unknown action, and missing integrationId", async () => {
    const { client, owner, store } = await setup();
    try {
      const base = {
        name: "Bad",
        ownerUserId: owner.id,
        triggerType: "event" as const,
        triggerConfigJson: { eventType: "integration.status.changed" },
        actionType: "ntfy.publish" as const,
        actionConfigJson: actionConfig(randomUUID()),
      };
      await expect(
        store.create({ ...base, actionType: "shell.exec" as never }),
      ).rejects.toBeInstanceOf(AutomationError);
      await expect(
        store.create({
          ...base,
          actionConfigJson: { integrationId: randomUUID(), token: "secret" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(
        store.create({ ...base, actionConfigJson: { topic: "x" } }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    } finally {
      client.close();
    }
  });
});
