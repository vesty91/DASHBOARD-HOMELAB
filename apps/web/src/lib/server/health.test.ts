import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveHealthBody } from "./health-live";

const { checkDatabaseConnection, getDatabase } = vi.hoisted(() => ({
  checkDatabaseConnection: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("@dashboard/db/health", () => ({ checkDatabaseConnection }));
vi.mock("./database", () => ({ getDatabase }));

import { readyHealth } from "./health";

describe("web health contracts", () => {
  beforeEach(() => {
    checkDatabaseConnection.mockReset();
    getDatabase.mockReset();
  });

  it("live only reports process liveness and a safe version", () => {
    const body = liveHealthBody();
    expect(body.status).toBe("live");
    expect(body.version).toBe(process.env.APP_VERSION?.trim() || "1.3.0");
    expect(JSON.stringify(body)).not.toMatch(
      /DATABASE_URL|REDIS_URL|AUTH_SECRET|postgres(?:ql)?:\/\//iu,
    );
  });

  it("ready succeeds after a bounded SELECT 1 and does not probe integrations", async () => {
    getDatabase.mockResolvedValue({ client: { dialect: "postgres" } });
    checkDatabaseConnection.mockResolvedValue(undefined);
    const result = await readyHealth();
    expect(result).toEqual({
      status: 200,
      body: { status: "ready", version: expect.any(String) },
    });
    expect(checkDatabaseConnection).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.body)).not.toMatch(
      /DATABASE_URL|REDIS_URL|AUTH_SECRET|jellyfin|immich|hostname/iu,
    );
  });

  it("ready returns 503 without leaking connection strings when the database is down", async () => {
    getDatabase.mockRejectedValue(new Error("postgresql://dashboard:secret@postgres/dashboard"));
    const result = await readyHealth();
    expect(result.status).toBe(503);
    expect(result.body.status).toBe("not-ready");
    expect(JSON.stringify(result.body)).not.toMatch(/postgresql:\/\/|secret|DATABASE_URL/iu);
  });
});
