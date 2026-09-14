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
import { grafanaIntegrationDefinition } from "./definition";
import { MemoryGrafanaOverviewCoalescer } from "./overview-coalescer";
import { MemoryGrafanaRefreshRateLimiter } from "./rate-limiter";
import { MemoryGrafanaRefreshFence } from "./refresh-fence";
import { createGrafanaService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "glsa_abcdefghijklmnop0123456789ABCDEF";

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
    type: "grafana",
    name: "Grafana",
    baseUrl: "https://grafana.lab:3000/",
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
      key: "serviceAccountToken",
      ...encryptSecret(keyring, {
        integrationId: row.id,
        key: "serviceAccountToken",
        plaintext: TOKEN,
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
  if (pathname === "/api/health") return json({ database: "ok", version: "11.2.0" });
  if (pathname === "/api/search")
    return json([{ title: "Secret dashboard", url: "/d/abc/secret", type: "dash-db" }]);
  if (pathname === "/api/folders") return json([{ title: "Private folder" }]);
  if (pathname === "/api/prometheus/grafana/api/v1/alerts")
    return json({
      status: "success",
      data: { alerts: [{ state: "firing", labels: { alertname: "InstanceDown" } }] },
    });
  return json([
    {
      name: "Prometheus",
      type: "prometheus",
      url: "http://prometheus.internal:9090",
      password: TOKEN,
    },
  ]);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createGrafanaService({
    store: store.store,
    registry: createIntegrationRegistry().register(grafanaIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryGrafanaRefreshRateLimiter(),
    refreshFence: new MemoryGrafanaRefreshFence(),
    overviewCoalescer: new MemoryGrafanaOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createGrafanaService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.health.data?.version).toBe("11.2.0");
    expect(overview.dashboards.data?.count).toBe(1);
    expect(overview.alerts.data?.firing).toBe(1);
    expect(overview.datasources.data?.count).toBe(1);
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
    expect(JSON.stringify(overview)).not.toContain("Secret dashboard");
    expect(JSON.stringify(overview)).not.toContain("prometheus.internal");
  });

  it("requires integration.use and grafana.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["grafana.read"])),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts the service account token from unauthorized errors and caches the failure", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return json({ message: `denied ${TOKEN}` }, 401);
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(calls).toBe(5);
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }
  });

  it("coalesces concurrent overview reads", async () => {
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
    expect(calls).toBe(5);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryGrafanaRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createGrafanaService({
      store: store.store,
      registry: createIntegrationRegistry().register(grafanaIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryGrafanaRefreshFence(),
      overviewCoalescer: new MemoryGrafanaOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
