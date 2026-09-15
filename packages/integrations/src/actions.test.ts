import { describe, expect, it } from "vitest";
import { MemoryIntegrationCache } from "./cache";
import { IntegrationError } from "./errors";
import {
  assertAllowlistedRequest,
  assertSafeActionHttpMethod,
  joinAllowlistedPath,
} from "./action-policy";
import {
  MemorySafeActionInFlightGuard,
  MemorySafeActionRateLimiter,
  safeActionRateKey,
} from "./action-rate-limiter";
import {
  assertSafeIntegrationActionAccess,
  createSafeActionResult,
  runSafeIntegrationAction,
  safeActionAuditMetadata,
  throwFromExternalHttpStatus,
} from "./actions";
import type { IntegrationActor } from "./types";
import type { Permission } from "@dashboard/permissions";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

function actor(permissions: readonly Permission[], userId = "user-1"): IntegrationActor {
  return {
    userId,
    subject: { status: "active", isSystemAdmin: false, directPermissions: permissions },
  };
}

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error("expected IntegrationError");
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

async function expectAsyncCode(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
    throw new Error("expected IntegrationError");
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

const operator = actor(["integration.interact", "docker.start"]);

async function run(overrides: Partial<Parameters<typeof runSafeIntegrationAction>[0]> = {}) {
  return runSafeIntegrationAction({
    actor: operator,
    action: "docker.start",
    actionPermissions: ["docker.start"],
    integrationId: INTEGRATION_ID,
    expectedType: "docker",
    loadedType: "docker",
    resourceId: "a".repeat(64),
    rateLimiter: new MemorySafeActionRateLimiter(10, 60_000, () => 1_000),
    execute: async () => "success",
    ...overrides,
  });
}

describe("safe integration action policy", () => {
  it("builds paths from validated segments and rejects traversal", () => {
    expect(joinAllowlistedPath(["api", "nodes", "pve", "qemu", "100", "status", "start"])).toBe(
      "/api/nodes/pve/qemu/100/status/start",
    );
    expect(() => joinAllowlistedPath([".."])).toThrow(/Invalid path segment/);
    expect(() => joinAllowlistedPath(["foo/bar"])).toThrow(/Invalid path segment/);
  });

  it("allowlists POST exactly and rejects GET mutations", () => {
    const allowed = [{ method: "POST" as const, pathname: "/api/nodes/pve/qemu/100/status/start" }];
    expect(() =>
      assertAllowlistedRequest(
        { method: "POST", pathname: "/api/nodes/pve/qemu/100/status/start" },
        allowed,
      ),
    ).not.toThrow();
    expect(() => assertSafeActionHttpMethod("GET")).toThrow(/must use POST/);
    expectCode(
      () =>
        assertAllowlistedRequest(
          { method: "GET", pathname: "/api/nodes/pve/qemu/100/status/start" },
          allowed,
        ),
      "FORBIDDEN",
    );
    expectCode(
      () =>
        assertAllowlistedRequest(
          { method: "POST", pathname: "/api/nodes/pve/qemu/100/status/start", search: "t=1" },
          allowed,
        ),
      "FORBIDDEN",
    );
    expectCode(
      () =>
        assertAllowlistedRequest(
          { method: "POST", pathname: "/api/nodes/pve/qemu/100/delete" },
          allowed,
        ),
      "FORBIDDEN",
    );
  });
});

describe("safe integration action access", () => {
  it("requires an authenticated session", () => {
    expectCode(
      () => assertSafeIntegrationActionAccess({ userId: null, subject: null }, ["docker.start"]),
      "UNAUTHORIZED",
    );
  });

  it("does not grant actions from read permissions or integration.manage alone", () => {
    expectCode(
      () =>
        assertSafeIntegrationActionAccess(actor(["integration.interact", "docker.read"]), [
          "docker.start",
        ]),
      "FORBIDDEN",
    );
    expectCode(
      () => assertSafeIntegrationActionAccess(actor(["integration.manage"]), ["docker.start"]),
      "FORBIDDEN",
    );
    expectCode(
      () => assertSafeIntegrationActionAccess(actor(["docker.start"]), ["docker.start"]),
      "FORBIDDEN",
    );
    expectCode(
      () =>
        assertSafeIntegrationActionAccess(actor(["integration.use", "docker.start"]), [
          "docker.start",
        ]),
      "FORBIDDEN",
    );
    expect(() => assertSafeIntegrationActionAccess(operator, ["docker.start"])).not.toThrow();
  });
});

describe("runSafeIntegrationAction", () => {
  it("returns a secret-free DTO and invalidates cache after success", async () => {
    const cache = new MemoryIntegrationCache();
    cache.set(INTEGRATION_ID, "overview", { token: "secret-token" });
    let published = 0;
    const result = await run({
      cache,
      publish: async () => {
        published += 1;
      },
    });
    expect(result).toEqual({
      status: "success",
      action: "docker.start",
      resourceId: "a".repeat(64),
      occurredAt: result.occurredAt,
    });
    expect(JSON.stringify(result)).not.toMatch(/secret-token|password|Authorization/iu);
    expect(cache.get(INTEGRATION_ID, "overview")).toBeUndefined();
    expect(published).toBe(1);
    expect(createSafeActionResult(result)).toEqual(result);
  });

  it("does not invent success, leak secrets, or publish on failure", async () => {
    const cache = new MemoryIntegrationCache();
    cache.set(INTEGRATION_ID, "overview", { v: 1 });
    let published = 0;
    await expectAsyncCode(
      () =>
        run({
          cache,
          publish: async () => {
            published += 1;
          },
          execute: async () => {
            throwFromExternalHttpStatus(500);
          },
        }),
      "INVALID_RESPONSE",
    );
    expect(cache.get(INTEGRATION_ID, "overview")).toEqual({ v: 1 });
    expect(published).toBe(0);
    await expectAsyncCode(
      () =>
        run({
          execute: async () => {
            throwFromExternalHttpStatus(401);
          },
        }),
      "UNAUTHORIZED",
    );
    await expectAsyncCode(
      () =>
        run({
          execute: async () => {
            throwFromExternalHttpStatus(403);
          },
        }),
      "FORBIDDEN",
    );
    await expectAsyncCode(
      () =>
        run({
          execute: async () => {
            throw new IntegrationError("TIMEOUT", "timed out");
          },
        }),
      "TIMEOUT",
    );
    const failed = await run({ execute: async () => "failed" });
    expect(failed.status).toBe("failed");
    expect(cache.get(INTEGRATION_ID, "overview")).toEqual({ v: 1 });
  });

  it("rejects the wrong integration type, malformed ids, stale config and rate limits", async () => {
    await expectAsyncCode(() => run({ loadedType: "proxmox" }), "FORBIDDEN");
    await expectAsyncCode(() => run({ resourceId: "bad id" }), "VALIDATION_ERROR");
    await expectAsyncCode(
      () => run({ expectedConfigRevision: 2, currentConfigRevision: 1 }),
      "CONFLICT",
    );
    const limiter = new MemorySafeActionRateLimiter(1, 60_000, () => 5_000);
    await expect(run({ rateLimiter: limiter })).resolves.toMatchObject({ status: "success" });
    await expectAsyncCode(() => run({ rateLimiter: limiter }), "RATE_LIMITED");
    expect(safeActionRateKey("user-1", INTEGRATION_ID, "docker.start")).toBe(
      `docker.start:${INTEGRATION_ID}:user-1`,
    );
  });

  it("blocks overlapping double-submit on the same resource", async () => {
    const inflight = new MemorySafeActionInFlightGuard();
    let releaseFirst: () => void = () => undefined;
    let markEntered: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const enteredGate = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const first = run({
      inFlight: inflight,
      execute: async () => {
        markEntered();
        await firstGate;
        return "success";
      },
    });
    await enteredGate;
    await expectAsyncCode(() => run({ inFlight: inflight }), "CONFLICT");
    releaseFirst();
    await expect(first).resolves.toMatchObject({ status: "success" });
    await expect(run({ inFlight: inflight })).resolves.toMatchObject({ status: "success" });
  });

  it("redacts audit metadata to the safe allowlist", () => {
    const metadata = safeActionAuditMetadata({
      integrationId: INTEGRATION_ID,
      integrationType: "docker",
      action: "docker.start",
      resourceId: "abc",
      result: "success",
    });
    expect(metadata).toEqual({
      integrationId: INTEGRATION_ID,
      integrationType: "docker",
      action: "docker.start",
      resourceId: "abc",
      result: "success",
    });
    expect(JSON.stringify(metadata)).not.toMatch(/password|token|cookie|api[_-]?key/iu);
  });

  it("tags automation audit metadata without secrets", () => {
    const metadata = safeActionAuditMetadata({
      integrationId: INTEGRATION_ID,
      integrationType: "ntfy",
      action: "ntfy.publish",
      resourceId: "homelab",
      result: "success",
      source: "automation",
      automationId: INTEGRATION_ID,
      runId: INTEGRATION_ID,
    });
    expect(metadata.source).toBe("automation");
    expect(metadata.automationId).toBe(INTEGRATION_ID);
    expect(metadata.runId).toBe(INTEGRATION_ID);
    expect(JSON.stringify(metadata)).not.toMatch(/password|token|cookie|api[_-]?key/iu);
  });
});
