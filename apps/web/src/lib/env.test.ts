import { describe, expect, it } from "vitest";

import { getAuthSessionConfiguration, parseServerEnv, assertRuntimeProductionEnv } from "./env";

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
        WORKER_URL: "http://127.0.0.1:3001",
        REALTIME_URL: "http://127.0.0.1:3002",
        LOG_LEVEL: "debug",
        INTEGRATION_DEFAULT_TIMEOUT_MS: "8000",
        BACKUP_DIR: "/appdata/backups",
        APP_VERSION: "0.1.0",
      }),
    ).toMatchObject({
      DB_DRIVER: "sqlite",
      INTEGRATION_DEFAULT_TIMEOUT_MS: 8000,
      REDIS_URL: "redis://localhost:6379",
      WORKER_URL: "http://127.0.0.1:3001",
      REALTIME_URL: "http://127.0.0.1:3002",
      BACKUP_DIR: "/appdata/backups",
      APP_VERSION: "0.1.0",
    });
  });

  it("rejects malformed optional configuration", () => {
    expect(() =>
      parseServerEnv({
        AUTH_SECRET: "too-short",
        SECRET_ENCRYPTION_KEY: "not-hex",
        REDIS_URL: "https://localhost:6379",
        WORKER_URL: "ftp://127.0.0.1:3001",
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

describe("assertRuntimeProductionEnv", () => {
  const validProduction = {
    NODE_ENV: "production",
    AUTH_SECRET: "a".repeat(32),
    DATABASE_URL: "postgresql://dashboard:dashboard@postgres:5432/dashboard",
    DB_DRIVER: "postgres",
    SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    APP_URL: "https://dashboard.example.test",
  };

  it("does not require production secrets during development or Next.js build", () => {
    expect(() => assertRuntimeProductionEnv({ NODE_ENV: "development" })).not.toThrow();
    expect(() =>
      assertRuntimeProductionEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).not.toThrow();
    expect(() =>
      assertRuntimeProductionEnv({ NODE_ENV: "production", npm_lifecycle_event: "build" }),
    ).not.toThrow();
  });

  it("fails fast when required production variables are missing", () => {
    expect(() => assertRuntimeProductionEnv({ NODE_ENV: "production" })).toThrow(
      /PRODUCTION_ENV_INVALID:AUTH_SECRET,DATABASE_URL,DB_DRIVER,SECRET_ENCRYPTION_KEY,APP_URL/u,
    );
  });

  it("rejects sqlite as the production database driver", () => {
    expect(() =>
      assertRuntimeProductionEnv({
        ...validProduction,
        DB_DRIVER: "sqlite",
        DATABASE_URL: "./appdata/dashboard.sqlite",
      }),
    ).toThrow(/PRODUCTION_ENV_INVALID:DB_DRIVER/u);
  });

  it("accepts a valid production runtime without optional OIDC or Redis", () => {
    expect(() => assertRuntimeProductionEnv(validProduction)).not.toThrow();
  });
});
