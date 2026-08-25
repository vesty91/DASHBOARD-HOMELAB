import { describe, expect, it } from "vitest";
import { createPostgresqlClient } from "./client/postgresql";
import { migratePostgresql } from "./migrations";
import { createPostgresqlRepositories } from "./repositories/postgresql";

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("PostgreSQL database foundation", () => {
  it("runs real migrations, repositories, constraints and rollback", async () => {
    const client = createPostgresqlClient(connectionString!);
    try {
      await client.pool.query("drop schema public cascade; create schema public");
      await migratePostgresql(client.pool);
      const r = createPostgresqlRepositories(client);
      const user = await r.users.create({ username: "postgres-admin" });
      expect((await r.users.findById(user.id))?.username).toBe("postgres-admin");
      await expect(r.users.create({ username: "postgres-admin" })).rejects.toThrow();
      await expect(
        r.createBoardWithLayouts({ slug: "rollback", name: "Rollback" }, [
          { name: "One", breakpoint: "desktop", columns: 12, rowHeight: 32, sortOrder: 0 },
          { name: "Duplicate", breakpoint: "desktop", columns: 6, rowHeight: 32, sortOrder: 1 },
        ]),
      ).rejects.toThrow();
      expect(await r.boards.list()).toHaveLength(0);
    } finally {
      await client.close();
    }
  });
});
