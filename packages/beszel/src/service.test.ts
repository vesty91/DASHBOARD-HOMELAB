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
import { BESZEL_SYSTEMS_PER_PAGE } from "./client";
import { beszelIntegrationDefinition } from "./definition";
import { MemoryBeszelOverviewCoalescer } from "./overview-coalescer";
import { MemoryBeszelRefreshRateLimiter } from "./rate-limiter";
import { MemoryBeszelRefreshFence } from "./refresh-fence";
import { createBeszelService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const PASSWORD = "BZ-API-SUPER-SECRET";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload.sig";

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
    type: "beszel",
    name: "Hub",
    baseUrl: "https://beszel.lab/",
    enabled: true,
    config: { identity: "ops@lab.example", verifyTls: true, timeoutMs: 8000 },
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
      key: "password",
      ...encryptSecret(keyring, { integrationId: row.id, key: "password", plaintext: PASSWORD }),
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

function official(options: SecureHttpRequest): SecureHttpResult {
  if (options.method === "POST") return json({ token: TOKEN });
  return json({
    page: 1,
    perPage: BESZEL_SYSTEMS_PER_PAGE,
    totalPages: 1,
    items: [{ id: "sys1", name: "NAS", status: "up", info: { cpu: 9, mp: 11, dp: 13 } }],
  });
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createBeszelService({
    store: store.store,
    registry: createIntegrationRegistry().register(beszelIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryBeszelRefreshRateLimiter(),
    refreshFence: new MemoryBeszelRefreshFence(),
    overviewCoalescer: new MemoryBeszelOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createBeszelService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => official(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.hosts.data?.hosts[0]?.cpuPercent).toBe(9);
    expect(JSON.stringify(overview)).not.toContain(PASSWORD);
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
  });

  it("requires integration.use and beszel.read together", async () => {
    const service = serviceWith(async (options) => official(options));
    await expect(service.getOverview(INTEGRATION_ID, actor(["beszel.read"]))).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryBeszelRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createBeszelService({
      store: store.store,
      registry: createIntegrationRegistry().register(beszelIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => official(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryBeszelRefreshFence(),
      overviewCoalescer: new MemoryBeszelOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("lists Beszel integrations beyond the first store page", async () => {
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
    expect(firstPage.some((record) => record.type === "beszel")).toBe(false);
    const service = serviceWith(async (options) => official(options), store);
    await expect(service.listIntegrations(systemAdmin)).resolves.toEqual([
      { id: INTEGRATION_ID, name: "Hub", enabled: true },
    ]);
  });
});
