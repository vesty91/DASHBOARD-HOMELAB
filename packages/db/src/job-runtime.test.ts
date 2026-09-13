import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client/sqlite";
import { createSqliteJobStore } from "./job-runtime";
import { migrateSqlite } from "./migrations";

async function setup() {
  const client = createSqliteClient(":memory:");
  await migrateSqlite(client.sqlite);
  return client;
}

describe("job store", () => {
  it("records a succeeded heartbeat without leaking secrets", async () => {
    const client = await setup();
    try {
      const store = createSqliteJobStore(client);
      const at = new Date("2026-09-13T00:00:00.000Z");
      const recorded = await store.record({
        type: "heartbeat",
        status: "succeeded",
        scheduledAt: at,
        startedAt: at,
        finishedAt: at,
        errorMessageSafe: "redis://:super-secret@127.0.0.1:6379/0 down",
      });
      expect(recorded.type).toBe("heartbeat");
      expect(recorded.status).toBe("succeeded");
      expect(recorded.errorMessageSafe).not.toMatch(/super-secret|6379/u);
      const listed = await store.listRecent(10);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(recorded.id);
      expect(JSON.stringify(listed)).not.toMatch(/super-secret|password|AUTH_SECRET/iu);
    } finally {
      client.close();
    }
  });

  it("records a failed heartbeat and bounds list size", async () => {
    const client = await setup();
    try {
      const store = createSqliteJobStore(client);
      await store.record({
        type: "heartbeat",
        status: "failed",
        scheduledAt: new Date("2026-09-13T00:00:01.000Z"),
        errorCode: "REDIS_DOWN",
      });
      await store.record({
        type: "heartbeat",
        status: "succeeded",
        scheduledAt: new Date("2026-09-13T00:00:02.000Z"),
      });
      const listed = await store.listRecent(1);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.status).toBe("succeeded");
    } finally {
      client.close();
    }
  });
});
