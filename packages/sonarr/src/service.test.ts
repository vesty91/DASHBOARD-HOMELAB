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
import { sonarrIntegrationDefinition } from "./definition";
import { MemorySonarrOverviewCoalescer } from "./overview-coalescer";
import { MemorySonarrRefreshRateLimiter } from "./rate-limiter";
import { MemorySonarrRefreshFence } from "./refresh-fence";
import { createSonarrService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_KEY = "notareal-sonarr-apikey-0123456789";

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
    type: "sonarr",
    name: "Sonarr",
    baseUrl: "https://sonarr.lab:8989/",
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
  if (pathname === "/api/v3/system/status")
    return json({ version: "4.0.14.2939", appName: "Sonarr", startupPath: "/opt/Sonarr" });
  if (pathname === "/api/v3/health")
    return json([{ type: "error", message: "Indexer failed at /data/tv" }]);
  if (pathname === "/api/v3/queue/status") return json({ totalCount: 4, count: 2 });
  if (pathname === "/api/v3/series") return json([{ title: "Secret Show", path: "/data/tv" }]);
  if (request.method === "POST" && pathname === "/api/v3/command")
    return json({ id: 99, name: "RefreshSeries", series: { title: "Secret Show" } }, 201);
  return json([{ path: "/data", label: "tv", freeSpace: 100, totalSpace: 400 }]);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
  extra: {
    actionRateLimiter?: MemorySafeActionRateLimiter;
  } = {},
) {
  return createSonarrService({
    store: store.store,
    registry: createIntegrationRegistry().register(sonarrIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemorySonarrRefreshRateLimiter(),
    refreshFence: new MemorySonarrRefreshFence(),
    overviewCoalescer: new MemorySonarrOverviewCoalescer(),
    actionRateLimiter: extra.actionRateLimiter ?? new MemorySafeActionRateLimiter(),
    inFlight: new MemorySafeActionInFlightGuard(),
    keyring: store.keyring,
  });
}

describe("createSonarrService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.system.data?.version).toBe("4.0.14.2939");
    expect(overview.series.data?.count).toBe(1);
    expect(overview.queue.data?.totalCount).toBe(4);
    expect(overview.health.data?.error).toBe(1);
    expect(overview.diskSpace.data).toEqual({ freeBytes: 100, totalBytes: 400 });
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
    expect(JSON.stringify(overview)).not.toContain("Secret Show");
    expect(JSON.stringify(overview)).not.toContain("/data/tv");
    expect(JSON.stringify(overview)).not.toContain("/opt/Sonarr");
  });

  it("requires integration.use and sonarr.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(service.getOverview(INTEGRATION_ID, actor(["sonarr.read"]))).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
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
    expect(calls).toBe(5);
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
    expect(calls).toBe(5);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(5);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemorySonarrRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createSonarrService({
      store: store.store,
      registry: createIntegrationRegistry().register(sonarrIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemorySonarrRefreshFence(),
      overviewCoalescer: new MemorySonarrOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("queues RefreshSeries without returning titles or the API key", async () => {
    const bodies: string[] = [];
    const commandActor = actor(["integration.interact", "sonarr.command"]);
    const service = serviceWith(async (options) => {
      if (options.body) bodies.push(options.body);
      expect(options.method === "POST" ? new URL(String(options.url)).search : "").toBe(
        options.method === "POST" ? "" : "",
      );
      return officialPayloads(options);
    });
    const result = await service.refreshSeries(
      { integrationId: INTEGRATION_ID, seriesId: 12 },
      commandActor,
    );
    expect(result).toMatchObject({
      status: "accepted",
      action: "sonarr.refresh-series",
      resourceId: "series:12",
    });
    expect(bodies[0]).toBe('{"name":"RefreshSeries","seriesId":12}');
    expect(JSON.stringify(result)).not.toContain("Secret Show");
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("queues EpisodeSearch and denies read-only, manage-only, and command without interact", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const result = await service.searchEpisode(
      { integrationId: INTEGRATION_ID, episodeId: 34 },
      actor(["integration.interact", "sonarr.command"]),
    );
    expect(result.action).toBe("sonarr.search-episode");
    expect(result.resourceId).toBe("episode:34");
    await expect(
      service.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 12 },
        actor(["integration.use", "sonarr.read"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 12 },
        actor(["integration.manage"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 12 },
        actor(["integration.use", "sonarr.command"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects invalid ids, stale config, rate limits and maps 401 without leaking secrets", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 0 },
        actor(["integration.interact", "sonarr.command"]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 12, expectedConfigRevision: 9 },
        actor(["integration.interact", "sonarr.command"]),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const limiter = new MemorySafeActionRateLimiter(1, 60_000, () => 1_000);
    const limited = serviceWith(async (options) => officialPayloads(options), createMemoryStore(), {
      actionRateLimiter: limiter,
    });
    await limited.refreshSeries(
      { integrationId: INTEGRATION_ID, seriesId: 12 },
      actor(["integration.interact", "sonarr.command"]),
    );
    await expect(
      limited.refreshSeries(
        { integrationId: INTEGRATION_ID, seriesId: 12 },
        actor(["integration.interact", "sonarr.command"]),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const unauthorized = serviceWith(async () => json({ error: API_KEY }, 401));
    await expect(
      unauthorized.searchEpisode(
        { integrationId: INTEGRATION_ID, episodeId: 34 },
        actor(["integration.interact", "sonarr.command"]),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    try {
      await unauthorized.searchEpisode(
        { integrationId: INTEGRATION_ID, episodeId: 34 },
        actor(["integration.interact", "sonarr.command"]),
      );
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_KEY);
      expect(JSON.stringify(error)).not.toContain("Secret Show");
    }
  });
});
