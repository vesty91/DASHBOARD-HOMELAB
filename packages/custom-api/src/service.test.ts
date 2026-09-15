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
import { customApiIntegrationDefinition } from "./definition";
import { MemoryCustomApiOverviewCoalescer } from "./overview-coalescer";
import { MemoryCustomApiRefreshRateLimiter } from "./rate-limiter";
import { MemoryCustomApiRefreshFence } from "./refresh-fence";
import { createCustomApiService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "notareal-custom-api-secret-0123456789";

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

function createMemoryStore(options?: { includeApiKeyHeader?: boolean; includeApiKey?: boolean }): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const includeApiKeyHeader = options?.includeApiKeyHeader !== false;
  const includeApiKey = options?.includeApiKey !== false;
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "custom-api",
    name: "API Lab",
    baseUrl: "https://api.lab:8443/",
    enabled: true,
    config: {
      verifyTls: true,
      timeoutMs: 8000,
      ...(includeApiKeyHeader ? { apiKeyHeader: "X-Api-Key" } : {}),
      endpoints: [{ key: "status", label: "Status", path: "/status" }],
    },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const rows = new Map<string, IntegrationRecord>([[row.id, row]]);
  const secrets: EncryptedSecretRow[] = includeApiKey
    ? [
        {
          key: "apiKey",
          ...encryptSecret(keyring, {
            integrationId: row.id,
            key: "apiKey",
            plaintext: API_KEY,
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
  limiter = new MemoryCustomApiRefreshRateLimiter(),
) {
  return createCustomApiService({
    store: store.store,
    registry: createIntegrationRegistry().register(customApiIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: limiter,
    refreshFence: new MemoryCustomApiRefreshFence(),
    overviewCoalescer: new MemoryCustomApiOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createCustomApiService", () => {
  it("returns a sanitized value for a reader", async () => {
    const service = serviceWith(async () => json({ data: { n: 4, secret: API_KEY } }));
    const result = await service.getValue(
      {
        integrationId: INTEGRATION_ID,
        endpointKey: "status",
        jsonPath: "data.n",
        display: "number",
      },
      systemAdmin,
    );
    expect(result.value.data).toEqual({ display: "number", number: 4 });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("requires integration.use and custom-api.read together", async () => {
    const service = serviceWith(async () => json({ ok: true }));
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["custom-api.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.refreshOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(DEFAULT_ROLE_PERMISSIONS.ADMIN)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts secrets from unauthorized errors and caches the failure", async () => {
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
    expect(calls).toBe(1);
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
    }
  });

  it("reuses a cached overview and coalesces concurrent reads", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json({ ok: true });
    });
    const [first, second] = await Promise.all([
      service.getOverview(INTEGRATION_ID, systemAdmin),
      service.getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    expect(first.fetchedAt).toBe(second.fetchedAt);
    expect(calls).toBe(1);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(1);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryCustomApiRefreshRateLimiter(1, 60_000, () => 1_000);
    const service = serviceWith(async () => json({ ok: true }), createMemoryStore(), limiter);
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("rejects an API key without apiKeyHeader", async () => {
    const service = serviceWith(
      async () => json({ ok: true }),
      createMemoryStore({ includeApiKeyHeader: false, includeApiKey: true }),
    );
    await expect(service.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "MISCONFIGURED",
    });
  });
});
