import { describe, expect, it, vi } from "vitest";
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
import { qbittorrentIntegrationDefinition } from "./definition";
import { MemoryQbittorrentOverviewCoalescer } from "./overview-coalescer";
import { MemoryQbittorrentRefreshRateLimiter } from "./rate-limiter";
import { MemoryQbittorrentRefreshFence } from "./refresh-fence";
import { createQbittorrentService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");
const USERNAME = "admin";
const PASSWORD = "correct-horse-battery-staple";
const SID = "QB-SID-SUPER-SECRET-001";

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

function createMemoryStore(): {
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
  const rows = new Map<string, IntegrationRecord>([[row.id, row]]);
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
  return json([{ name: "Secret.Movie", hash: SID, state: "downloading" }]);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
) {
  return createQbittorrentService({
    store: store.store,
    registry: createIntegrationRegistry().register(qbittorrentIntegrationDefinition),
    cache: new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: new MemoryQbittorrentRefreshRateLimiter(),
    refreshFence: new MemoryQbittorrentRefreshFence(),
    overviewCoalescer: new MemoryQbittorrentOverviewCoalescer(),
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
      service.getOverview(INTEGRATION_ID, actor(["qbittorrent.read"])),
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
      keyring: store.keyring,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
