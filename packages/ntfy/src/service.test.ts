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
import { ntfyIntegrationDefinition } from "./definition";
import { MemoryNtfyOverviewCoalescer } from "./overview-coalescer";
import { MemoryNtfyRefreshRateLimiter } from "./rate-limiter";
import { MemoryNtfyRefreshFence } from "./refresh-fence";
import { createNtfyService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "tk_abcdefghijklmnop0123456789ABCDEF";

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

function createMemoryStore(
  options: { withToken?: boolean; extra?: readonly IntegrationRecord[] } = {},
): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "ntfy",
    name: "ntfy",
    baseUrl: "https://ntfy.lab/",
    enabled: true,
    config: { verifyTls: true, timeoutMs: 8000 },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const extra = options.extra ?? [];
  const rows = new Map<string, IntegrationRecord>([
    [row.id, row],
    ...extra.map((entry) => [entry.id, entry] as const),
  ]);
  const secrets: EncryptedSecretRow[] =
    options.withToken === false
      ? []
      : [
          {
            key: "accessToken",
            ...encryptSecret(keyring, {
              integrationId: row.id,
              key: "accessToken",
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
  if (pathname === "/v1/health") return json({ healthy: true });
  if (pathname === "/v1/stats") return json({ messages: 12, messages_rate: 0.5 });
  return json({ version: "2.11.0", commit: "deadbeef", date: "2026-01-01" });
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createNtfyService({
    store: store.store,
    registry: createIntegrationRegistry().register(ntfyIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryNtfyRefreshRateLimiter(),
    refreshFence: new MemoryNtfyRefreshFence(),
    overviewCoalescer: new MemoryNtfyOverviewCoalescer(),
    keyring: store.keyring,
  });
}

describe("createNtfyService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.health.data?.healthy).toBe(true);
    expect(overview.stats.data?.messages).toBe(12);
    expect(overview.version.data?.version).toBe("2.11.0");
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
    expect(JSON.stringify(overview)).not.toMatch(/topic|message body|publish/iu);
  });

  it("requires integration.use and ntfy.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(service.getOverview(INTEGRATION_ID, actor(["ntfy.read"]))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(DEFAULT_ROLE_PERMISSIONS.ADMIN)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("omits Authorization when no token is configured", async () => {
    const headers: Array<string | undefined> = [];
    const service = serviceWith(
      async (options) => {
        headers.push(options.headers?.Authorization);
        return officialPayloads(options);
      },
      createMemoryStore({ withToken: false }),
    );
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(headers).toEqual([undefined, undefined, undefined]);
  });

  it("redacts the access token from unauthorized errors and caches the failure", async () => {
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
    expect(calls).toBe(3);
    try {
      await service.getOverview(INTEGRATION_ID, systemAdmin);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
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
    expect(calls).toBe(3);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(3);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryNtfyRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createNtfyService({
      store: store.store,
      registry: createIntegrationRegistry().register(ntfyIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryNtfyRefreshFence(),
      overviewCoalescer: new MemoryNtfyOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
