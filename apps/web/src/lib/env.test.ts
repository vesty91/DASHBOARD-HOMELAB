import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

describe("server environment", () => {
  it("uses Phase 1 defaults when future services are not configured", () => {
    expect(parseServerEnv({})).toEqual({
      APP_URL: "http://localhost:3000",
      LOG_LEVEL: "info",
    });
  });

  it("parses every documented variable when it is defined", () => {
    expect(
      parseServerEnv({
        APP_URL: "https://dashboard.example.test",
        AUTH_SECRET: "a".repeat(32),
        SECRET_ENCRYPTION_KEY: "a".repeat(64),
        DB_DRIVER: "sqlite",
        DATABASE_URL: "./appdata/dashboard.sqlite",
        REDIS_URL: "redis://localhost:6379",
        LOG_LEVEL: "debug",
        INTEGRATION_DEFAULT_TIMEOUT_MS: "8000",
      }),
    ).toMatchObject({
      DB_DRIVER: "sqlite",
      INTEGRATION_DEFAULT_TIMEOUT_MS: 8000,
      REDIS_URL: "redis://localhost:6379",
    });
  });

  it("rejects malformed optional configuration", () => {
    expect(() =>
      parseServerEnv({
        AUTH_SECRET: "too-short",
        SECRET_ENCRYPTION_KEY: "not-hex",
        REDIS_URL: "https://localhost:6379",
        INTEGRATION_DEFAULT_TIMEOUT_MS: "0",
      }),
    ).toThrow();
  });
});
