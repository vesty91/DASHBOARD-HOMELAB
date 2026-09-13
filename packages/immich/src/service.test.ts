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
import { createEnvKeyring, encryptSecret, type SecretKeyring } from "@dashboard/secrets";
import { immichIntegrationDefinition } from "./definition";
import { MemoryImmichOverviewCoalescer } from "./overview-coalescer";
import { MemoryImmichRefreshRateLimiter } from "./rate-limiter";
import { MemoryImmichRefreshFence } from "./refresh-fence";
import { createImmichService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "IM-API-SUPER-SECRET";

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

function createMemoryStore(extra: readonly IntegrationRecord[] = []): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "immich",
    name: "Photos",
    baseUrl: "https://immich.lab/",
    enabled: true,
    config: { verifyTls: true, timeoutMs: 8000 },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const rows = new Map<string, IntegrationRecord>([
    [row.id, row],
    ...extra.map((entry) => [entry.id, entry] as const),
  ]);
  const secrets: EncryptedSecretRow[] = [
    {
      key: "apiKey",
      ...encryptSecret(keyring, { integrationId: row.id, key: "apiKey", plaintext: API_KEY }),
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
  if (pathname === "/api/server/version") return json({ major: 1, minor: 142, patch: 3 });
  if (pathname === "/api/server/about") return json({ version: "v1.142.3", licensed: false });
  if (pathname === "/api/server/ping") return json({ res: "pong" });
  if (pathname === "/api/server/storage")
    return json({
      diskSizeRaw: 1000,
      diskUseRaw: 250,
      diskAvailableRaw: 750,
      diskUsagePercentage: 25,
    });
  if (pathname === "/api/server/statistics") return json({ photos: 8, videos: 1, usage: 99 });
  return json({}, 404);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createImmichService({
    store: store.store,
    registry: createIntegrationRegistry().register(immichIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryImmichRefreshRateLimiter(),
    refreshFence: new MemoryImmichRefreshFence(),
    overviewCoalescer: new MemoryImmichOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createImmichService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.stats.data?.photos).toBe(8);
    expect(overview.health.data?.ok).toBe(true);
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
  });

  it("requires integration.use and immich.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(service.getOverview(INTEGRATION_ID, actor(["immich.read"]))).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts the API key from unauthorized errors", async () => {
    const service = serviceWith(async () => json({ message: `denied ${API_KEY}` }, 401));
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
    }
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryImmichRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createImmichService({
      store: store.store,
      registry: createIntegrationRegistry().register(immichIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryImmichRefreshFence(),
      overviewCoalescer: new MemoryImmichOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("lists Immich integrations beyond the first store page", async () => {
    const extra = Array.from({ length: 201 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      type: "docker",
      name: `Docker ${index}`,
      baseUrl: "http://127.0.0.1:2375",
      enabled: true,
      config: {},
      status: "unknown" as const,
      lastCheckedAt: null,
      configRevision: 1,
      createdBy: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
    const store = createMemoryStore(extra);
    const firstPage = await store.store.list(200);
    expect(firstPage.some((record) => record.type === "immich")).toBe(false);
    const service = serviceWith(async (options) => officialPayloads(options), store);
    await expect(service.listIntegrations(systemAdmin)).resolves.toEqual([
      { id: INTEGRATION_ID, name: "Photos", enabled: true },
    ]);
  });
});
