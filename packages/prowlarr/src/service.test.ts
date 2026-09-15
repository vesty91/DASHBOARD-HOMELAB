import { describe, expect, it } from "vitest";
import {
  IntegrationError,
  MemoryIntegrationCache,
  createIntegrationRegistry,
  type EncryptedSecretRow,
  type IntegrationRecord,
  type IntegrationStore,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { createEnvKeyring, encryptSecret, type SecretKeyring } from "@dashboard/secrets";
import { prowlarrIntegrationDefinition } from "./definition";
import { MemoryProwlarrOverviewCoalescer } from "./overview-coalescer";
import { MemoryProwlarrRefreshRateLimiter } from "./rate-limiter";
import { MemoryProwlarrRefreshFence } from "./refresh-fence";
import { createProwlarrService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "notareal-prowlarr-apikey-0123456789";

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
    type: "prowlarr",
    name: "Prowlarr",
    baseUrl: "https://prowlarr.lab:9696/",
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
  if (pathname === "/api/v1/system/status")
    return json({ version: "1.32.2.4987", appName: "Prowlarr", startupPath: "/opt/Prowlarr" });
  if (pathname === "/api/v1/health")
    return json([{ type: "error", message: "Indexer failed at /data/indexers" }]);
  if (pathname === "/api/v1/indexer")
    return json([
      { name: "Secret Tracker", enable: true, fields: [{ name: "apiKey", value: API_KEY }] },
    ]);
  return json([
    { indexerId: 1, name: "Secret Tracker", mostRecentFailure: "2026-09-14T00:00:00Z" },
  ]);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createProwlarrService({
    store: store.store,
    registry: createIntegrationRegistry().register(prowlarrIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryProwlarrRefreshRateLimiter(),
    refreshFence: new MemoryProwlarrRefreshFence(),
    overviewCoalescer: new MemoryProwlarrOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createProwlarrService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.system.data?.version).toBe("1.32.2.4987");
    expect(overview.indexer.data).toEqual({ count: 1, enabledCount: 1 });
    expect(overview.indexerStatus.data).toEqual({ count: 1 });
    expect(overview.health.data?.error).toBe(1);
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
    expect(JSON.stringify(overview)).not.toContain("Secret Tracker");
    expect(JSON.stringify(overview)).not.toContain("/data/indexers");
    expect(JSON.stringify(overview)).not.toContain("/opt/Prowlarr");
  });

  it("requires integration.use and prowlarr.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["prowlarr.read"])),
    ).rejects.toMatchObject({
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
    expect(calls).toBe(4);
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
    expect(calls).toBe(4);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(4);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryProwlarrRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createProwlarrService({
      store: store.store,
      registry: createIntegrationRegistry().register(prowlarrIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryProwlarrRefreshFence(),
      overviewCoalescer: new MemoryProwlarrOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
