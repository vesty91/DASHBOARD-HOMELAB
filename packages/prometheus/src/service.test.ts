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
import { prometheusIntegrationDefinition } from "./definition";
import { MemoryPrometheusOverviewCoalescer } from "./overview-coalescer";
import { MemoryPrometheusRefreshRateLimiter } from "./rate-limiter";
import { MemoryPrometheusRefreshFence } from "./refresh-fence";
import { createPrometheusService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "PROM-BEARER-SUPER-SECRET";

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
  return {
    ok: true,
    status,
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
    latencyMs: 4,
  };
}

function official(): SecureHttpResult {
  return json({
    status: "success",
    data: {
      resultType: "vector",
      result: [{ metric: { __name__: "up", job: "prometheus" }, value: [1_700_000_000, "1"] }],
    },
  });
}

function createMemoryStore(
  extra: readonly IntegrationRecord[] = [],
  withSecret = true,
): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "prometheus",
    name: "Prometheus",
    baseUrl: "http://prometheus.lab:9090/",
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
  const secrets: EncryptedSecretRow[] = withSecret
    ? [
        {
          key: "bearerToken",
          ...encryptSecret(keyring, {
            integrationId: row.id,
            key: "bearerToken",
            plaintext: TOKEN,
          }),
        },
      ]
    : [];
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

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
  extras: {
    cache?: MemoryIntegrationCache;
    fence?: MemoryPrometheusRefreshFence;
    coalescer?: MemoryPrometheusOverviewCoalescer;
    limiter?: MemoryPrometheusRefreshRateLimiter;
  } = {},
) {
  return createPrometheusService({
    store: store.store,
    registry: createIntegrationRegistry().register(prometheusIntegrationDefinition),
    cache: extras.cache ?? new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: extras.limiter ?? new MemoryPrometheusRefreshRateLimiter(),
    refreshFence: extras.fence ?? new MemoryPrometheusRefreshFence(),
    overviewCoalescer: extras.coalescer ?? new MemoryPrometheusOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createPrometheusService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async () => official());
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.series[0]?.labels.__name__).toBe("up");
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
  });

  it("requires integration.use and prometheus.read together", async () => {
    const service = serviceWith(async () => official());
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["prometheus.read"])),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts the bearer token from unauthorized errors and caches the failure", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return json(`denied ${TOKEN}`, 401);
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(calls).toBe(1);
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }
  });

  it("serves a second getOverview from cache without another fetch", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return official();
    });
    const first = await service.getOverview(INTEGRATION_ID, systemAdmin);
    const second = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(first.fetchedAt).toBe(second.fetchedAt);
    expect(calls).toBe(1);
  });

  it("does not reuse cache after the integration configRevision changes", async () => {
    let calls = 0;
    const store = createMemoryStore();
    const cache = new MemoryIntegrationCache();
    const service = serviceWith(
      async () => {
        calls += 1;
        return official();
      },
      store,
      { cache },
    );
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    const record = await store.store.findById(INTEGRATION_ID);
    if (!record) throw new Error("missing prometheus record");
    const mutable = record as { configRevision: number };
    mutable.configRevision = 2;
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(calls).toBe(2);
  });

  it("uses distinct cache entries for distinct validated queries", async () => {
    const paths: string[] = [];
    const service = serviceWith(async (options) => {
      paths.push(new URL(String(options.url)).pathname);
      return official();
    });
    await service.queryInstant({ integrationId: INTEGRATION_ID, query: "up" }, systemAdmin);
    await service.queryInstant({ integrationId: INTEGRATION_ID, query: "up == 1" }, systemAdmin);
    expect(paths).toHaveLength(2);
  });

  it("rejects an oversized query before calling Prometheus", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return official();
    });
    await expect(
      service.queryInstant({ integrationId: INTEGRATION_ID, query: "a".repeat(513) }, systemAdmin),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(calls).toBe(0);
  });

  it("coalesces concurrent overview reads", async () => {
    let calls = 0;
    const coalescer = new MemoryPrometheusOverviewCoalescer();
    const cache = new MemoryIntegrationCache();
    const fence = new MemoryPrometheusRefreshFence();
    const store = createMemoryStore();
    const service = serviceWith(
      async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return official();
      },
      store,
      { cache, fence, coalescer },
    );
    const [first, second] = await Promise.all([
      service.getOverview(INTEGRATION_ID, systemAdmin),
      service.getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    expect(first.fetchedAt).toBe(second.fetchedAt);
    expect(calls).toBe(1);
  });

  it("advances the fence on refresh so a later get is not the pre-refresh cache", async () => {
    let calls = 0;
    const cache = new MemoryIntegrationCache();
    const fence = new MemoryPrometheusRefreshFence();
    const service = serviceWith(
      async () => {
        calls += 1;
        return official();
      },
      createMemoryStore(),
      { cache, fence },
    );
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(calls).toBe(2);
    expect(fence.current(INTEGRATION_ID)).toBe(1);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryPrometheusRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createPrometheusService({
      store: store.store,
      registry: createIntegrationRegistry().register(prometheusIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async () => official(),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryPrometheusRefreshFence(),
      overviewCoalescer: new MemoryPrometheusOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("lists Prometheus integrations beyond the first store page", async () => {
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
    expect(firstPage.some((record) => record.type === "prometheus")).toBe(false);
    const service = serviceWith(async () => official(), store);
    await expect(service.listIntegrations(systemAdmin)).resolves.toEqual([
      { id: INTEGRATION_ID, name: "Prometheus", enabled: true },
    ]);
  });

  it("runs without a configured bearer token", async () => {
    const store = createMemoryStore([], false);
    const service = serviceWith(async () => official(), store);
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).resolves.toMatchObject({
      status: "available",
    });
  });
});
