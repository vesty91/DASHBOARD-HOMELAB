import { describe, expect, it } from "vitest";

import { getAuthSessionConfiguration, parseServerEnv } from "./env";

describe("server environment", () => {
  it("uses Phase 1 defaults when future services are not configured", () => {
    expect(parseServerEnv({})).toEqual({
      APP_URL: "http://localhost:3000",
      AUTH_SESSION_MAX_AGE_SECONDS: 86400,
      LOG_LEVEL: "info",
    });
  });

  it("parses every documented variable when it is defined", () => {
    expect(
      parseServerEnv({
        APP_URL: "https://dashboard.example.test",
        AUTH_SECRET: "a".repeat(32),
        AUTH_SESSION_MAX_AGE_SECONDS: "3600",
        SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
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

  it("provides a finite validated Auth.js session duration", () => {
    const configuration = getAuthSessionConfiguration(
      parseServerEnv({ AUTH_SESSION_MAX_AGE_SECONDS: "86400" }),
    );
    expect(configuration).toEqual({ maxAge: 86400, updateAge: 3600 });
    expect(Number.isFinite(configuration.maxAge)).toBe(true);
    expect(configuration.maxAge).toBeGreaterThan(0);
  });

  it.each(["", "24h", "299", "2592001"])("rejects invalid session maximum age %j", (value) => {
    expect(() => parseServerEnv({ AUTH_SESSION_MAX_AGE_SECONDS: value })).toThrow();
  });
});
