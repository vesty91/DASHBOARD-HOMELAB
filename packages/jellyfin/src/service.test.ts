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
import { jellyfinIntegrationDefinition } from "./definition";
import { MemoryJellyfinOverviewCoalescer } from "./overview-coalescer";
import { MemoryJellyfinRefreshRateLimiter } from "./rate-limiter";
import { MemoryJellyfinRefreshFence } from "./refresh-fence";
import { createJellyfinService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "JF-API-SUPER-SECRET";

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
    type: "jellyfin",
    name: "Media",
    baseUrl: "https://jellyfin.lab/",
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
        const filtered = cursor ? all.filter((row) => row.id > cursor) : all;
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
) {
  return createJellyfinService({
    store: store.store,
    registry: createIntegrationRegistry().register(jellyfinIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryJellyfinRefreshRateLimiter(),
    refreshFence: new MemoryJellyfinRefreshFence(),
    overviewCoalescer: new MemoryJellyfinOverviewCoalescer(),
    keyring: store.keyring,
  });
}

function officialPayloads(request: SecureHttpRequest): SecureHttpResult {
  if (new URL(String(request.url)).pathname === "/System/Info")
    return json({
      ServerName: "Home Lab",
      Version: "10.10.7",
      ProductName: "Jellyfin Server",
      OperatingSystem: "Linux",
      StartupWizardCompleted: true,
      HasPendingRestart: false,
    });
  return json([
    {
      Id: "sess-1",
      UserName: "alice",
      Client: "Infuse",
      DeviceName: "Apple TV",
      IsActive: true,
      NowPlayingItem: { Name: "Dune", Type: "Movie", ProductionYear: 2021 },
      PlayState: { IsPaused: false, PlayMethod: "DirectPlay" },
    },
  ]);
}

describe("createJellyfinService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.server.data?.version).toBe("10.10.7");
    expect(overview.sessions.data?.activeCount).toBe(1);
    expect(overview.sessions.data?.sessions[0]?.playbackMode).toBe("direct-play");
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
  });

  it("requires integration.use and jellyfin.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["jellyfin.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getIntegrationMetadata(INTEGRATION_ID, actor(["integration.read", "jellyfin.read"])),
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
    expect(calls).toBe(2);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryJellyfinRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createJellyfinService({
      store: store.store,
      registry: createIntegrationRegistry().register(jellyfinIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryJellyfinRefreshFence(),
      overviewCoalescer: new MemoryJellyfinOverviewCoalescer(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("lists Jellyfin integrations beyond the first store page", async () => {
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
    expect(firstPage.some((record) => record.type === "jellyfin")).toBe(false);
    const service = serviceWith(async (options) => officialPayloads(options), store);
    await expect(service.listIntegrations(systemAdmin)).resolves.toEqual([
      { id: INTEGRATION_ID, name: "Media", enabled: true },
    ]);
  });

  it("hides metadata from generic readers via restricted projection fields only", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const metadata = await service.getIntegrationMetadata(
      INTEGRATION_ID,
      actor(["integration.use", "jellyfin.read"]),
    );
    expect(metadata).toEqual({ id: INTEGRATION_ID, name: "Media", enabled: true });
    expect(Object.keys(metadata)).toEqual(["id", "name", "enabled"]);
  });
});
