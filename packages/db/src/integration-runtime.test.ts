import { describe, expect, it } from "vitest";
import { createEnvKeyring, decryptSecret, encryptSecret } from "@dashboard/secrets";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteIntegrationStore } from "./integration-runtime";
import { createSqliteRepositories } from "./repositories/sqlite";

const keyring = createEnvKeyring(Buffer.alloc(32, 13).toString("base64"))!;
const PLAINTEXT = "my-super-secret-token";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return { client, store: createSqliteIntegrationStore(client.sqlite) };
}

describe("SQLite integration store", () => {
  it("supports CRUD, encrypted secrets, cascade and pagination", async () => {
    const { client, store } = await setup();
    try {
      const created = await store.create({
        type: "test-http",
        name: "One",
        baseUrl: "http://10.0.0.10:3000",
        enabled: true,
        config: { verifyTls: true },
        createdBy: null,
      });
      expect(created.configRevision).toBe(1);
      expect(created.status).toBe("unknown");
      const second = await store.create({
        type: "test-http",
        name: "Two",
        baseUrl: "http://10.0.0.11:3000",
        enabled: true,
        config: {},
        createdBy: null,
      });
      const page = await store.list(1);
      expect(page).toHaveLength(1);
      const rest = await store.list(10, page[0]?.id);
      expect([...page, ...rest].map((row) => row.id).sort()).toEqual(
        [created.id, second.id].sort(),
      );
      const encrypted = encryptSecret(keyring, {
        integrationId: created.id,
        key: "apiKey",
        plaintext: PLAINTEXT,
      });
      await store.upsertSecret(created.id, { key: "apiKey", ...encrypted });
      const raw = client.sqlite
        .prepare(
          "SELECT ciphertext,iv,auth_tag,key_version FROM integration_secrets WHERE integration_id=?",
        )
        .get(created.id) as {
        ciphertext: string;
        iv: string;
        auth_tag: string;
        key_version: number;
      };
      expect(raw.ciphertext).not.toContain(PLAINTEXT);
      expect(raw.iv).not.toContain(PLAINTEXT);
      expect(raw.auth_tag).not.toContain(PLAINTEXT);
      const loaded = (await store.loadEncryptedSecrets(created.id))[0]!;
      expect(
        decryptSecret(keyring, {
          ...loaded,
          integrationId: created.id,
        }),
      ).toBe(PLAINTEXT);
      expect(await store.deleteSecret(created.id, "apiKey")).toBe(true);
      expect(await store.loadEncryptedSecrets(created.id)).toEqual([]);
      expect(await store.deleteSecret(created.id, "apiKey")).toBe(false);
      const other = await store.create({
        type: "test-http",
        name: "Other",
        baseUrl: "http://10.0.0.12:3000",
        enabled: true,
        config: {},
        createdBy: null,
      });
      expect(() =>
        decryptSecret(keyring, {
          integrationId: other.id,
          key: "apiKey",
          ciphertext: loaded.ciphertext,
          iv: loaded.iv,
          authTag: loaded.authTag,
          keyVersion: loaded.keyVersion,
        }),
      ).toThrow();
      expect(await store.persistConnectionResult(created.id, 3, "available")).toBe(true);
      expect(await store.persistConnectionResult(created.id, 2, "unavailable")).toBe(false);
      expect((await store.findById(created.id))?.status).toBe("available");
      const renamed = await store.update({
        id: created.id,
        name: "Renamed",
        bumpRevision: false,
        resetStatus: false,
      });
      expect(renamed).toMatchObject({ name: "Renamed", status: "available", configRevision: 3 });
      const reset = await store.update({
        id: created.id,
        baseUrl: "http://10.0.0.99:3000",
        bumpRevision: true,
        resetStatus: true,
      });
      expect(reset).toMatchObject({ status: "unknown", configRevision: 4, lastCheckedAt: null });
      const initial = await store.findById(created.id);
      await Promise.all([
        store.update({
          id: created.id,
          enabled: false,
          bumpRevision: true,
          resetStatus: true,
        }),
        store.update({
          id: created.id,
          baseUrl: "http://10.0.0.55:3000",
          bumpRevision: true,
          resetStatus: true,
        }),
      ]);
      expect(await store.findById(created.id)).toMatchObject({
        enabled: false,
        baseUrl: "http://10.0.0.55:3000",
        configRevision: (initial?.configRevision ?? 0) + 2,
      });
      expect(() =>
        client.sqlite
          .prepare("UPDATE integrations SET config_revision=0 WHERE id=?")
          .run(created.id),
      ).toThrow();
      expect(() =>
        client.sqlite
          .prepare(
            "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "test-http",
            "Zero",
            "http://10.0.0.9:3000",
            1,
            "{}",
            "unknown",
            0,
            Date.now(),
            Date.now(),
          ),
      ).toThrow();
      expect(await store.delete(created.id)).toBe(true);
      expect(
        client.sqlite
          .prepare("SELECT count(*) count FROM integration_secrets WHERE integration_id=?")
          .get(created.id)?.count,
      ).toBe(0);
    } finally {
      client.close();
    }
  });

  it("nulls app and item integration references on delete", async () => {
    const { client, store } = await setup();
    try {
      const repositories = createSqliteRepositories(client);
      const integration = await store.create({
        type: "test-http",
        name: "Linked",
        baseUrl: "http://10.0.0.10:3000",
        enabled: true,
        config: {},
        createdBy: null,
      });
      await repositories.apps.create({
        name: "App",
        url: "http://10.0.0.10:3000",
        integrationId: integration.id,
      });
      const board = await repositories.boards.create({ slug: "home", name: "Home" });
      const itemId = crypto.randomUUID();
      const now = Date.now();
      client.sqlite
        .prepare(
          "INSERT INTO items(id,board_id,widget_type,widget_version,integration_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(itemId, board.id, "clock", 1, integration.id, now, now);
      await store.delete(integration.id);
      expect(
        client.sqlite.prepare("SELECT integration_id FROM apps LIMIT 1").get()?.integration_id,
      ).toBeNull();
      expect(
        client.sqlite.prepare("SELECT integration_id FROM items WHERE id=?").get(itemId)
          ?.integration_id,
      ).toBeNull();
    } finally {
      client.close();
    }
  });
});
