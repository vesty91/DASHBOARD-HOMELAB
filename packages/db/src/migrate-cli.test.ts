import { describe, expect, it } from "vitest";
import { runProductionMigrateCli } from "./migrate-cli";

describe("production migrate CLI", () => {
  it("refuses to run against sqlite", async () => {
    await expect(
      runProductionMigrateCli({
        DB_DRIVER: "sqlite",
        DATABASE_URL: "./appdata/dashboard.sqlite",
      }),
    ).rejects.toThrow("MIGRATE_REQUIRES_POSTGRES");
  });

  it("fails fast without DATABASE_URL", async () => {
    await expect(runProductionMigrateCli({ DB_DRIVER: "postgres" })).rejects.toThrow();
  });
});
