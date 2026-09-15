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
import { createEnvKeyring, encryptSecret, type SecretKeyring } from "@dashboard/secrets";
import { proxmoxIntegrationDefinition } from "./definition";
import { MemoryProxmoxOverviewCoalescer } from "./overview-coalescer";
import { MemoryProxmoxRefreshRateLimiter } from "./rate-limiter";
import { MemoryProxmoxRefreshFence } from "./refresh-fence";
import { createProxmoxService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const DOCKER_ID = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 9).toString("base64");
const API_TOKEN = "root@pam!dashboard=abcDEF0123456789";
const GUEST = {
  integrationId: INTEGRATION_ID,
  node: "pve1",
  guestType: "qemu" as const,
  vmid: 100,
};

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

const powerActor = actor([
  "integration.interact",
  "proxmox.start",
  "proxmox.shutdown",
  "proxmox.reboot",
]);

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
    type: "proxmox",
    name: "PVE",
    baseUrl: "https://pve.lab:8006/",
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
      key: "apiToken",
      ...encryptSecret(keyring, { integrationId: row.id, key: "apiToken", plaintext: API_TOKEN }),
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
  if (pathname === "/api2/json/version")
    return json({ data: { version: "8.2.4", release: "8.2" } });
  if (pathname === "/api2/json/cluster/status")
    return json({
      data: [
        { type: "cluster", name: "homelab", quorate: 1 },
        { type: "node", name: "pve1", online: 1 },
      ],
    });
  return json({
    data: [
      { type: "node", node: "pve1", status: "online", cpu: 0.1, mem: 1, maxmem: 2, uptime: 9 },
      { type: "qemu", vmid: 100, name: "secret-vm", status: "running" },
    ],
  });
}

function guestHttp(
  options: SecureHttpRequest,
  state: { qemu?: string; lxc?: number | string; post?: number } = {},
): SecureHttpResult {
  const pathname = new URL(String(options.url)).pathname;
  const method = (options.method ?? "GET").toUpperCase();
  if (pathname.endsWith("/status/current")) {
    const guestType = pathname.includes("/lxc/") ? "lxc" : "qemu";
    const status =
      guestType === "lxc"
        ? typeof state.lxc === "string"
          ? state.lxc
          : "stopped"
        : (state.qemu ?? "stopped");
    return json({ data: { status, name: "secret-vm" } });
  }
  if (method === "POST" && /\/status\/(start|shutdown|reboot)$/u.test(pathname)) {
    return json({ data: "UPID:pve1:000:qemu:100:root@pam:" }, state.post ?? 200);
  }
  return officialPayloads(options);
}

function serviceWith(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  store = createMemoryStore(),
  extras: {
    cache?: MemoryIntegrationCache;
    actionRateLimiter?: MemorySafeActionRateLimiter;
    inFlight?: MemorySafeActionInFlightGuard;
    publish?: (integrationId: string) => Promise<void>;
    refreshRateLimiter?: MemoryProxmoxRefreshRateLimiter;
  } = {},
) {
  return createProxmoxService({
    store: store.store,
    registry: createIntegrationRegistry().register(proxmoxIntegrationDefinition),
    cache: extras.cache ?? new MemoryIntegrationCache(),
    request,
    refreshRateLimiter: extras.refreshRateLimiter ?? new MemoryProxmoxRefreshRateLimiter(),
    refreshFence: new MemoryProxmoxRefreshFence(),
    overviewCoalescer: new MemoryProxmoxOverviewCoalescer(),
    actionRateLimiter: extras.actionRateLimiter ?? new MemorySafeActionRateLimiter(),
    inFlight: extras.inFlight ?? new MemorySafeActionInFlightGuard(),
    ...(extras.publish ? { publish: extras.publish } : {}),
    keyring: store.keyring,
  });
}

describe("createProxmoxService", () => {
  it("returns a sanitized overview for a reader", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    const overview = await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("available");
    expect(overview.version.data?.version).toBe("8.2.4");
    expect(overview.guests.data?.vmRunning).toBe(1);
    expect(JSON.stringify(overview)).not.toContain(API_TOKEN);
    expect(JSON.stringify(overview)).not.toContain("secret-vm");
  });

  it("requires integration.use and proxmox.read together", async () => {
    const service = serviceWith(async (options) => officialPayloads(options));
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["proxmox.read"])),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.getOverview(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts the API token from unauthorized errors and caches the failure", async () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls += 1;
      return json({ message: `denied ${API_TOKEN}` }, 401);
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
      expect(JSON.stringify(error)).not.toContain(API_TOKEN);
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
    expect(calls).toBe(3);
  });

  it("rate limits refresh", async () => {
    const limiter = new MemoryProxmoxRefreshRateLimiter(1, 60_000, () => 1_000);
    const store = createMemoryStore();
    const service = serviceWith(async (options) => officialPayloads(options), store, {
      refreshRateLimiter: limiter,
    });
    await service.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(service.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });

  it("starts QEMU and LXC guests on allowlisted POST paths", async () => {
    const paths: string[] = [];
    const service = serviceWith(async (options) => {
      paths.push(`${options.method ?? "GET"} ${new URL(String(options.url)).pathname}`);
      return guestHttp(options);
    });
    const qemu = await service.startGuest(GUEST, powerActor);
    expect(qemu).toMatchObject({
      status: "accepted",
      action: "proxmox.start",
      resourceId: "pve1-qemu-100",
    });
    const lxc = await service.startGuest({ ...GUEST, guestType: "lxc", vmid: 101 }, powerActor);
    expect(lxc.status).toBe("accepted");
    expect(paths).toContain("GET /api2/json/nodes/pve1/qemu/100/status/current");
    expect(paths).toContain("POST /api2/json/nodes/pve1/qemu/100/status/start");
    expect(paths).toContain("POST /api2/json/nodes/pve1/lxc/101/status/start");
    expect(JSON.stringify(qemu)).not.toContain("UPID:");
    expect(JSON.stringify(qemu)).not.toContain(API_TOKEN);
    expect(JSON.stringify(qemu)).not.toContain("secret-vm");
  });

  it("treats already-running start and already-stopped shutdown as success without POST", async () => {
    const runningPaths: string[] = [];
    const running = serviceWith(async (options) => {
      runningPaths.push(`${options.method ?? "GET"} ${new URL(String(options.url)).pathname}`);
      return guestHttp(options, { qemu: "running" });
    });
    await expect(running.startGuest(GUEST, powerActor)).resolves.toMatchObject({
      status: "success",
    });
    expect(runningPaths.some((path) => path.startsWith("POST"))).toBe(false);

    const stoppedPaths: string[] = [];
    const stopped = serviceWith(async (options) => {
      stoppedPaths.push(`${options.method ?? "GET"} ${new URL(String(options.url)).pathname}`);
      return guestHttp(options, { qemu: "stopped" });
    });
    await expect(stopped.shutdownGuest(GUEST, powerActor)).resolves.toMatchObject({
      status: "success",
    });
    expect(stoppedPaths.some((path) => path.startsWith("POST"))).toBe(false);
  });

  it("maps stopped reboot to conflict and posts reboot when running", async () => {
    const stopped = serviceWith(async (options) => guestHttp(options, { qemu: "stopped" }));
    await expect(stopped.rebootGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const running = serviceWith(async (options) => guestHttp(options, { qemu: "running" }));
    await expect(running.rebootGuest(GUEST, powerActor)).resolves.toMatchObject({
      status: "accepted",
      action: "proxmox.reboot",
    });
  });

  it("denies read-only, manage-only, and specialized permission without interact", async () => {
    const service = serviceWith(async (options) => guestHttp(options));
    await expect(
      service.startGuest(GUEST, actor(["integration.use", "proxmox.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.startGuest(GUEST, actor(["integration.manage"]))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.startGuest(GUEST, actor(["integration.use", "proxmox.start"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.shutdownGuest(GUEST, actor(["integration.interact", "proxmox.start"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects wrong integration type, malformed ids, and stale config", async () => {
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
    const service = serviceWith(async (options) => guestHttp(options), store);
    await expect(
      service.startGuest({ ...GUEST, integrationId: DOCKER_ID }, powerActor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.startGuest({ ...GUEST, node: "pve/1" }, powerActor)).rejects.toMatchObject(
      {
        code: "VALIDATION_ERROR",
      },
    );
    await expect(service.startGuest({ ...GUEST, vmid: 0 }, powerActor)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      service.startGuest({ ...GUEST, expectedConfigRevision: 9 }, powerActor),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rate limits and blocks double-submit on the same guest action", async () => {
    const limiter = new MemorySafeActionRateLimiter(1, 60_000, () => 1_000);
    const limited = serviceWith(async (options) => guestHttp(options), createMemoryStore(), {
      actionRateLimiter: limiter,
    });
    await limited.startGuest(GUEST, powerActor);
    await expect(limited.startGuest(GUEST, powerActor)).rejects.toMatchObject({
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
        if (pathname.endsWith("/status/current")) await gate;
        return guestHttp(options);
      },
      createMemoryStore(),
      { inFlight },
    );
    const first = hanging.startGuest(GUEST, powerActor);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(hanging.startGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    release?.();
    await expect(first).resolves.toMatchObject({ status: "accepted" });
  });

  it("maps timeout, 401, 403 and 500 without leaking the token", async () => {
    const timeout = serviceWith(async () => ({ ok: false, code: "TIMEOUT", latencyMs: 1 }));
    await expect(timeout.startGuest(GUEST, powerActor)).rejects.toMatchObject({ code: "TIMEOUT" });
    const unauthorized = serviceWith(async () => json({ message: `denied ${API_TOKEN}` }, 401));
    await expect(unauthorized.startGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    try {
      await unauthorized.startGuest(GUEST, powerActor);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(API_TOKEN);
    }
    const forbidden = serviceWith(async () => json({ data: null }, 403));
    await expect(forbidden.startGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const failed = serviceWith(async () => json({ data: null }, 500));
    await expect(failed.startGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("invalidates cache and publishes realtime only after a successful action", async () => {
    const cache = new MemoryIntegrationCache();
    let published = 0;
    const service = serviceWith(async (options) => guestHttp(options), createMemoryStore(), {
      cache,
      publish: async () => {
        published += 1;
      },
    });
    await service.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cache.size).toBeGreaterThan(0);
    await service.startGuest(GUEST, powerActor);
    expect(cache.size).toBe(0);
    expect(published).toBe(1);
    const failing = serviceWith(
      async () => json({ message: API_TOKEN }, 401),
      createMemoryStore(),
      {
        publish: async () => {
          published += 1;
        },
      },
    );
    await expect(failing.startGuest(GUEST, powerActor)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(published).toBe(1);
  });
});
