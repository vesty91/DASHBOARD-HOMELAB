import { describe, expect, it } from "vitest";
import { createIncidentService, createNotificationService } from "@dashboard/notifications";
import { createSqliteIncidentStore } from "./incident-runtime";
import { createSqliteNotificationStore } from "./notification-runtime";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteRepositories } from "./repositories/sqlite";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  const repos = createSqliteRepositories(client);
  const user = await repos.users.create({ username: "reader" });
  const integrationId = crypto.randomUUID();
  const now = Date.now();
  client.sqlite
    .prepare(
      "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_at,updated_at) VALUES(?,?,?,?,1,'{}','unknown',1,?,?)",
    )
    .run(integrationId, "sonarr", "Sonarr", "http://127.0.0.1:8989", now, now);
  const incidentStore = createSqliteIncidentStore(client);
  const notificationStore = createSqliteNotificationStore(client);
  const notifications = createNotificationService({ store: notificationStore });
  const service = createIncidentService({
    store: incidentStore,
    notifications,
    listRecipientUserIds: async () => [user.id],
  });
  return { client, user, integrationId, incidentStore, notificationStore, service };
}

describe("SQLite incident persistence", () => {
  it("opens, rejects duplicate open, resolves, and stores timeline", async () => {
    const { client, user, integrationId, incidentStore, notificationStore, service } =
      await setup();
    try {
      const opened = await service.handleStatusChanged({
        integrationId,
        integrationType: "sonarr",
        status: "unavailable",
        occurredAt: "2026-09-16T11:00:00.000Z",
      });
      expect(opened.action).toBe("opened");
      const duplicate = await service.handleStatusChanged({
        integrationId,
        integrationType: "sonarr",
        status: "unavailable",
        occurredAt: "2026-09-16T11:01:00.000Z",
      });
      expect(duplicate.action).toBe("noop");
      expect(await incidentStore.list({ status: "open", limit: 10 })).toHaveLength(1);
      const resolved = await service.handleStatusChanged({
        integrationId,
        integrationType: "sonarr",
        status: "available",
        occurredAt: "2026-09-16T11:05:00.000Z",
      });
      expect(resolved.action).toBe("resolved");
      const events = await incidentStore.listEvents(opened.incidentId!, 20);
      expect(events.map((row) => row.eventType)).toEqual(["opened", "resolved"]);
      expect(JSON.stringify(events)).not.toMatch(/password|token|api[_-]?key/iu);
      const recipientNotifications = await notificationStore.list({
        userId: user.id,
        limit: 20,
        includeDismissed: true,
      });
      expect(recipientNotifications.length).toBeGreaterThanOrEqual(2);
      expect(recipientNotifications.every((row) => row.sourceType === "incident")).toBe(true);
    } finally {
      client.close();
    }
  });
});
