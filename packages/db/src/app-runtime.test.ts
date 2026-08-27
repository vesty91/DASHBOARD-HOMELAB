import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteAppStore } from "./app-runtime";
const base = {
  name: "NAS",
  description: "Storage",
  url: "http://192.168.1.5:5000/",
  iconRef: null,
  color: "#336699",
  target: "new-tab" as const,
  tags: ["NAS"],
  healthcheckEnabled: true,
  healthcheckConfig: {
    path: "/health",
    method: "GET" as const,
    timeoutMs: 5000,
    expectedStatusMin: 200,
    expectedStatusMax: 399,
  },
};
async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return { client, store: createSqliteAppStore(client.sqlite) };
}
describe("SQLite app store", () => {
  it("supports CRUD, tags, cascade, and stable ordering", async () => {
    const { client, store } = await setup();
    try {
      const created = await store.create(base);
      expect(created.tags).toEqual(["NAS"]);
      expect((await store.list(100))[0]?.id).toBe(created.id);
      expect(
        (await store.update({ id: created.id, name: "NAS 2", tags: ["Storage"] }))?.tags,
      ).toEqual(["Storage"]);
      expect(await store.delete(created.id)).toBe(true);
      expect(await store.findById(created.id)).toBeUndefined();
      expect(client.sqlite.prepare("SELECT count(*) count FROM app_tags").get()?.count).toBe(0);
    } finally {
      client.close();
    }
  });
  it("rolls back duplicate canonical tags", async () => {
    const { client, store } = await setup();
    try {
      await expect(store.create({ ...base, tags: ["NAS", "nas"] })).rejects.toThrow();
      expect(await store.list(100)).toEqual([]);
    } finally {
      client.close();
    }
  });
  it("resets health only for health configuration changes and rejects stale results", async () => {
    const { client, store } = await setup();
    try {
      const app = await store.create(base);
      expect(
        await store.persistHealthResult(app.id, 1, {
          status: "up",
          latencyMs: 12,
          httpStatus: 204,
          errorCode: null,
        }),
      ).toBe(true);
      const visual = await store.update({ id: app.id, name: "NAS renamed" });
      expect(visual).toMatchObject({
        healthStatus: "up",
        lastLatencyMs: 12,
        healthConfigRevision: 1,
      });
      const changed = await store.update({ id: app.id, url: "http://192.168.1.6/" });
      expect(changed).toMatchObject({
        healthStatus: "unknown",
        lastLatencyMs: null,
        healthConfigRevision: 2,
      });
      expect(
        await store.persistHealthResult(app.id, 1, {
          status: "down",
          latencyMs: 5,
          httpStatus: 500,
          errorCode: "HTTP_STATUS",
        }),
      ).toBe(false);
    } finally {
      client.close();
    }
  });
});
