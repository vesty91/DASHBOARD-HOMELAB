import { describe, expect, it } from "vitest";
import {
  IntegrationError,
  MemoryIntegrationCache,
  MemorySafeActionInFlightGuard,
  MemorySafeActionRateLimiter,
  createIntegrationRegistry,
  type EncryptedSecretRow,
  type IntegrationRecord,
  type IntegrationStore,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { createEnvKeyring, encryptSecret, type SecretKeyring } from "@dashboard/secrets";
import { seerrIntegrationDefinition } from "./definition";
import { MemorySeerrOverviewCoalescer } from "./overview-coalescer";
import { MemorySeerrRefreshRateLimiter } from "./rate-limiter";
import { MemorySeerrRefreshFence } from "./refresh-fence";
import { createSeerrService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "notareal-seerr-apikey-0123456789";

const systemAdmin = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: true },
};

function actor(permissions: readonly string[]) {
  return {
    userId: "00000000-0000-4000-8000-000000000099",
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: [...permissions],
    },
  };
}

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 4 };
}

function createMemoryStore(): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "seerr",
    name: "Seerr",
    baseUrl: "https://seerr.lab:5055/",
    enabled: true,
    config: { verifyTls: true, timeoutMs: 8000 },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const rows = new Map<string, IntegrationRecord>([[row.id, row]]);
  const secrets: EncryptedSecretRow[] = [
    {
      key: "apiKey",
      ...encryptSecret(keyring, {
        integrationId: row.id,
        key: "apiKey",
        plaintext: API_KEY,
      }),
    },
  ];
  return {
    keyring,
    store: {
      async list(limit, cursor) {
        const all = [...rows.values()].sort((left, right) => left.id.localeCompare(right.id));
        const filtered = cursor ? all.filter((item) => item.id > cursor) : all;
        return filtered.slice(0, limit);
      },
      async findById(id) {
        return rows.get(id);
      },
      async create() {
        throw new Error("unused");
      },
      async update() {
        throw new Error("unused");
      },
      async delete() {
        return false;
      },
      async listSecretStates() {
        return secrets.map((item) => ({ key: item.key, configured: true as const }));
      },
      async loadEncryptedSecrets(id) {
        return rows.has(id) ? [...secrets] : [];
      },
      async upsertSecret() {},
      async upsertSecretIfRevision() {
        return false;
      },
      async deleteSecret() {
        return false;
      },
      async persistConnectionResult() {
        return true;
      },
    },
  };
}

function officialPayloads(request: SecureHttpRequest): SecureHttpResult {
  const pathname = new URL(String(request.url)).pathname;
  if (pathname === "/api/v1/status")
    return json({
      version: "2.5.0",
      commitTag: "abc123",
      updateAvailable: false,
    });
  if (request.method === "POST")
    return json({
      id: 12,
      status: 2,
      requestedBy: { email: "user@example.com", displayName: "Secret User" },
      media: { tmdbId: 337401, title: "Dune" },
      notes: "please add 4k privately",
    });
  return json({
    pending: 2,
    approved: 5,
    processing: 1,
    available: 8,
    movie: 9,
    tv: 7,
    declined: 3,
    total: 16,
  });
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
  extra: {
    actionRateLimiter?: MemorySafeActionRateLimiter;
  } = {},
) {
  return createSeerrService({
    store: store.store,
    registry: createIntegrationRegistry().register(seerrIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemorySeerrRefreshRateLimiter(),
    refreshFence: new MemorySeerrRefreshFence(),
    overviewCoalescer: new MemorySeerrOverviewCoalescer(),
    actionRateLimiter: extra.actionRateLimiter ?? new MemorySafeActionRateLimiter(),
    inFlight: new MemorySafeActionInFlightGuard(),
    keyring: store.keyring,
  });
}

describe("createSeerrService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.system.data?.version).toBe("2.5.0");
    expect(overview.system.data?.compatibleProduct).toBe("seerr-family");
    expect(overview.counts.data).toEqual({
      pending: 2,
      approved: 5,
      processing: 1,
      available: 8,
      total: 16,
    });
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
    expect(JSON.stringify(overview)).not.toContain("abc123");
    expect(JSON.stringify(overview)).not.toContain("movie");
  });

  it("requires integration.use and seerr.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(service.getOverview(INTEGRATION_ID, actor(["seerr.read"]))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(DEFAULT_ROLE_PERMISSIONS.ADMIN)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts the API key from unauthorized errors and caches the failure", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return json({ message: `denied ${API_KEY}` }, 401);
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(calls).toBe(2);
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
    }
  });

  it("reuses a cached overview and coalesces concurrent reads", async () => {
    let calls = 0;
    const service = serviceWith(async (options) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return officialPayloads(options);
    });
    const [first, second] = await Promise.all([
      service.getOverview(INTEGRATION_ID, systemAdmin),
      service.getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    expect(first.fetchedAt).toBe(second.fetchedAt);
    expect(calls).toBe(2);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(2);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemorySeerrRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createSeerrService({
      store: store.store,
      registry: createIntegrationRegistry().register(seerrIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemorySeerrRefreshFence(),
      overviewCoalescer: new MemorySeerrOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("approves a request without returning users, titles or the API key", async () => {
    const paths: string[] = [];
    const service = serviceWith(async (options) => {
      paths.push(new URL(String(options.url)).pathname);
      expect(options.method).toBe("POST");
      expect(options.body).toBeUndefined();
      expect(new URL(String(options.url)).search).toBe("");
      return officialPayloads(options);
    });
    const result = await service.approveRequest(
      { integrationId: INTEGRATION_ID, requestId: 12 },
      actor(["integration.interact", "seerr.request.manage"]),
    );
    expect(result).toMatchObject({
      status: "success",
      action: "seerr.approve",
      resourceId: "request:12",
    });
    expect(paths[0]).toBe("/api/v1/request/12/approve");
    expect(JSON.stringify(result)).not.toContain("user@example.com");
    expect(JSON.stringify(result)).not.toContain("Secret User");
    expect(JSON.stringify(result)).not.toContain("Dune");
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("declines a request and denies read-only, manage-only, and manage without interact", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const result = await service.declineRequest(
      { integrationId: INTEGRATION_ID, requestId: 12 },
      actor(["integration.interact", "seerr.request.manage"]),
    );
    expect(result.action).toBe("seerr.decline");
    expect(result.resourceId).toBe("request:12");
    await expect(
      service.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.use", "seerr.read"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.manage"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.use", "seerr.request.manage"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects invalid ids, stale config, rate limits and maps 401 without leaking secrets", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 0 },
        actor(["integration.interact", "seerr.request.manage"]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 12, expectedConfigRevision: 9 },
        actor(["integration.interact", "seerr.request.manage"]),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const limiter = new MemorySafeActionRateLimiter(1, 60_000, () => 1_000);
    const limited = serviceWith(async (options) => officialPayloads(options), createMemoryStore(), {
      actionRateLimiter: limiter,
    });
    await limited.approveRequest(
      { integrationId: INTEGRATION_ID, requestId: 12 },
      actor(["integration.interact", "seerr.request.manage"]),
    );
    await expect(
      limited.approveRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.interact", "seerr.request.manage"]),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const unauthorized = serviceWith(async () => json({ message: `denied ${API_KEY} Dune` }, 401));
    await expect(
      unauthorized.declineRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.interact", "seerr.request.manage"]),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    try {
      await unauthorized.declineRequest(
        { integrationId: INTEGRATION_ID, requestId: 12 },
        actor(["integration.interact", "seerr.request.manage"]),
      );
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
      expect(JSON.stringify(error)).not.toContain("Dune");
    }
  });
});
