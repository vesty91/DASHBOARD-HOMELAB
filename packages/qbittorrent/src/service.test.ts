import { describe, expect, it, vi } from "vitest";
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
import { qbittorrentIntegrationDefinition } from "./definition";
import { MemoryQbittorrentOverviewCoalescer } from "./overview-coalescer";
import { MemoryQbittorrentRefreshRateLimiter } from "./rate-limiter";
import { MemoryQbittorrentRefreshFence } from "./refresh-fence";
import { createQbittorrentService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const DOCKER_ID = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 9).toString("base64");
const USERNAME = "admin";
const PASSWORD = "correct-horse-battery-staple";
const SID = "QB-SID-SUPER-SECRET-001";
const HASH = "8c212779b4abde7c6bc608063a0d008b7e40ce32";
const ACTION = { integrationId: INTEGRATION_ID, hashes: [HASH] };

const systemAdmin = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: true },
};

function actorFor(permissions: readonly string[]) {
  return {
    userId: "00000000-0000-4000-8000-000000000099",
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: [...permissions],
    },
  };
}

const torrentActor = actorFor(["integration.interact", "qbittorrent.pause", "qbittorrent.resume"]);

function text(body: string, status = 200, setCookie?: readonly string[]): SecureHttpResult {
  return {
    ok: true,
    status,
    body: Buffer.from(body),
    latencyMs: 4,
    ...(setCookie === undefined ? {} : { setCookie }),
  };
}

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 4 };
}

function createMemoryStore(extra: IntegrationRecord[] = []): {
  store: IntegrationStore;
  keyring: SecretKeyring;
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "qbittorrent",
    name: "qBittorrent",
    baseUrl: "https://qbittorrent.lab:8080/",
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
    ...extra.map((item) => [item.id, item] as const),
  ]);
  const secrets: EncryptedSecretRow[] = [
    {
      key: "username",
      ...encryptSecret(keyring, {
        integrationId: row.id,
        key: "username",
        plaintext: USERNAME,
      }),
    },
    {
      key: "password",
      ...encryptSecret(keyring, {
        integrationId: row.id,
        key: "password",
        plaintext: PASSWORD,
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
  if (pathname === "/api/v2/auth/login") return text("Ok.", 200, [`SID=${SID}; Path=/`]);
  if (pathname === "/api/v2/auth/logout") return text("Ok.");
  if (pathname === "/api/v2/app/version") return text(`v4.6.5-${PASSWORD}`);
  if (pathname === "/api/v2/transfer/info")
    return json({ dl_info_speed: 100, up_info_speed: 20, connection_status: "firewalled" });
  if (
    pathname === "/api/v2/torrents/stop" ||
    pathname === "/api/v2/torrents/start" ||
    pathname === "/api/v2/torrents/pause" ||
    pathname === "/api/v2/torrents/resume"
  )
    return text("Ok.");
  return json([{ name: "Secret.Movie", hash: SID, state: "downloading" }]);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
  extras: {
    cache?: MemoryIntegrationCache;
    actionRateLimiter?: MemorySafeActionRateLimiter;
    inFlight?: MemorySafeActionInFlightGuard;
    publish?: (integrationId: string) => Promise<void>;
  } = {},
) {
  return createQbittorrentService({
    store: store.store,
    registry: createIntegrationRegistry().register(qbittorrentIntegrationDefinition),
    cache: extras.cache ?? new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryQbittorrentRefreshRateLimiter(),
    refreshFence: new MemoryQbittorrentRefreshFence(),
    overviewCoalescer: new MemoryQbittorrentOverviewCoalescer(),
    actionRateLimiter: extras.actionRateLimiter ?? new MemorySafeActionRateLimiter(),
    inFlight: extras.inFlight ?? new MemorySafeActionInFlightGuard(),
    ...(extras.publish ? { publish: extras.publish } : {}),
    keyring: store.keyring,
  });
}

describe("createQbittorrentService", () => {
  it("returns a sanitized overview for a reader without the SID or password", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      }),
    );
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.version.data?.version).toBe("v4.6.5-[REDACTED]");
    expect(overview.transfer.data).toEqual({
      downloadSpeedBps: 100,
      uploadSpeedBps: 20,
      connectionStatus: "firewalled",
    });
    expect(overview.torrents.data?.downloading).toBe(1);
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain(SID);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("Secret.Movie");
    expect(logs.join("\n")).not.toContain(SID);
    expect(logs.join("\n")).not.toContain(PASSWORD);
    for (const spy of spies) spy.mockRestore();
  });

  it("requires integration.use and qbittorrent.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.getOverview(INTEGRATION_ID, actorFor(["qbittorrent.read"])),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actorFor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.getOverview(INTEGRATION_ID, actorFor(DEFAULT_ROLE_PERMISSIONS.ADMIN)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts credentials from unauthorized errors and caches the failure", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return text(`denied ${PASSWORD} ${SID}`, 401);
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
      expect(JSON.stringify(error)).not.toContain(PASSWORD);
      expect(JSON.stringify(error)).not.toContain(SID);
    }
  });

  it("reuses a cached overview without caching the SID", async () => {
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
    expect(JSON.stringify(first)).not.toContain(SID);
    const third = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(third.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBeLessThanOrEqual(8);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryQbittorrentRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = createQbittorrentService({
      store: store.store,
      registry: createIntegrationRegistry().register(qbittorrentIntegrationDefinition),
      cache: new MemoryIntegrationCache(),
      request: async (options) => officialPayloads(options),
      refreshRateLimiter: limiter,
      refreshFence: new MemoryQbittorrentRefreshFence(),
      overviewCoalescer: new MemoryQbittorrentOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("pauses and resumes selected hashes via v5 stop/start without listing names", async () => {
    const paths: string[] = [];
    const bodies: string[] = [];
    const service = serviceWith(async (options) => {
      const pathname = new URL(String(options.url)).pathname;
      paths.push(`${options.method ?? "GET"} ${pathname}`);
      if (options.body) bodies.push(String(options.body));
      expect(new URL(String(options.url)).search).toBe("");
      return officialPayloads(options);
    });
    await expect(service.pauseTorrents(ACTION, torrentActor)).resolves.toMatchObject({
      status: "accepted",
      action: "qbittorrent.pause",
      resourceId: HASH,
    });
    await expect(service.resumeTorrents(ACTION, torrentActor)).resolves.toMatchObject({
      status: "accepted",
      action: "qbittorrent.resume",
      resourceId: HASH,
    });
    expect(paths).toContain("POST /api/v2/torrents/stop");
    expect(paths).toContain("POST /api/v2/torrents/start");
    expect(bodies.some((body) => body.includes(`hashes=${HASH}`))).toBe(true);
    expect(bodies.join("\n")).not.toContain("all");
    expect(bodies.join("\n")).not.toContain("Secret.Movie");
  });

  it("falls back to v4 pause/resume when v5 endpoints are missing", async () => {
    const paths: string[] = [];
    const service = serviceWith(async (options) => {
      const pathname = new URL(String(options.url)).pathname;
      paths.push(pathname);
      if (pathname === "/api/v2/torrents/stop" || pathname === "/api/v2/torrents/start")
        return text("Not Found", 404);
      return officialPayloads(options);
    });
    await service.pauseTorrents(ACTION, torrentActor);
    await service.resumeTorrents(ACTION, torrentActor);
    expect(paths).toContain("/api/v2/torrents/pause");
    expect(paths).toContain("/api/v2/torrents/resume");
  });

  it("denies read-only, manage-only, and specialized permission without interact", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.pauseTorrents(ACTION, actorFor(["integration.use", "qbittorrent.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.pauseTorrents(ACTION, actorFor(["integration.manage"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.pauseTorrents(ACTION, actorFor(["integration.use", "qbittorrent.pause"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.resumeTorrents(ACTION, actorFor(["integration.interact", "qbittorrent.pause"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects wrong integration type, malformed hashes, all, and stale config", async () => {
    const store = createMemoryStore([
      {
        id: DOCKER_ID,
        type: "docker",
        name: "Docker",
        baseUrl: "http://127.0.0.1:2375/",
        enabled: true,
        config: {},
        status: "unknown",
        lastCheckedAt: null,
        configRevision: 1,
        createdBy: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ]);
    const service = serviceWith(async (options) => officialPayloads(options), store);
    await expect(
      service.pauseTorrents({ ...ACTION, integrationId: DOCKER_ID }, torrentActor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.pauseTorrents({ ...ACTION, hashes: ["all"] }, torrentActor),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.pauseTorrents({ ...ACTION, hashes: ["not-a-hash"] }, torrentActor),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.pauseTorrents({ ...ACTION, expectedConfigRevision: 9 }, torrentActor),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rate limits and blocks double-submit on the same torrent action", async () => {
    const limiter = new MemorySafeActionRateLimiter(1, 60_000, () => 1_000);
    const limited = serviceWith(async (options) => officialPayloads(options), createMemoryStore(), {
      actionRateLimiter: limiter,
    });
    await limited.pauseTorrents(ACTION, torrentActor);
    await expect(limited.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = new MemorySafeActionInFlightGuard();
    const hanging = serviceWith(
      async (options) => {
        const pathname = new URL(String(options.url)).pathname;
        if (pathname === "/api/v2/torrents/stop") await gate;
        return officialPayloads(options);
      },
      createMemoryStore(),
      { inFlight },
    );
    const first = hanging.pauseTorrents(ACTION, torrentActor);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(hanging.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    release?.();
    await expect(first).resolves.toMatchObject({ status: "accepted" });
  });

  it("maps timeout, 401, 403 and 500 without leaking the password or SID", async () => {
    const timeout = serviceWith(async (options) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/v2/auth/login") return officialPayloads(options);
      return { ok: false, code: "TIMEOUT", latencyMs: 1 };
    });
    await expect(timeout.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    const unauthorized = serviceWith(async () => text(`denied ${PASSWORD} ${SID}`, 401));
    await expect(unauthorized.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    try {
      await unauthorized.pauseTorrents(ACTION, torrentActor);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(PASSWORD);
      expect(JSON.stringify(error)).not.toContain(SID);
    }
    const forbidden = serviceWith(async (options) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/v2/auth/login") return officialPayloads(options);
      return text("denied", 403);
    });
    await expect(forbidden.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const failed = serviceWith(async (options) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/v2/auth/login") return officialPayloads(options);
      if (pathname === "/api/v2/auth/logout") return officialPayloads(options);
      return text("boom", 500);
    });
    await expect(failed.pauseTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("invalidates cache and publishes realtime only after a successful action", async () => {
    const cache = new MemoryIntegrationCache();
    let published = 0;
    const service = serviceWith(async (options) => officialPayloads(options), createMemoryStore(), {
      cache,
      publish: async () => {
        published += 1;
      },
    });
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cache.size).toBeGreaterThan(0);
    await service.pauseTorrents(ACTION, torrentActor);
    expect(cache.size).toBe(0);
    expect(published).toBe(1);
    const failing = serviceWith(async () => text(`denied ${PASSWORD}`, 401), createMemoryStore(), {
      publish: async () => {
        published += 1;
      },
    });
    await expect(failing.resumeTorrents(ACTION, torrentActor)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(published).toBe(1);
  });
});
