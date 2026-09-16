import { describe, expect, it } from "vitest";
import { createEnvKeyring } from "@dashboard/secrets";
import { createPushService, hashPushEndpoint } from "@dashboard/notifications";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqlitePushSubscriptionStore } from "./push-subscription-runtime";
import { createSqliteRepositories } from "./repositories/sqlite";

const KEY = Buffer.alloc(32, 21).toString("base64");
const VAPID = {
  publicKey: "BPpublic",
  privateKey: "private-key",
  subject: "mailto:admin@example.com",
};

describe("SQLite push subscription persistence", () => {
  it("encrypts endpoints and isolates users at schema 9", async () => {
    const client = createSqliteClient(":memory:");
    await migrateSqlite(client.sqlite);
    try {
      expect(
        client.sqlite.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 11 });
      const repos = createSqliteRepositories(client);
      const user = await repos.users.create({ username: "pusher" });
      const other = await repos.users.create({ username: "other" });
      const store = createSqlitePushSubscriptionStore(client);
      const service = createPushService({
        store,
        keyring: createEnvKeyring(KEY),
        vapid: VAPID,
        send: async () => ({ statusCode: 201 }),
      });
      const actorFor = (userId: string) => ({
        userId,
        subject: {
          status: "active" as const,
          isSystemAdmin: true,
        },
      });
      const created = await service.subscribe(actorFor(user.id), {
        endpoint: "https://push.example/device-1",
        keys: { p256dh: "BNcRdtrerQ", auth: "tBHItJI5svw" },
      });
      const row = client.sqlite
        .prepare("SELECT endpoint_ciphertext, endpoint_hash FROM push_subscriptions WHERE id=?")
        .get(created.id) as { endpoint_ciphertext: string; endpoint_hash: string };
      expect(row.endpoint_hash).toBe(hashPushEndpoint("https://push.example/device-1"));
      expect(row.endpoint_ciphertext).not.toContain("https://push.example/device-1");
      expect(await service.list(actorFor(other.id))).toEqual({ items: [] });
      await expect(service.unsubscribe(actorFor(other.id), { id: created.id })).resolves.toEqual({
        removed: false,
      });
    } finally {
      client.close();
    }
  });
});
