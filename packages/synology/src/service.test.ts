import { describe, expect, it, vi } from "vitest";
import {
  IntegrationError,
  MemoryIntegrationCache,
  createIntegrationRegistry,
  type EncryptedSecretRow,
  type IntegrationRateLimiter,
  type IntegrationRecord,
  type IntegrationStore,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import {
  createEnvKeyring,
  decryptSecret,
  encryptSecret,
  type SecretKeyring,
} from "@dashboard/secrets";
import { overviewFailureCacheOperation, synologyOverviewCacheOperation } from "./cache-key";
import { SYNOLOGY_OVERVIEW_FAILURE_TTL_MS } from "./client";
import { synologyIntegrationDefinition } from "./definition";
import { MemorySynologyOverviewCoalescer } from "./overview-coalescer";
import {
  MemorySynologyEnrollmentRateLimiter,
  MemorySynologyRefreshRateLimiter,
} from "./rate-limiter";
import { MemorySynologyRefreshFence } from "./refresh-fence";
import { createSynologyService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_INTEGRATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_INTEGRATION_ID = "33333333-3333-4333-8333-333333333333";
const KEY = Buffer.alloc(32, 9).toString("base64");
const MALICIOUS_SID = "SID-SUPER-SECRET-001";
const MALICIOUS_TOKEN = "TOKEN-SUPER-SECRET-002";
const MALICIOUS_DID = "DID-SUPER-SECRET-003";
const MALICIOUS_PASSWORD = "PASSWORD-SUPER-SECRET-004";
const MALICIOUS_SECRET = new RegExp(
  [MALICIOUS_PASSWORD, MALICIOUS_SID, MALICIOUS_TOKEN, MALICIOUS_DID].join("|"),
  "u",
);

const systemAdmin = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: true },
};

const adminDefault = {
  userId: "00000000-0000-4000-8000-000000000002",
  subject: {
    status: "active" as const,
    isSystemAdmin: false,
    directPermissions: [
      "integration.create",
      "integration.read",
      "integration.manage",
      "app.manage",
    ],
  },
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

function json(body: unknown): SecureHttpResult {
  return { ok: true, status: 200, body: Buffer.from(JSON.stringify(body)), latencyMs: 4 };
}

function createMemoryStore(
  record?: Partial<IntegrationRecord>,
  options: { password?: string; deviceId?: string; idAliases?: readonly string[] } = {},
): {
  store: IntegrationStore;
  keyring: SecretKeyring;
  secrets: EncryptedSecretRow[];
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
  const plaintextPassword = options.password ?? "s3cret";
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "synology",
    name: "NAS Lab",
    baseUrl: "https://nas.example:5001/",
    enabled: true,
    config: { account: "monitor", verifyTls: true, timeoutMs: 8000 },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...record,
  };
  const rows = new Map<string, IntegrationRecord>([[row.id, row]]);
  const aliases = new Set(options.idAliases ?? []);
  const resolveId = (id: string) => (aliases.has(id) ? row.id : id);
  const password = encryptSecret(keyring, {
    integrationId: row.id,
    key: "password",
    plaintext: plaintextPassword,
  });
  const secrets: EncryptedSecretRow[] = [{ key: "password", ...password }];
  if (options.deviceId) {
    secrets.push({
      key: "deviceId",
      ...encryptSecret(keyring, {
        integrationId: row.id,
        key: "deviceId",
        plaintext: options.deviceId,
      }),
    });
  }
  return {
    keyring,
    secrets,
    store: {
      async list() {
        return [...rows.values()];
      },
      async findById(id) {
        return rows.get(resolveId(id));
      },
      async create() {
        throw new Error("unused");
      },
      async update(input) {
        const current = rows.get(resolveId(input.id));
        if (!current) return undefined;
        const next: IntegrationRecord = {
          ...current,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.config === undefined ? {} : { config: input.config }),
          configRevision: input.bumpRevision ? current.configRevision + 1 : current.configRevision,
          status: input.resetStatus ? "unknown" : current.status,
          lastCheckedAt: input.resetStatus ? null : current.lastCheckedAt,
          updatedAt: new Date(),
        };
        rows.set(current.id, next);
        return next;
      },
      async delete() {
        return false;
      },
      async listSecretStates() {
        return secrets.map((item) => ({ key: item.key, configured: true as const }));
      },
      async loadEncryptedSecrets(id) {
        if (!rows.has(resolveId(id))) return [];
        return [...secrets];
      },
      async upsertSecret(id, secret) {
        const current = rows.get(resolveId(id));
        if (!current) return;
        const index = secrets.findIndex((item) => item.key === secret.key);
        if (index >= 0) secrets[index] = secret;
        else secrets.push(secret);
        rows.set(current.id, {
          ...current,
          configRevision: current.configRevision + 1,
          status: "unknown",
          lastCheckedAt: null,
          updatedAt: new Date(),
        });
      },
      async upsertSecretIfRevision(id, expectedRevision, secret) {
        const current = rows.get(resolveId(id));
        if (!current || current.configRevision !== expectedRevision) return false;
        const index = secrets.findIndex((item) => item.key === secret.key);
        if (index >= 0) secrets[index] = secret;
        else secrets.push(secret);
        rows.set(current.id, {
          ...current,
          configRevision: current.configRevision + 1,
          status: "unknown",
          lastCheckedAt: null,
          updatedAt: new Date(),
        });
        return true;
      },
      async deleteSecret(id, key) {
        const current = rows.get(resolveId(id));
        if (!current) return false;
        const index = secrets.findIndex((item) => item.key === key);
        const deleted = index >= 0;
        if (deleted) secrets.splice(index, 1);
        rows.set(current.id, {
          ...current,
          configRevision: current.configRevision + 1,
          status: "unknown",
          lastCheckedAt: null,
          updatedAt: new Date(),
        });
        return deleted;
      },
      async persistConnectionResult() {
        return true;
      },
    },
  };
}

function infoPayload() {
  return {
    success: true,
    data: {
      "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
      "SYNO.DSM.Info": { path: "entry.cgi", minVersion: 1, maxVersion: 2 },
      "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
      "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
      "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
    },
  };
}

function dsmRequest(): (options: SecureHttpRequest) => Promise<SecureHttpResult> {
  return async (options) => {
    const href = String(options.url);
    const api = new URL(href).searchParams.get("api");
    expect(href).not.toMatch(/passwd|s3cret|_sid=|otp_code=/u);
    expect(href).toContain("/webapi/entry.cgi");
    if (api === "SYNO.API.Info") return json(infoPayload());
    if (options.method === "POST") {
      if (options.body?.includes("method=login")) {
        expect(options.body).toContain("account=monitor");
        expect(options.body).toContain("passwd=s3cret");
        expect(options.body).toContain("session=DashboardHomelab");
        return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
      }
      expect(options.body).not.toContain("passwd=");
      expect(options.body).not.toContain("account=");
      expect(options.body).toContain("method=logout");
      expect(Object.prototype.hasOwnProperty.call(options.headers ?? {}, "SynoToken")).toBe(false);
      return json({ success: true, data: {} });
    }
    expect(options.headers?.cookie).toMatch(/^id=/u);
    expect(Object.prototype.hasOwnProperty.call(options.headers ?? {}, "SynoToken")).toBe(false);
    if (options.headers?.["X-SYNO-TOKEN"] !== undefined)
      expect(options.headers["X-SYNO-TOKEN"]).toEqual(expect.any(String));
    if (api === "SYNO.DSM.Info")
      return json({
        success: true,
        data: {
          model: "DS920+",
          version_string: "DSM 7.2.2",
          uptime: "1:00:00",
          serial: "NAS-SERIAL",
          ram: 8192,
          temperature: 41,
        },
      });
    if (api === "SYNO.Core.System")
      return json({
        success: true,
        data: { cpu_cores: 4, cpu_family: "Intel", cpu_series: "J4125", serial: "CORE-SERIAL" },
      });
    if (api === "SYNO.Core.System.Utilization")
      return json({
        success: true,
        data: {
          cpu: { user_load: 12, system_load: 3, other_load: 0, idle_load: 85 },
          memory: { total_real: 4096, avail_real: 1024, real_usage: 75 },
        },
      });
    if (api === "SYNO.Storage.CGI.Storage")
      return json({
        success: true,
        data: {
          volumes: [
            {
              id: "volume_1",
              vol_desc: "Volume 1",
              status: "normal",
              size: { total: "1000", used: "400" },
            },
          ],
          disks: [
            {
              id: "sata1",
              name: "Drive 1",
              model: "WD80",
              size_total: "8000",
              status: "normal",
              temp: 34,
              smart_status: "normal",
              serial: "DISK-SERIAL",
            },
          ],
        },
      });
    throw new Error(href);
  };
}

function utilizationPayload() {
  return {
    cpu: { user_load: 12, system_load: 3, other_load: 0, idle_load: 85 },
    memory: { total_real: 4096, avail_real: 1024, real_usage: 75 },
  };
}

function maliciousDsmRequest(mode: "system" | "storage" | "health" = "system") {
  return async (options: SecureHttpRequest): Promise<SecureHttpResult> => {
    const href = String(options.url);
    const api = new URL(href).searchParams.get("api");
    if (api === "SYNO.API.Info") return json(infoPayload());
    if (options.method === "POST") {
      if (options.body?.includes("method=login")) {
        expect(options.body).toContain(`passwd=${MALICIOUS_PASSWORD}`);
        return json({
          success: true,
          data: { sid: MALICIOUS_SID, synotoken: MALICIOUS_TOKEN, did: MALICIOUS_DID },
        });
      }
      return json({ success: true, data: {} });
    }
    if (api === "SYNO.DSM.Info")
      return json({
        success: true,
        data: {
          model: MALICIOUS_PASSWORD,
          version_string: `DSM-${MALICIOUS_SID}`,
          uptime: "1:00:00",
          ram: 4096,
          temperature: 40,
        },
      });
    if (api === "SYNO.Core.System")
      return json({
        success: true,
        data: {
          cpu_cores: 4,
          cpu_family: MALICIOUS_TOKEN,
          cpu_series: MALICIOUS_DID,
        },
      });
    if (api === "SYNO.Core.System.Utilization")
      return json({ success: true, data: utilizationPayload() });
    if (api === "SYNO.Storage.CGI.Storage") {
      if (mode === "system")
        return json({
          success: true,
          data: { volumes: [{ id: "volume_1", status: "normal" }], disks: [{ id: "sata1" }] },
        });
      return json({
        success: true,
        data: {
          volumes: [
            {
              id: MALICIOUS_PASSWORD,
              vol_desc: MALICIOUS_SID,
              filesystem: MALICIOUS_TOKEN,
              status: "normal",
              size: { total: "1000", used: "400" },
            },
          ],
          disks: [
            {
              id: "sata1",
              name: MALICIOUS_PASSWORD,
              vendor: MALICIOUS_SID,
              model: MALICIOUS_TOKEN,
              status: mode === "health" ? "normal" : MALICIOUS_DID,
              smart_status: mode === "health" ? MALICIOUS_PASSWORD : "normal",
              size_total: "8000",
              temp: 34,
            },
          ],
        },
      });
    }
    throw new Error(href);
  };
}

function createBarrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function createService(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult> = dsmRequest(),
  record?: Partial<IntegrationRecord>,
  refreshRateLimiter: IntegrationRateLimiter = new MemorySynologyRefreshRateLimiter(),
  storeOptions: { password?: string; deviceId?: string; idAliases?: readonly string[] } = {},
  enrollmentRateLimiter: IntegrationRateLimiter = new MemorySynologyEnrollmentRateLimiter(),
) {
  const { store, keyring, secrets } = createMemoryStore(record, storeOptions);
  const cache = new MemoryIntegrationCache();
  const refreshFence = new MemorySynologyRefreshFence();
  const overviewCoalescer = new MemorySynologyOverviewCoalescer();
  return {
    store,
    cache,
    secrets,
    keyring,
    refreshFence,
    overviewCoalescer,
    enrollmentRateLimiter,
    synology: createSynologyService({
      store,
      registry: createIntegrationRegistry().register(synologyIntegrationDefinition).freeze(),
      cache,
      request,
      refreshRateLimiter,
      enrollmentRateLimiter,
      refreshFence,
      overviewCoalescer,
      keyring,
    }),
  };
}

function createSharedRuntime(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  refreshRateLimiter: IntegrationRateLimiter = new MemorySynologyRefreshRateLimiter(),
  enrollmentRateLimiter: IntegrationRateLimiter = new MemorySynologyEnrollmentRateLimiter(),
) {
  const { store, keyring, secrets } = createMemoryStore();
  const cache = new MemoryIntegrationCache();
  const refreshFence = new MemorySynologyRefreshFence();
  const overviewCoalescer = new MemorySynologyOverviewCoalescer();
  const registry = createIntegrationRegistry().register(synologyIntegrationDefinition).freeze();
  const makeService = (
    serviceRequest: (options: SecureHttpRequest) => Promise<SecureHttpResult> = request,
  ) =>
    createSynologyService({
      store,
      registry,
      cache,
      request: serviceRequest,
      refreshRateLimiter,
      enrollmentRateLimiter,
      refreshFence,
      overviewCoalescer,
      keyring,
    });
  return {
    store,
    cache,
    secrets,
    keyring,
    refreshFence,
    overviewCoalescer,
    enrollmentRateLimiter,
    makeService,
  };
}

function enrollTransport(
  onLogin?: (body: string | undefined) => SecureHttpResult | undefined,
): (options: SecureHttpRequest) => Promise<SecureHttpResult> {
  return async (options) => {
    const api = new URL(String(options.url)).searchParams.get("api");
    if (api === "SYNO.API.Info") return json(infoPayload());
    if (options.method === "POST" && options.body?.includes("method=login")) {
      const override = onLogin?.(options.body);
      if (override) return override;
      return json({
        success: true,
        data: { sid: "SIDTOKEN", synotoken: "TOK", did: "DID-SECRET" },
      });
    }
    if (options.method === "POST") return json({ success: true, data: {} });
    throw new Error(String(options.url));
  };
}

function dsmInfoData(model: string) {
  return {
    model,
    version_string: "DSM 7.2",
    uptime: "1:00:00",
    ram: 4096,
    temperature: 40,
  };
}

describe("SynologyService", () => {
  it("returns a sanitized overview for a delegated reader", async () => {
    const { synology } = createService();
    const reader = actor(["integration.use", "synology.read"]);
    const overview = await synology.getOverview(INTEGRATION_ID, reader);
    expect(overview.status).toBe("available");
    expect(overview.system.data?.model).toBe("DS920+");
    expect(overview.system.data?.dsmVersion).toBe("DSM 7.2.2");
    expect(overview.system.data?.uptimeSeconds).toBe(3600);
    expect(overview.system.data?.ramTotalBytes).toBe(8192 * 1024 * 1024);
    expect(overview.resources.data?.cpuTotalPercent).toBe(15);
    expect(overview.resources.data?.memoryTotalBytes).toBe(4096 * 1024);
    expect(overview.storage.data?.volumes[0]?.usedPercent).toBe(40);
    expect(overview.storage.data?.disks[0]?.smartStatus).toBe("normal");
    expect(overview).toHaveProperty("fetchedAt");
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toMatch(
      /NAS-SERIAL|DISK-SERIAL|CORE-SERIAL|s3cret|SIDTOKEN|passwd|baseUrl|hostname/u,
    );
  });

  it("redacts credentials reflected in successful DSM system fields and cache hits", async () => {
    let dsmInfoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.DSM.Info") dsmInfoCalls += 1;
        return maliciousDsmRequest("system")(options);
      },
      undefined,
      undefined,
      { password: MALICIOUS_PASSWORD, deviceId: MALICIOUS_DID },
    );
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    const second = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(dsmInfoCalls).toBe(1);
    expect(JSON.stringify(first)).not.toMatch(MALICIOUS_SECRET);
    expect(JSON.stringify(second)).not.toMatch(MALICIOUS_SECRET);
    expect(first.system.data?.model).toBe("[REDACTED]");
    expect(first.system.data?.dsmVersion).toBe("DSM-[REDACTED]");
    expect(first.system.data?.cpuFamily).toBe("[REDACTED]");
    expect(first.system.data?.cpuSeries).toBe("[REDACTED]");
  });

  it("redacts credentials reflected in successful DSM storage fields", async () => {
    const created = createService(maliciousDsmRequest("storage"), undefined, undefined, {
      password: MALICIOUS_PASSWORD,
      deviceId: MALICIOUS_DID,
    });
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(JSON.stringify(overview)).not.toMatch(MALICIOUS_SECRET);
    expect(overview.storage.data?.volumes[0]?.id).toBe("_REDACTED_");
    expect(overview.storage.data?.volumes[0]?.name).toBe("[REDACTED]");
    expect(overview.storage.data?.volumes[0]?.filesystem).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.displayName).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.vendor).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.model).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.status).toBe("[REDACTED]");
  });

  it("does not treat a redacted SMART string as a disk health failure", async () => {
    const created = createService(maliciousDsmRequest("health"), undefined, undefined, {
      password: MALICIOUS_PASSWORD,
      deviceId: MALICIOUS_DID,
    });
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(JSON.stringify(overview)).not.toMatch(MALICIOUS_SECRET);
    expect(overview.storage.data?.disks[0]?.smartStatus).toBe("[REDACTED]");
    expect(overview.storage.status).toBe("available");
  });

  it("allows metadata for a delegated reader without integration.read", async () => {
    const { synology } = createService();
    const reader = actor(["integration.use", "synology.read"]);
    await expect(synology.getIntegrationMetadata(INTEGRATION_ID, reader)).resolves.toEqual({
      id: INTEGRATION_ID,
      name: "NAS Lab",
      enabled: true,
    });
    expect(synology.permissions(reader)).toEqual({ canRead: true, canManageAuth: false });
    expect(synology.permissions(adminDefault)).toEqual({ canRead: false, canManageAuth: true });
    expect(synology.permissions(systemAdmin)).toEqual({ canRead: true, canManageAuth: true });
    const serialized = JSON.stringify(
      await synology.getIntegrationMetadata(INTEGRATION_ID, reader),
    );
    expect(serialized).not.toMatch(/baseUrl|trustedCaPem|configRevision|s3cret/u);
    await expect(
      synology.getIntegrationMetadata(INTEGRATION_ID, actor(["synology.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      synology.getIntegrationMetadata(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      synology.getIntegrationMetadata(INTEGRATION_ID, { userId: null, subject: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      synology.getIntegrationMetadata("00000000-0000-4000-8000-000000000099", reader),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Définition Synology introuvable",
    });
  });

  it("returns the same NOT_FOUND for a missing record and a non-Synology type", async () => {
    const { synology } = createService(dsmRequest(), { type: "docker" });
    const reader = actor(["integration.use", "synology.read"]);
    await expect(synology.getIntegrationMetadata(INTEGRATION_ID, reader)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Définition Synology introuvable",
    });
  });

  it("maps 2FA to MISCONFIGURED and bad credentials to UNAUTHORIZED", async () => {
    const otp = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") return json({ success: false, error: { code: 403 } });
      throw new Error(href);
    });
    await expect(otp.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "MISCONFIGURED",
    });
    const unauthorized = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") return json({ success: false, error: { code: 400 } });
      throw new Error(href);
    });
    await expect(
      unauthorized.synology.getOverview(INTEGRATION_ID, systemAdmin),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("keeps utilization failures as an explicit unavailable section", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System.Utilization")
        return json({ success: false, error: { code: 105 } });
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.system.data?.model).toBe("DS920+");
    expect(overview.resources.status).toBe("unavailable");
    expect(overview.resources.reason).toBe("permission-denied");
    expect(overview.resources.data).toBeNull();
    expect(overview.storage.status).toBe("available");
  });

  it("keeps system and CPU when storage times out", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.system.status).toBe("available");
    expect(overview.resources.status).toBe("available");
    expect(overview.storage.status).toBe("unavailable");
    expect(overview.storage.reason).toBe("timeout");
  });

  it("marks Core.System request failures as degraded without hiding DSM.Info", async () => {
    const timeout = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System") return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
      return dsmRequest()(options);
    });
    const timedOut = await timeout.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(timedOut.status).toBe("degraded");
    expect(timedOut.system.status).toBe("degraded");
    expect(timedOut.system.reason).toBe("timeout");
    expect(timedOut.system.data?.model).toBe("DS920+");
    expect(timedOut.system.data?.cpuCores).toBeNull();

    const forbidden = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System") return json({ success: false, error: { code: 105 } });
      return dsmRequest()(options);
    });
    const denied = await forbidden.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(denied.system.status).toBe("degraded");
    expect(denied.system.reason).toBe("permission-denied");
    expect(denied.system.data?.dsmVersion).toBe("DSM 7.2.2");

    const malformed = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System") return json({ success: true, data: "not-an-object" });
      return dsmRequest()(options);
    });
    const invalid = await malformed.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(invalid.system.status).toBe("degraded");
    expect(invalid.system.reason).toBe("invalid-response");
    expect(invalid.system.data?.model).toBe("DS920+");

    const empty = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System") return json({ success: true, data: {} });
      return dsmRequest()(options);
    });
    const emptyCore = await empty.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(emptyCore.status).toBe("degraded");
    expect(emptyCore.system.status).toBe("degraded");
    expect(emptyCore.system.reason).toBe("invalid-response");
    expect(emptyCore.system.data?.model).toBe("DS920+");
    expect(emptyCore.system.data?.cpuCores).toBeNull();
    expect(emptyCore.resources.status).toBe("available");
    expect(emptyCore.storage.status).toBe("available");

    const unrelated = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System") return json({ success: true, data: { foo: "bar" } });
      return dsmRequest()(options);
    });
    const unrelatedCore = await unrelated.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(unrelatedCore.system.status).toBe("degraded");
    expect(unrelatedCore.system.reason).toBe("invalid-response");
    expect(unrelatedCore.system.data?.model).toBe("DS920+");

    const missing = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        const payload = infoPayload();
        const { "SYNO.Core.System": _core, ...data } = payload.data;
        return json({ success: true, data });
      }
      if (api === "SYNO.Core.System") throw new Error("Core.System must not be called");
      return dsmRequest()(options);
    });
    const withoutCore = await missing.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(withoutCore.system.status).toBe("available");
    expect(withoutCore.system.data?.model).toBe("DS920+");
    expect(withoutCore.system.data?.cpuCores).toBeNull();
  });

  it("marks the system section degraded when DSM reports a temperature warning", async () => {
    const withoutCore = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        const payload = infoPayload();
        const { "SYNO.Core.System": _core, ...data } = payload.data;
        return json({ success: true, data });
      }
      if (api === "SYNO.Core.System") throw new Error("Core.System must not be called");
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: {
            model: "DS920+",
            version_string: "DSM 7.2.2",
            uptime: "1:00:00",
            ram: 8192,
            temperature: 75,
            temperature_warn: true,
          },
        });
      return dsmRequest()(options);
    });
    const warned = await withoutCore.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(warned.status).toBe("degraded");
    expect(warned.system.status).toBe("degraded");
    expect(warned.system.reason).toBeUndefined();
    expect(warned.system.data?.temperatureWarning).toBe(true);
    expect(warned.system.data?.model).toBe("DS920+");

    const withCore = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: {
            model: "DS920+",
            version_string: "DSM 7.2.2",
            uptime: "1:00:00",
            ram: 8192,
            temperature: 40,
            temperature_warn: false,
          },
        });
      if (api === "SYNO.Core.System")
        return json({
          success: true,
          data: { cpu_cores: 4, temperature_warn: true },
        });
      return dsmRequest()(options);
    });
    const coreWarned = await withCore.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(coreWarned.system.status).toBe("degraded");
    expect(coreWarned.system.data?.temperatureWarning).toBe(true);

    const timeout = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: {
            model: "DS920+",
            version_string: "DSM 7.2.2",
            uptime: "1:00:00",
            ram: 8192,
            temperature: 75,
            temperature_warn: true,
          },
        });
      if (api === "SYNO.Core.System") return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
      return dsmRequest()(options);
    });
    const timedOut = await timeout.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(timedOut.system.status).toBe("degraded");
    expect(timedOut.system.reason).toBe("timeout");
    expect(timedOut.system.data?.temperatureWarning).toBe(true);
    expect(timedOut.system.data?.model).toBe("DS920+");
  });

  it("marks storage degraded for disk health warnings while keeping healthy disks available", async () => {
    const badSector = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [{ id: "volume_1", status: "normal" }],
            disks: [
              {
                id: "sata1",
                name: "Drive 1",
                status: "normal",
                smart_status: "normal",
                bad_sector: true,
                remain_life_warning: false,
              },
            ],
          },
        });
      return dsmRequest()(options);
    });
    const badSectorOverview = await badSector.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(badSectorOverview.status).toBe("degraded");
    expect(badSectorOverview.storage.status).toBe("degraded");
    expect(badSectorOverview.storage.data?.disks[0]?.badSectorWarning).toBe(true);

    const remainingLife = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [{ id: "volume_1", status: "normal" }],
            disks: [
              {
                id: "sata1",
                name: "Drive 1",
                status: "normal",
                remain_life_warning: true,
              },
            ],
          },
        });
      return dsmRequest()(options);
    });
    const remaining = await remainingLife.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(remaining.storage.status).toBe("degraded");
    expect(remaining.storage.data?.disks[0]?.remainingLifeWarning).toBe(true);

    const smartFailing = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [{ id: "volume_1", status: "normal" }],
            disks: [{ id: "sata1", name: "Drive 1", status: "normal", smart_status: "failing" }],
          },
        });
      return dsmRequest()(options);
    });
    const failing = await smartFailing.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(failing.storage.status).toBe("degraded");
    expect(failing.storage.data?.disks[0]?.smartStatus).toBe("degraded");

    const healthy = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [{ id: "volume_1", status: "normal" }],
            disks: [
              {
                id: "sata1",
                name: "Drive 1",
                status: "normal",
                smart_status: "normal",
                bad_sector: false,
                remain_life_warning: false,
              },
            ],
          },
        });
      return dsmRequest()(options);
    });
    const healthyOverview = await healthy.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(healthyOverview.storage.status).toBe("available");
    expect(healthyOverview.status).toBe("available");
  });

  it("retries a Core.System session error once", async () => {
    let coreCalls = 0;
    let logins = 0;
    const { synology } = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") {
        if (options.body?.includes("method=login")) {
          logins += 1;
          return json({
            success: true,
            data: { sid: `SID${logins}`, synotoken: `TOK${logins}` },
          });
        }
        return json({ success: true, data: {} });
      }
      if (api === "SYNO.Core.System") {
        coreCalls += 1;
        if (coreCalls === 1) return json({ success: false, error: { code: 119 } });
        return dsmRequest()(options);
      }
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.system.status).toBe("available");
    expect(overview.system.data?.cpuCores).toBe(4);
    expect(coreCalls).toBeGreaterThanOrEqual(2);
    expect(logins).toBe(2);
  });

  it("rejects malformed storage and utilization payloads as invalid-response", async () => {
    const storage = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage") return json({ success: true, data: { volumes: [] } });
      return dsmRequest()(options);
    });
    const storageOverview = await storage.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(storageOverview.storage.status).toBe("unavailable");
    expect(storageOverview.storage.reason).toBe("invalid-response");
    expect(storageOverview.storage.data).toBeNull();

    const utilization = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System.Utilization") return json({ success: true, data: {} });
      return dsmRequest()(options);
    });
    const utilizationOverview = await utilization.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(utilizationOverview.resources.status).toBe("unavailable");
    expect(utilizationOverview.resources.reason).toBe("invalid-response");
    expect(utilizationOverview.resources.data).toBeNull();

    const dsmInfo = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") return json({ success: true, data: {} });
      return dsmRequest()(options);
    });
    const dsmInfoOverview = await dsmInfo.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(dsmInfoOverview.system.status).toBe("unavailable");
    expect(dsmInfoOverview.system.reason).toBe("invalid-response");
    expect(dsmInfoOverview.system.data).toBeNull();
  });

  it("accepts a delegated reader whose permissions come from group grants", async () => {
    const { synology } = createService();
    const reader = {
      userId: "00000000-0000-4000-8000-000000000099",
      subject: {
        status: "active" as const,
        isSystemAdmin: false,
        directPermissions: [] as const,
        groupPermissions: ["integration.use", "synology.read"],
      },
    };
    await expect(synology.getOverview(INTEGRATION_ID, reader)).resolves.toMatchObject({
      status: "available",
    });
    await expect(
      synology.getOverview(INTEGRATION_ID, {
        ...reader,
        subject: { ...reader.subject, groupPermissions: ["integration.use"] },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("retries a session error once then logs out", async () => {
    let infoCalls = 0;
    let logins = 0;
    let logouts = 0;
    const { synology } = createService(async (options) => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") {
        if (options.body?.includes("method=login")) {
          logins += 1;
          return json({
            success: true,
            data: { sid: `SID${logins}`, synotoken: `TOK${logins}` },
          });
        }
        logouts += 1;
        return json({ success: true, data: {} });
      }
      if (api === "SYNO.DSM.Info") {
        infoCalls += 1;
        if (infoCalls === 1) return json({ success: false, error: { code: 119 } });
        return dsmRequest()(options);
      }
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.system.data?.model).toBe("DS920+");
    expect(logins).toBe(2);
    expect(logouts).toBeGreaterThanOrEqual(2);
  });

  it("does not retry invalid credentials", async () => {
    let logins = 0;
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        logins += 1;
        return json({ success: false, error: { code: 400 } });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    await expect(synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(logins).toBe(1);
  });

  it("enrolls a trusted device and clears only the local token", async () => {
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        expect(options.body).toContain("otp_code=654321");
        expect(options.body).toContain("enable_device_token=yes");
        return json({
          success: true,
          data: { sid: "SIDTOKEN", synotoken: "TOK", did: "DID-SECRET" },
        });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    const enrolled = await created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    expect(enrolled).toEqual({ enrolled: true });
    expect(JSON.stringify(enrolled)).not.toMatch(/DID-SECRET/u);
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(true);
    await expect(
      created.synology.enrollDevice(
        INTEGRATION_ID,
        "654321",
        actor(["integration.use", "synology.read"]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cleared = await created.synology.clearDevice(INTEGRATION_ID, adminDefault);
    expect(cleared).toEqual({ cleared: true });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
  });

  it("rate-limits overview refresh", async () => {
    const limiter = new MemorySynologyRefreshRateLimiter(2, 60_000, () => 1_000);
    const { synology } = createService(dsmRequest(), undefined, limiter);
    await synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    await synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    await expect(synology.refreshOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rejects a Docker integration refresh before touching the shared cache, fence, or limiter", async () => {
    let requestCalls = 0;
    let rateLimiterCalls = 0;
    const reader = actor(["integration.use", "synology.read"]);
    const created = createService(
      async (options) => {
        requestCalls += 1;
        return dsmRequest()(options);
      },
      { type: "docker", name: "Docker Host", baseUrl: "http://127.0.0.1:2375/" },
      {
        tryConsume() {
          rateLimiterCalls += 1;
          return true;
        },
      },
    );
    created.cache.set(INTEGRATION_ID, "docker.version", { marker: "version" }, 60_000);
    created.cache.set(INTEGRATION_ID, "docker.containers.list", { marker: "containers" }, 60_000);
    created.cache.set(INTEGRATION_ID, "docker.containers.stats:abc", { marker: "stats" }, 60_000);
    created.cache.set(MISSING_INTEGRATION_ID, "docker.version", { marker: "unrelated" }, 60_000);
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(0);

    await expect(created.synology.refreshOverview(INTEGRATION_ID, reader)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Définition Synology introuvable",
    });

    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(0);
    expect(rateLimiterCalls).toBe(0);
    expect(requestCalls).toBe(0);
    expect(created.cache.get(INTEGRATION_ID, "docker.version")).toEqual({ marker: "version" });
    expect(created.cache.get(INTEGRATION_ID, "docker.containers.list")).toEqual({
      marker: "containers",
    });
    expect(created.cache.get(INTEGRATION_ID, "docker.containers.stats:abc")).toEqual({
      marker: "stats",
    });
    expect(created.cache.get(MISSING_INTEGRATION_ID, "docker.version")).toEqual({
      marker: "unrelated",
    });
  });

  it("rejects a missing integration refresh without mutating fence, limiter, or cache", async () => {
    let requestCalls = 0;
    let rateLimiterCalls = 0;
    const reader = actor(["integration.use", "synology.read"]);
    const created = createService(
      async (options) => {
        requestCalls += 1;
        return dsmRequest()(options);
      },
      undefined,
      {
        tryConsume() {
          rateLimiterCalls += 1;
          return true;
        },
      },
    );
    created.cache.set(INTEGRATION_ID, "docker.version", { marker: "kept" }, 60_000);
    created.cache.set(
      MISSING_INTEGRATION_ID,
      "docker.containers.list",
      { marker: "missing" },
      60_000,
    );
    expect(created.refreshFence.current(MISSING_INTEGRATION_ID)).toBe(0);

    await expect(
      created.synology.refreshOverview(MISSING_INTEGRATION_ID, reader),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Définition Synology introuvable",
    });

    expect(created.refreshFence.current(MISSING_INTEGRATION_ID)).toBe(0);
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(0);
    expect(rateLimiterCalls).toBe(0);
    expect(requestCalls).toBe(0);
    expect(created.cache.get(INTEGRATION_ID, "docker.version")).toEqual({ marker: "kept" });
    expect(created.cache.get(MISSING_INTEGRATION_ID, "docker.containers.list")).toEqual({
      marker: "missing",
    });
  });

  it("still advances the fence and refreshes cache for a valid Synology integration", async () => {
    let rateLimiterCalls = 0;
    let dsmInfoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.DSM.Info") dsmInfoCalls += 1;
        return dsmRequest()(options);
      },
      undefined,
      {
        tryConsume() {
          rateLimiterCalls += 1;
          return true;
        },
      },
    );
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(first.system.data?.model).toBe("DS920+");
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(0);
    expect(rateLimiterCalls).toBe(0);
    expect(dsmInfoCalls).toBe(1);

    const refreshed = await created.synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(refreshed.system.data?.model).toBe("DS920+");
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(1);
    expect(rateLimiterCalls).toBe(1);
    expect(dsmInfoCalls).toBe(2);

    const cached = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cached.system.data?.model).toBe("DS920+");
    expect(dsmInfoCalls).toBe(2);
  });

  it("does not serve a stale overview after the configuration revision changes during fetch", async () => {
    const started = createBarrier();
    const release = createBarrier();
    let dsmInfoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          started.release();
          await release.promise;
          return json({
            success: true,
            data: {
              model: "DS-A",
              version_string: "DSM 7.1",
              uptime: "1:00:00",
              ram: 4096,
              temperature: 40,
            },
          });
        }
        return json({
          success: true,
          data: {
            model: "DS-B",
            version_string: "DSM 7.2",
            uptime: "2:00:00",
            ram: 8192,
            temperature: 41,
          },
        });
      }
      return dsmRequest()(options);
    });
    const reader = actor(["integration.use", "synology.read"]);
    const inFlight = created.synology.getOverview(INTEGRATION_ID, reader);
    await started.promise;
    await created.store.update({
      id: INTEGRATION_ID,
      baseUrl: "https://nas-b.example:5001/",
      bumpRevision: true,
      resetStatus: true,
    });
    created.cache.invalidate(INTEGRATION_ID);
    release.release();
    const stale = await inFlight;
    expect(stale.system.data?.model).toBe("DS-A");
    const next = await created.synology.getOverview(INTEGRATION_ID, reader);
    expect(next.system.data?.model).toBe("DS-B");
    expect(dsmInfoCalls).toBe(2);
  });

  it("does not serve a stale overview after the password changes during fetch", async () => {
    const started = createBarrier();
    const release = createBarrier();
    let dsmInfoCalls = 0;
    let usedNewPassword = false;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (options.method === "POST" && options.body?.includes("method=login")) {
        if (options.body.includes("passwd=n3wpass")) {
          usedNewPassword = true;
          return json({ success: true, data: { sid: "SID-NEW", synotoken: "TOK-NEW" } });
        }
        expect(options.body).toContain("passwd=s3cret");
        return json({ success: true, data: { sid: "SID-OLD", synotoken: "TOK-OLD" } });
      }
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          started.release();
          await release.promise;
          return json({
            success: true,
            data: {
              model: "DS-OLD",
              version_string: "DSM 7.1",
              uptime: "1:00:00",
              ram: 4096,
              temperature: 40,
            },
          });
        }
        return json({
          success: true,
          data: {
            model: "DS-NEW",
            version_string: "DSM 7.2",
            uptime: "2:00:00",
            ram: 8192,
            temperature: 41,
          },
        });
      }
      return dsmRequest()(options);
    });
    const reader = actor(["integration.use", "synology.read"]);
    const before = synologyOverviewCacheOperation(1, [...created.secrets]);
    const inFlight = created.synology.getOverview(INTEGRATION_ID, reader);
    await started.promise;
    const encrypted = encryptSecret(created.keyring, {
      integrationId: INTEGRATION_ID,
      key: "password",
      plaintext: "n3wpass",
    });
    await created.store.upsertSecret(INTEGRATION_ID, { key: "password", ...encrypted });
    created.cache.invalidate(INTEGRATION_ID);
    const after = synologyOverviewCacheOperation(1, [...created.secrets]);
    expect(after).not.toBe(before);
    expect(`${before}${after}`).not.toMatch(/s3cret|n3wpass/u);
    release.release();
    const stale = await inFlight;
    expect(stale.system.data?.model).toBe("DS-OLD");
    const next = await created.synology.getOverview(INTEGRATION_ID, reader);
    expect(next.system.data?.model).toBe("DS-NEW");
    expect(usedNewPassword).toBe(true);
    expect(JSON.stringify(next)).not.toMatch(/s3cret|n3wpass|SID-OLD|SID-NEW/u);
  });

  it("does not reuse an overview cached before deviceId enrollment or clear", async () => {
    let dsmInfoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        return json({
          success: true,
          data: {
            model: `DS-${dsmInfoCalls}`,
            version_string: "DSM 7.2",
            uptime: "1:00:00",
            ram: 4096,
            temperature: 40,
          },
        });
      }
      return dsmRequest()(options);
    });
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(first.system.data?.model).toBe("DS-1");
    const device = encryptSecret(created.keyring, {
      integrationId: INTEGRATION_ID,
      key: "deviceId",
      plaintext: "DID-SECRET",
    });
    await created.store.upsertSecret(INTEGRATION_ID, { key: "deviceId", ...device });
    const enrolled = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(enrolled.system.data?.model).toBe("DS-2");
    await created.store.deleteSecret(INTEGRATION_ID, "deviceId");
    const cleared = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cleared.system.data?.model).toBe("DS-3");
    expect(dsmInfoCalls).toBe(3);
    expect(JSON.stringify({ first, enrolled, cleared })).not.toMatch(/DID-SECRET/u);
  });

  it("rejects malformed storage array elements as invalid-response", async () => {
    for (const data of [
      { volumes: [null], disks: [] },
      { volumes: [], disks: [{}] },
      { volumes: [{ foo: "bar" }], disks: [] },
    ]) {
      const created = createService(async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.Storage.CGI.Storage") return json({ success: true, data });
        return dsmRequest()(options);
      });
      const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
      expect(overview.storage.status).toBe("unavailable");
      expect(overview.storage.reason).toBe("invalid-response");
      expect(overview.storage.data).toBeNull();
    }

    const empty = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({ success: true, data: { volumes: [], disks: [] } });
      return dsmRequest()(options);
    });
    const emptyOverview = await empty.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(emptyOverview.storage.status).toBe("available");
    expect(emptyOverview.storage.data).toEqual({ volumes: [], disks: [] });
  });

  it("serves a second getOverview from cache without another DSM fetch", async () => {
    let dsmInfoCalls = 0;
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        return json({ success: true, data: dsmInfoData("NAS-CACHED") });
      }
      return dsmRequest()(options);
    });
    const first = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    const second = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(first.system.data?.model).toBe("NAS-CACHED");
    expect(second.system.data?.model).toBe("NAS-CACHED");
    expect(dsmInfoCalls).toBe(1);
  });

  it("does not let a stale in-flight getOverview replace a later refresh across services", async () => {
    const oldStarted = createBarrier();
    const releaseOld = createBarrier();
    const newStarted = createBarrier();
    let dsmInfoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          oldStarted.release();
          await releaseOld.promise;
          return json({ success: true, data: dsmInfoData("NAS-OLD") });
        }
        newStarted.release();
        return json({ success: true, data: dsmInfoData("NAS-FRESH") });
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const serviceC = runtime.makeService();
    expect(serviceA).not.toBe(serviceB);
    const inFlight = serviceA.getOverview(INTEGRATION_ID, systemAdmin);
    await oldStarted.promise;
    const refreshed = serviceB.refreshOverview(INTEGRATION_ID, systemAdmin);
    await newStarted.promise;
    const fresh = await refreshed;
    expect(fresh.system.data?.model).toBe("NAS-FRESH");
    expect(runtime.refreshFence.current(INTEGRATION_ID)).toBe(1);
    releaseOld.release();
    const stale = await inFlight;
    expect(stale.system.data?.model).toBe("NAS-OLD");
    const cached = await serviceC.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cached.system.data?.model).toBe("NAS-FRESH");
    expect(dsmInfoCalls).toBe(2);
  });

  it("does not serve OLD from cache when OLD finishes after advance but before NEW", async () => {
    const oldStarted = createBarrier();
    const releaseOld = createBarrier();
    const newStarted = createBarrier();
    const releaseNew = createBarrier();
    let dsmInfoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          oldStarted.release();
          await releaseOld.promise;
          return json({ success: true, data: dsmInfoData("NAS-OLD") });
        }
        newStarted.release();
        await releaseNew.promise;
        return json({ success: true, data: dsmInfoData("NAS-FRESH") });
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const inFlight = serviceA.getOverview(INTEGRATION_ID, systemAdmin);
    await oldStarted.promise;
    const refreshed = serviceB.refreshOverview(INTEGRATION_ID, systemAdmin);
    await newStarted.promise;
    releaseOld.release();
    const stale = await inFlight;
    expect(stale.system.data?.model).toBe("NAS-OLD");
    releaseNew.release();
    const fresh = await refreshed;
    expect(fresh.system.data?.model).toBe("NAS-FRESH");
    const cached = await serviceB.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cached.system.data?.model).toBe("NAS-FRESH");
    expect(dsmInfoCalls).toBe(2);
  });

  it("keeps the later concurrent refresh as the active cache generation", async () => {
    const firstStarted = createBarrier();
    const releaseFirst = createBarrier();
    const secondStarted = createBarrier();
    const releaseSecond = createBarrier();
    let dsmInfoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          firstStarted.release();
          await releaseFirst.promise;
          return json({ success: true, data: dsmInfoData("NAS-A") });
        }
        secondStarted.release();
        await releaseSecond.promise;
        return json({ success: true, data: dsmInfoData("NAS-B") });
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const serviceC = runtime.makeService();
    const first = serviceA.refreshOverview(INTEGRATION_ID, systemAdmin);
    await firstStarted.promise;
    const second = serviceB.refreshOverview(INTEGRATION_ID, systemAdmin);
    await secondStarted.promise;
    releaseSecond.release();
    const later = await second;
    expect(later.system.data?.model).toBe("NAS-B");
    expect(runtime.refreshFence.current(INTEGRATION_ID)).toBe(2);
    releaseFirst.release();
    const earlier = await first;
    expect(earlier.system.data?.model).toBe("NAS-A");
    const cached = await serviceC.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cached.system.data?.model).toBe("NAS-B");
    expect(dsmInfoCalls).toBe(2);
  });

  it("does not advance the refresh generation when rate-limited", async () => {
    const limiter = new MemorySynologyRefreshRateLimiter(1, 60_000, () => 1_000);
    const created = createService(dsmRequest(), undefined, limiter);
    await created.synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(1);
    await expect(
      created.synology.refreshOverview(INTEGRATION_ID, systemAdmin),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(1);
  });

  it("does not restore the pre-refresh cache after a failed refresh", async () => {
    let infoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        if (infoCalls === 2) return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
        return json(infoPayload());
      }
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: { ...dsmInfoData(infoCalls === 1 ? "NAS-FIRST" : "NAS-RETRY") },
        });
      return dsmRequest()(options);
    });
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(first.system.data?.model).toBe("NAS-FIRST");
    await expect(
      created.synology.refreshOverview(INTEGRATION_ID, systemAdmin),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(created.refreshFence.current(INTEGRATION_ID)).toBe(1);
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(infoCalls).toBe(2);
    const retried = await created.synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(retried.system.data?.model).toBe("NAS-RETRY");
    expect(infoCalls).toBe(3);
  });

  it("coalesces concurrent getOverview cache misses across distinct services", async () => {
    const started = createBarrier();
    const release = createBarrier();
    const counts = { login: 0, dsmInfo: 0, utilization: 0, storage: 0, logout: 0 };
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (options.method === "POST" && options.body?.includes("method=login")) {
        counts.login += 1;
        return dsmRequest()(options);
      }
      if (options.method === "POST") {
        counts.logout += 1;
        return dsmRequest()(options);
      }
      if (api === "SYNO.DSM.Info") {
        counts.dsmInfo += 1;
        started.release();
        await release.promise;
        return json({ success: true, data: dsmInfoData("NAS-SHARED") });
      }
      if (api === "SYNO.Core.System.Utilization") {
        counts.utilization += 1;
        return dsmRequest()(options);
      }
      if (api === "SYNO.Storage.CGI.Storage") {
        counts.storage += 1;
        return dsmRequest()(options);
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const serviceC = runtime.makeService();
    expect(serviceA).not.toBe(serviceB);
    const pending = Promise.all([
      serviceA.getOverview(INTEGRATION_ID, systemAdmin),
      serviceB.getOverview(INTEGRATION_ID, systemAdmin),
      serviceC.getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    await started.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(counts.dsmInfo).toBe(1);
    expect(runtime.overviewCoalescer.size).toBe(1);
    release.release();
    const settled = await pending;
    expect(settled.map((overview) => overview.system.data?.model)).toEqual([
      "NAS-SHARED",
      "NAS-SHARED",
      "NAS-SHARED",
    ]);
    expect(counts).toEqual({ login: 1, dsmInfo: 1, utilization: 1, storage: 1, logout: 1 });
    const cached = await runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin);
    expect(cached.system.data?.model).toBe("NAS-SHARED");
    expect(counts.dsmInfo).toBe(1);
    expect(runtime.overviewCoalescer.size).toBe(0);
  });

  it("retries after a coalesced overview failure", async () => {
    const started = createBarrier();
    const release = createBarrier();
    let fail = true;
    let infoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        if (fail) {
          started.release();
          await release.promise;
          return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
        }
        return json(infoPayload());
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const first = serviceA.getOverview(INTEGRATION_ID, systemAdmin);
    await started.promise;
    const second = serviceB.getOverview(INTEGRATION_ID, systemAdmin);
    release.release();
    await expect(first).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(second).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(infoCalls).toBe(1);
    await expect(
      runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(infoCalls).toBe(1);
    fail = false;
    const recovered = await runtime.makeService().refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(recovered.system.data?.model).toBe("DS920+");
    expect(infoCalls).toBe(2);
  });

  it("does not coalesce a refresh with an older in-flight getOverview", async () => {
    const oldStarted = createBarrier();
    const releaseOld = createBarrier();
    let dsmInfoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) {
          oldStarted.release();
          await releaseOld.promise;
          return json({ success: true, data: dsmInfoData("NAS-OLD") });
        }
        return json({ success: true, data: dsmInfoData("NAS-FRESH") });
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const inFlight = serviceA.getOverview(INTEGRATION_ID, systemAdmin);
    await oldStarted.promise;
    const refreshed = await serviceB.refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(refreshed.system.data?.model).toBe("NAS-FRESH");
    releaseOld.release();
    expect((await inFlight).system.data?.model).toBe("NAS-OLD");
    expect(dsmInfoCalls).toBe(2);
  });

  it("coalesces concurrent getOverview calls that share a refresh generation", async () => {
    const refreshStarted = createBarrier();
    const releaseRefresh = createBarrier();
    let dsmInfoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.DSM.Info") {
        dsmInfoCalls += 1;
        if (dsmInfoCalls === 1) return json({ success: true, data: dsmInfoData("NAS-FIRST") });
        refreshStarted.release();
        await releaseRefresh.promise;
        return json({ success: true, data: dsmInfoData("NAS-GEN1") });
      }
      return dsmRequest()(options);
    });
    const serviceA = runtime.makeService();
    const serviceB = runtime.makeService();
    const serviceC = runtime.makeService();
    await serviceA.getOverview(INTEGRATION_ID, systemAdmin);
    const refresh = serviceA.refreshOverview(INTEGRATION_ID, systemAdmin);
    await refreshStarted.promise;
    const joined = Promise.all([
      serviceB.getOverview(INTEGRATION_ID, systemAdmin),
      serviceC.getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    releaseRefresh.release();
    const [fresh, [fromB, fromC]] = await Promise.all([refresh, joined]);
    expect([fresh, fromB, fromC].map((overview) => overview.system.data?.model)).toEqual([
      "NAS-GEN1",
      "NAS-GEN1",
      "NAS-GEN1",
    ]);
    expect(dsmInfoCalls).toBe(2);
  });

  it("marks inconsistent utilization totals as an unavailable resources section", async () => {
    const cpu = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System.Utilization")
        return json({
          success: true,
          data: {
            cpu: { user_load: 60, system_load: 60, other_load: 0 },
            memory: { total_real: 4096, avail_real: 1024 },
          },
        });
      return dsmRequest()(options);
    });
    const cpuOverview = await cpu.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(cpuOverview.status).toBe("degraded");
    expect(cpuOverview.resources.status).toBe("unavailable");
    expect(cpuOverview.resources.reason).toBe("invalid-response");
    expect(cpuOverview.resources.data).toBeNull();
    expect(cpuOverview.system.status).toBe("available");
    expect(cpuOverview.storage.status).toBe("available");

    const memory = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Core.System.Utilization")
        return json({
          success: true,
          data: {
            cpu: { user_load: 1, system_load: 1, other_load: 1 },
            memory: { total_real: 4096, avail_real: 5000 },
          },
        });
      return dsmRequest()(options);
    });
    const memoryOverview = await memory.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(memoryOverview.status).toBe("degraded");
    expect(memoryOverview.resources.status).toBe("unavailable");
    expect(memoryOverview.resources.reason).toBe("invalid-response");
    expect(memoryOverview.resources.data).toBeNull();
  });

  it("discards a stale device enrollment after the password changes", async () => {
    const started = createBarrier();
    const release = createBarrier();
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        started.release();
        await release.promise;
        return json({
          success: true,
          data: { sid: "SID-OLD", synotoken: "TOK-OLD", did: "DID-OLD" },
        });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(1);
    const pending = created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await started.promise;
    const nextPassword = encryptSecret(created.keyring, {
      integrationId: INTEGRATION_ID,
      key: "password",
      plaintext: "n3wpass",
    });
    await created.store.upsertSecret(INTEGRATION_ID, { key: "password", ...nextPassword });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    release.release();
    await expect(pending).rejects.toMatchObject({ code: "STALE_RESULT" });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    const password = created.secrets.find((row) => row.key === "password");
    expect(password).toBeDefined();
    expect(
      decryptSecret(created.keyring, {
        ...password!,
        integrationId: INTEGRATION_ID,
      }),
    ).toBe("n3wpass");
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-OLD|n3wpass|s3cret/u);
  });

  it("discards a stale device enrollment after the configuration changes", async () => {
    const started = createBarrier();
    const release = createBarrier();
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        started.release();
        await release.promise;
        return json({
          success: true,
          data: { sid: "SID-OLD", synotoken: "TOK-OLD", did: "DID-OLD" },
        });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    const pending = created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await started.promise;
    await created.store.update({
      id: INTEGRATION_ID,
      baseUrl: "https://nas-b.example:5001/",
      bumpRevision: true,
      resetStatus: true,
    });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    release.release();
    await expect(pending).rejects.toMatchObject({ code: "STALE_RESULT" });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.baseUrl).toBe(
      "https://nas-b.example:5001/",
    );
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-OLD/u);
  });

  it("does not rewrite a device token after clearDevice changes the revision", async () => {
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login"))
        return json({
          success: true,
          data: { sid: "SID-1", synotoken: "TOK-1", did: "DID-FIRST" },
        });
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    await created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);

    const started = createBarrier();
    const release = createBarrier();
    const racing = createSynologyService({
      store: created.store,
      registry: createIntegrationRegistry().register(synologyIntegrationDefinition).freeze(),
      cache: created.cache,
      request: async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") return json(infoPayload());
        if (options.method === "POST" && options.body?.includes("method=login")) {
          started.release();
          await release.promise;
          return json({
            success: true,
            data: { sid: "SID-2", synotoken: "TOK-2", did: "DID-STALE" },
          });
        }
        if (options.method === "POST") return json({ success: true, data: {} });
        throw new Error(String(options.url));
      },
      refreshRateLimiter: new MemorySynologyRefreshRateLimiter(),
      enrollmentRateLimiter: created.enrollmentRateLimiter,
      refreshFence: created.refreshFence,
      overviewCoalescer: created.overviewCoalescer,
      keyring: created.keyring,
    });
    const pending = racing.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await started.promise;
    await created.synology.clearDevice(INTEGRATION_ID, adminDefault);
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(3);
    release.release();
    await expect(pending).rejects.toMatchObject({ code: "STALE_RESULT" });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-FIRST|DID-STALE/u);
  });

  it("fences a pending enrollment when clearDevice runs with no stored deviceId", async () => {
    const started = createBarrier();
    const release = createBarrier();
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        started.release();
        await release.promise;
        return json({
          success: true,
          data: { sid: "SID-OLD", synotoken: "TOK-OLD", did: "DID-OLD" },
        });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(1);
    const pending = created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await started.promise;
    await created.synology.clearDevice(INTEGRATION_ID, adminDefault);
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    release.release();
    await expect(pending).rejects.toMatchObject({ code: "STALE_RESULT" });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-OLD/u);
  });

  it("clears a deviceId that enrollment persisted before clearDevice", async () => {
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login"))
        return json({
          success: true,
          data: { sid: "SID-A", synotoken: "TOK-A", did: "DID-A" },
        });
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(1);
    await expect(
      created.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).resolves.toEqual({ enrolled: true });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(true);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    await expect(created.synology.clearDevice(INTEGRATION_ID, adminDefault)).resolves.toEqual({
      cleared: true,
    });
    expect(created.secrets.some((row) => row.key === "deviceId")).toBe(false);
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(3);
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-A/u);
  });

  it("lets only the first concurrent enrollment persist its device token", async () => {
    const firstStarted = createBarrier();
    const releaseFirst = createBarrier();
    const secondStarted = createBarrier();
    const releaseSecond = createBarrier();
    let logins = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        logins += 1;
        if (logins === 1) {
          firstStarted.release();
          await releaseFirst.promise;
          return json({
            success: true,
            data: { sid: "SID-A", synotoken: "TOK-A", did: "DID-A" },
          });
        }
        secondStarted.release();
        await releaseSecond.promise;
        return json({
          success: true,
          data: { sid: "SID-B", synotoken: "TOK-B", did: "DID-B" },
        });
      }
      if (options.method === "POST") return json({ success: true, data: {} });
      throw new Error(String(options.url));
    });
    const first = created.synology.enrollDevice(INTEGRATION_ID, "111111", adminDefault);
    await firstStarted.promise;
    const second = created.synology.enrollDevice(INTEGRATION_ID, "222222", adminDefault);
    await secondStarted.promise;
    releaseFirst.release();
    await expect(first).resolves.toEqual({ enrolled: true });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    releaseSecond.release();
    await expect(second).rejects.toMatchObject({ code: "STALE_RESULT" });
    expect((await created.store.findById(INTEGRATION_ID))?.configRevision).toBe(2);
    const device = created.secrets.find((row) => row.key === "deviceId");
    expect(device).toBeDefined();
    expect(
      decryptSecret(created.keyring, {
        ...device!,
        integrationId: INTEGRATION_ID,
      }),
    ).toBe("DID-A");
    expect(JSON.stringify(created.secrets)).not.toMatch(/DID-A|DID-B/u);
  });

  it("rate-limits trusted-device enrollment before a sixth DSM login", async () => {
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => 1_000);
    const { synology } = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return undefined;
      }),
      undefined,
      undefined,
      {},
      limiter,
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault)).resolves.toEqual({
        enrolled: true,
      });
    await expect(
      synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many Synology device enrollment attempts",
    });
    expect(loginCalls).toBe(5);
  });

  it("counts invalid OTP enrollments against the limiter before blocking the sixth", async () => {
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => 1_000);
    const { synology } = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return json({ success: false, error: { code: 404 } });
      }),
      undefined,
      undefined,
      {},
      limiter,
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(
        synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(loginCalls).toBe(5);
  });

  it("resets enrollment attempts after the rate-limit window", async () => {
    let now = 1_000;
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => now);
    const { synology } = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return undefined;
      }),
      undefined,
      undefined,
      {},
      limiter,
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await expect(
      synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    now = 1_000 + 60_001;
    await expect(synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault)).resolves.toEqual({
      enrolled: true,
    });
    expect(loginCalls).toBe(6);
  });

  it("isolates enrollment quotas by actor and integration", async () => {
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => 1_000);
    const first = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return undefined;
      }),
      undefined,
      undefined,
      {},
      limiter,
    );
    const second = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return undefined;
      }),
      { id: OTHER_INTEGRATION_ID },
      undefined,
      {},
      limiter,
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await first.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await expect(
      first.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      first.synology.enrollDevice(INTEGRATION_ID, "654321", systemAdmin),
    ).resolves.toEqual({ enrolled: true });
    await expect(
      second.synology.enrollDevice(OTHER_INTEGRATION_ID, "654321", adminDefault),
    ).resolves.toEqual({ enrolled: true });
    expect(loginCalls).toBe(7);
  });

  it("shares the enrollment limiter across recreated services", async () => {
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => 1_000);
    const runtime = createSharedRuntime(
      enrollTransport(() => {
        loginCalls += 1;
        return undefined;
      }),
      undefined,
      limiter,
    );
    const service1 = runtime.makeService();
    const service2 = runtime.makeService();
    for (let attempt = 0; attempt < 3; attempt += 1)
      await service1.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    for (let attempt = 0; attempt < 2; attempt += 1)
      await service2.enrollDevice(INTEGRATION_ID, "654321", adminDefault);
    await expect(
      service2.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(loginCalls).toBe(5);
  });

  it("does not consume the enrollment limiter for a wrong-type integration", async () => {
    let requestCalls = 0;
    let limiterCalls = 0;
    const { synology } = createService(
      async (options) => {
        requestCalls += 1;
        return enrollTransport()(options);
      },
      { type: "docker", name: "Docker Host", baseUrl: "http://127.0.0.1:2375/" },
      undefined,
      {},
      {
        tryConsume() {
          limiterCalls += 1;
          return true;
        },
      },
    );
    await expect(
      synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(limiterCalls).toBe(0);
    expect(requestCalls).toBe(0);
  });

  it("does not consume the enrollment limiter for disabled or misconfigured integrations", async () => {
    let requestCalls = 0;
    let limiterCalls = 0;
    const limiter: IntegrationRateLimiter = {
      tryConsume() {
        limiterCalls += 1;
        return true;
      },
    };
    const counting = async (options: SecureHttpRequest) => {
      requestCalls += 1;
      return enrollTransport()(options);
    };
    const disabled = createService(counting, { enabled: false }, undefined, {}, limiter);
    await expect(
      disabled.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "MISCONFIGURED" });
    const misconfigured = createService(counting, { config: {} }, undefined, {}, limiter);
    await expect(
      misconfigured.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "MISCONFIGURED" });
    const missingPassword = createService(counting, undefined, undefined, {}, limiter);
    missingPassword.secrets.splice(0);
    await expect(
      missingPassword.synology.enrollDevice(INTEGRATION_ID, "654321", adminDefault),
    ).rejects.toMatchObject({ code: "MISCONFIGURED" });
    expect(limiterCalls).toBe(0);
    expect(requestCalls).toBe(0);
  });

  it("marks inconsistent volume capacity as invalid-response without dropping healthy sections", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [
              {
                id: "volume_ok",
                status: "normal",
                size: { total: "1000", used: "400" },
              },
              {
                id: "volume_bad",
                status: "normal",
                size: { total: "1000", used: "1001" },
              },
            ],
            disks: [{ id: "sata1", status: "normal" }],
          },
        });
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.storage.status).toBe("unavailable");
    expect(overview.storage.reason).toBe("invalid-response");
    expect(overview.storage.data).toBeNull();
    expect(overview.system.status).toBe("available");
    expect(overview.resources.status).toBe("available");
  });

  it("keeps coherent degraded volume health distinct from invalid capacity", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [
              {
                id: "volume_1",
                status: "degraded",
                size: { total: "1000", used: "500" },
              },
            ],
            disks: [{ id: "sata1", status: "normal" }],
          },
        });
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.storage.status).toBe("degraded");
    expect(overview.storage.reason).toBeUndefined();
    expect(overview.storage.data?.volumes[0]?.usedBytes).toBe(500);
    expect(overview.storage.data?.volumes[0]?.totalBytes).toBe(1000);
  });

  it("redacts a numeric password reflected as a DSM.Info number", async () => {
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") return json(infoPayload());
        if (options.method === "POST") {
          if (options.body?.includes("method=login")) {
            expect(options.body).toContain("passwd=4096");
            return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
          }
          return json({ success: true, data: {} });
        }
        if (api === "SYNO.DSM.Info")
          return json({
            success: true,
            data: {
              model: "DS920+",
              version_string: "DSM 7.2",
              uptime: 4096,
              ram: 8192,
              temperature: 40,
            },
          });
        return dsmRequest()(options);
      },
      undefined,
      undefined,
      { password: "4096" },
    );
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.system.data?.model).toBe("DS920+");
    expect(overview.system.data?.uptimeSeconds).toBeNull();
    expect(JSON.stringify(overview.system.data)).not.toContain("4096");
  });

  it("redacts a numeric password reflected as a storage total", async () => {
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") return json(infoPayload());
        if (options.method === "POST") {
          if (options.body?.includes("method=login")) {
            expect(options.body).toContain("passwd=1000");
            return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
          }
          return json({ success: true, data: {} });
        }
        if (api === "SYNO.Storage.CGI.Storage")
          return json({
            success: true,
            data: {
              volumes: [
                {
                  id: "volume_1",
                  status: "normal",
                  size: { total: 1000, used: 400 },
                },
              ],
              disks: [{ id: "sata1", status: "normal" }],
            },
          });
        return dsmRequest()(options);
      },
      undefined,
      undefined,
      { password: "1000" },
    );
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.storage.data?.volumes[0]?.usedBytes).toBe(400);
    expect(overview.storage.data?.volumes[0]?.totalBytes).toBeNull();
    expect(overview.storage.data?.volumes[0]?.freeBytes).toBeNull();
    expect(JSON.stringify(overview.storage.data)).not.toContain("1000");
  });

  it("rejects a nonpositive raw disk capacity as invalid-response", async () => {
    for (const sizeTotal of [0, -1, "-1"] as const) {
      const { synology } = createService(async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.Storage.CGI.Storage")
          return json({
            success: true,
            data: {
              volumes: [{ id: "volume_1", status: "normal" }],
              disks: [{ id: "sata1", status: "normal", size_total: sizeTotal }],
            },
          });
        return dsmRequest()(options);
      });
      const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
      expect(overview.status).toBe("degraded");
      expect(overview.storage.status).toBe("unavailable");
      expect(overview.storage.reason).toBe("invalid-response");
      expect(overview.storage.data).toBeNull();
      expect(overview.system.status).toBe("available");
      expect(overview.resources.status).toBe("available");
    }
  });

  it("keeps coherent degraded disk health distinct from invalid capacity", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [{ id: "volume_1", status: "normal" }],
            disks: [{ id: "sata1", status: "degraded", size_total: 1000 }],
          },
        });
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.storage.status).toBe("degraded");
    expect(overview.storage.reason).toBeUndefined();
    expect(overview.storage.data?.disks[0]?.sizeBytes).toBe(1000);
    expect(overview.storage.data?.disks[0]?.status).toBe("degraded");
  });

  it("rejects a negative raw volume size as invalid-response", async () => {
    const { synology } = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.Storage.CGI.Storage")
        return json({
          success: true,
          data: {
            volumes: [
              {
                id: "volume_1",
                status: "normal",
                size: { total: -1000, used: 0 },
              },
            ],
            disks: [{ id: "sata1", status: "normal" }],
          },
        });
      return dsmRequest()(options);
    });
    const overview = await synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.status).toBe("degraded");
    expect(overview.storage.status).toBe("unavailable");
    expect(overview.storage.reason).toBe("invalid-response");
    expect(overview.storage.data).toBeNull();
    expect(overview.system.status).toBe("available");
    expect(overview.resources.status).toBe("available");
  });

  it("redacts a configured DSM account reflected in successful system fields and cache hits", async () => {
    const account = "DSM-ACCOUNT-SECRET";
    let dsmInfoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (options.method === "POST" && options.body?.includes("method=login")) {
          expect(options.body).toContain(`account=${account}`);
          return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
        }
        if (api === "SYNO.DSM.Info") {
          dsmInfoCalls += 1;
          return json({
            success: true,
            data: {
              model: account,
              version_string: `DSM-${account}-build`,
              uptime: "1:00:00",
              ram: 8192,
              temperature: 40,
            },
          });
        }
        return dsmRequest()(options);
      },
      { config: { account, verifyTls: true, timeoutMs: 8000 } },
    );
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    const second = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(dsmInfoCalls).toBe(1);
    expect(JSON.stringify(first)).not.toContain(account);
    expect(JSON.stringify(second)).not.toContain(account);
    expect(first.system.data?.model).toBe("[REDACTED]");
    expect(first.system.data?.dsmVersion).toBe("DSM-[REDACTED]-build");
  });

  it("redacts a configured DSM account substring in the model field", async () => {
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (options.method === "POST" && options.body?.includes("method=login")) {
          expect(options.body).toContain("account=vesty");
          return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
        }
        if (api === "SYNO.DSM.Info")
          return json({
            success: true,
            data: {
              model: "NAS-vesty-prod",
              version_string: "DSM 7.2",
              uptime: "1:00:00",
              ram: 8192,
              temperature: 40,
            },
          });
        return dsmRequest()(options);
      },
      { config: { account: "vesty", verifyTls: true, timeoutMs: 8000 } },
    );
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.system.data?.model).toBe("NAS-[REDACTED]-prod");
    expect(JSON.stringify(overview)).not.toContain("vesty");
  });

  it("redacts a numeric DSM account reflected as a DSM.Info number", async () => {
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (options.method === "POST" && options.body?.includes("method=login")) {
          expect(options.body).toContain("account=4096");
          return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
        }
        if (api === "SYNO.DSM.Info")
          return json({
            success: true,
            data: {
              model: "DS920+",
              version_string: "DSM 7.2",
              uptime: 4096,
              ram: 8192,
              temperature: 40,
            },
          });
        return dsmRequest()(options);
      },
      { config: { account: "4096", verifyTls: true, timeoutMs: 8000 } },
    );
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(overview.system.data?.uptimeSeconds).toBeNull();
    expect(JSON.stringify(overview.system.data)).not.toContain("4096");
  });

  it("redacts a configured DSM account reflected in storage fields", async () => {
    const account = "DSM-ACCOUNT-SECRET";
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (options.method === "POST" && options.body?.includes("method=login"))
          return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
        if (api === "SYNO.Storage.CGI.Storage")
          return json({
            success: true,
            data: {
              volumes: [
                {
                  id: "volume_1",
                  vol_desc: account,
                  status: "normal",
                  size: { total: "1000", used: "400" },
                },
              ],
              disks: [
                {
                  id: "sata1",
                  status: "normal",
                  vendor: account,
                  model: `DISK-${account}`,
                  size_total: "8000",
                },
              ],
            },
          });
        return dsmRequest()(options);
      },
      { config: { account, verifyTls: true, timeoutMs: 8000 } },
    );
    const overview = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(JSON.stringify(overview.storage.data)).not.toContain(account);
    expect(overview.storage.data?.volumes[0]?.name).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.vendor).toBe("[REDACTED]");
    expect(overview.storage.data?.disks[0]?.model).toBe("DISK-[REDACTED]");
  });

  it("caches a normalized overview auth failure for sequential readers", async () => {
    let loginCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") {
        if (options.body?.includes("method=login")) {
          loginCalls += 1;
          return json({ success: false, error: { code: 400 } });
        }
        return json({ success: true, data: {} });
      }
      throw new Error(String(options.url));
    });
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject(
        {
          code: "UNAUTHORIZED",
          message: "Identifiants DSM invalides",
        },
      );
    expect(loginCalls).toBe(1);
    const failure = created.cache.get(
      INTEGRATION_ID,
      overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets)),
    );
    expect(failure).toEqual({ code: "UNAUTHORIZED", message: "Identifiants DSM invalides" });
    expect(Object.keys(failure as object)).toEqual(["code", "message"]);
  });

  it("caches a 2FA-required overview failure without a second DSM login", async () => {
    let loginCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST") {
        if (options.body?.includes("method=login")) {
          loginCalls += 1;
          return json({ success: false, error: { code: 403 } });
        }
        return json({ success: true, data: {} });
      }
      throw new Error(String(options.url));
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "MISCONFIGURED",
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "MISCONFIGURED",
    });
    expect(loginCalls).toBe(1);
  });

  it("caches a discovery timeout without repeating the network call", async () => {
    let infoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
      }
      return dsmRequest()(options);
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(infoCalls).toBe(1);
  });

  it("coalesces concurrent overview failures then serves the cached failure", async () => {
    const started = createBarrier();
    const release = createBarrier();
    let infoCalls = 0;
    const runtime = createSharedRuntime(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        started.release();
        await release.promise;
        return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
      }
      return dsmRequest()(options);
    });
    const pending = Promise.allSettled([
      runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin),
      runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin),
      runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin),
    ]);
    await started.promise;
    release.release();
    const settled = await pending;
    expect(settled.every((result) => result.status === "rejected")).toBe(true);
    expect(infoCalls).toBe(1);
    await expect(
      runtime.makeService().getOverview(INTEGRATION_ID, systemAdmin),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(infoCalls).toBe(1);
  });

  it("expires a cached overview failure and then caches the recovered success", async () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      let infoCalls = 0;
      const created = createService(async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          infoCalls += 1;
          if (fail) return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
          return json(infoPayload());
        }
        return dsmRequest()(options);
      });
      await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject(
        {
          code: "TIMEOUT",
        },
      );
      await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject(
        {
          code: "TIMEOUT",
        },
      );
      expect(infoCalls).toBe(1);
      fail = false;
      await vi.advanceTimersByTimeAsync(SYNOLOGY_OVERVIEW_FAILURE_TTL_MS + 1);
      const recovered = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
      expect(recovered.system.data?.model).toBe("DS920+");
      expect(infoCalls).toBe(2);
      const cached = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
      expect(cached.system.data?.model).toBe("DS920+");
      expect(infoCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a manual refresh bypass a cached overview failure", async () => {
    let fail = true;
    let infoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        if (fail) return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
        return json(infoPayload());
      }
      return dsmRequest()(options);
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(infoCalls).toBe(1);
    fail = false;
    const refreshed = await created.synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    expect(refreshed.system.data?.model).toBe("DS920+");
    expect(infoCalls).toBe(2);
  });

  it("does not reuse a cached overview failure after the password changes", async () => {
    let loginCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") return json(infoPayload());
      if (options.method === "POST" && options.body?.includes("method=login")) {
        loginCalls += 1;
        if (options.body.includes("passwd=n3wpass"))
          return json({ success: true, data: { sid: "SID-NEW", synotoken: "TOK-NEW" } });
        return json({ success: false, error: { code: 400 } });
      }
      return dsmRequest()(options);
    });
    await expect(created.synology.getOverview(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(loginCalls).toBe(1);
    const encrypted = encryptSecret(created.keyring, {
      integrationId: INTEGRATION_ID,
      key: "password",
      plaintext: "n3wpass",
    });
    await created.store.upsertSecret(INTEGRATION_ID, { key: "password", ...encrypted });
    created.cache.invalidate(INTEGRATION_ID);
    const recovered = await created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    expect(recovered.system.data?.model).toBe("DS920+");
    expect(loginCalls).toBe(2);
  });

  it("does not write a stale-generation overview failure after refresh", async () => {
    const started = createBarrier();
    const release = createBarrier();
    let infoCalls = 0;
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info") {
        infoCalls += 1;
        if (infoCalls === 1) {
          started.release();
          await release.promise;
          return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
        }
        return json(infoPayload());
      }
      return dsmRequest()(options);
    });
    const inFlight = created.synology.getOverview(INTEGRATION_ID, systemAdmin);
    await started.promise;
    const refresh = created.synology.refreshOverview(INTEGRATION_ID, systemAdmin);
    release.release();
    await expect(inFlight).rejects.toMatchObject({ code: "TIMEOUT" });
    const refreshed = await refresh;
    expect(refreshed.system.data?.model).toBe("DS920+");
    expect(
      created.cache.get(
        INTEGRATION_ID,
        overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets, 0)),
      ),
    ).toBeUndefined();
    expect(
      created.cache.get(
        INTEGRATION_ID,
        overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets, 1)),
      ),
    ).toBeUndefined();
    expect(infoCalls).toBe(2);
  });

  it("redacts credentials from a cached overview failure message", async () => {
    const created = createService(async (options) => {
      const api = new URL(String(options.url)).searchParams.get("api");
      if (api === "SYNO.API.Info")
        throw new IntegrationError(
          "UNAUTHORIZED",
          "login failed account=monitor password=s3cret sid=SIDTOKEN did=DIDTOKEN",
        );
      return dsmRequest()(options);
    });
    const first = await created.synology.getOverview(INTEGRATION_ID, systemAdmin).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(first).toMatchObject({ code: "UNAUTHORIZED" });
    expect(JSON.stringify(first)).not.toMatch(/monitor|s3cret|SIDTOKEN|DIDTOKEN/u);
    const second = await created.synology.getOverview(INTEGRATION_ID, systemAdmin).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(second).toMatchObject({ code: "UNAUTHORIZED", message: (first as Error).message });
    expect(JSON.stringify(second)).not.toMatch(/monitor|s3cret|SIDTOKEN|DIDTOKEN/u);
    const cached = created.cache.get(
      INTEGRATION_ID,
      overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets)),
    );
    expect(cached).toEqual({ code: "UNAUTHORIZED", message: (first as Error).message });
    expect(Object.keys(cached as object)).toEqual(["code", "message"]);
  });

  it("keys refresh limiter, fence, and cache invalidate by the canonical record id", async () => {
    const CANONICAL = "abcdef12-3456-7890-abcd-ef1234567890";
    const ALIAS = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    const consumed: string[] = [];
    let infoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          infoCalls += 1;
          return json(infoPayload());
        }
        if (api === "SYNO.DSM.Info")
          return json({
            success: true,
            data: { ...dsmInfoData(infoCalls === 1 ? "NAS-STALE" : "NAS-FRESH") },
          });
        return dsmRequest()(options);
      },
      { id: CANONICAL },
      {
        tryConsume(_actorId, integrationId) {
          consumed.push(integrationId);
          return true;
        },
      },
      { idAliases: [ALIAS] },
    );

    const first = await created.synology.getOverview(CANONICAL, systemAdmin);
    expect(first.system.data?.model).toBe("NAS-STALE");
    expect(created.refreshFence.current(CANONICAL)).toBe(0);
    expect(created.refreshFence.current(ALIAS)).toBe(0);

    const refreshed = await created.synology.refreshOverview(ALIAS, systemAdmin);
    expect(refreshed.system.data?.model).toBe("NAS-FRESH");
    expect(consumed).toEqual([CANONICAL]);
    expect(created.refreshFence.current(CANONICAL)).toBe(1);
    expect(created.refreshFence.current(ALIAS)).toBe(0);
    expect(infoCalls).toBe(2);

    const cached = await created.synology.getOverview(CANONICAL, systemAdmin);
    expect(cached.system.data?.model).toBe("NAS-FRESH");
    expect(infoCalls).toBe(2);
  });

  it("shares refresh quota across UUID case variants of the same record", async () => {
    const CANONICAL = "abcdef12-3456-7890-abcd-ef1234567890";
    const ALIAS = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    const limiter = new MemorySynologyRefreshRateLimiter(4, 60_000, () => 1_000);
    let infoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          infoCalls += 1;
          return json(infoPayload());
        }
        return dsmRequest()(options);
      },
      { id: CANONICAL },
      limiter,
      { idAliases: [ALIAS] },
    );
    const ids = [CANONICAL, ALIAS, CANONICAL, ALIAS];
    for (const id of ids)
      await expect(created.synology.refreshOverview(id, systemAdmin)).resolves.toMatchObject({
        status: expect.stringMatching(/available|degraded/u),
      });
    await expect(created.synology.refreshOverview(ALIAS, systemAdmin)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(created.synology.refreshOverview(CANONICAL, systemAdmin)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(infoCalls).toBe(4);
  });

  it("reads the canonical refresh generation when getOverview receives an alias id", async () => {
    const CANONICAL = "abcdef12-3456-7890-abcd-ef1234567890";
    const ALIAS = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    let infoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          infoCalls += 1;
          return json(infoPayload());
        }
        return dsmRequest()(options);
      },
      { id: CANONICAL },
      undefined,
      { idAliases: [ALIAS] },
    );
    expect(created.refreshFence.advance(CANONICAL)).toBe(1);
    created.cache.set(
      CANONICAL,
      overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets, 1)),
      { code: "TIMEOUT", message: "cached failure" },
      SYNOLOGY_OVERVIEW_FAILURE_TTL_MS,
    );
    await expect(created.synology.getOverview(ALIAS, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "cached failure",
    });
    expect(infoCalls).toBe(0);
  });

  it("shares overview failure cache across UUID case variants", async () => {
    const CANONICAL = "abcdef12-3456-7890-abcd-ef1234567890";
    const ALIAS = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    let infoCalls = 0;
    const created = createService(
      async (options) => {
        const api = new URL(String(options.url)).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          infoCalls += 1;
          return { ok: false, code: "TIMEOUT", latencyMs: 8000 };
        }
        return dsmRequest()(options);
      },
      { id: CANONICAL },
      undefined,
      { idAliases: [ALIAS] },
    );
    await expect(created.synology.getOverview(ALIAS, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(infoCalls).toBe(1);
    await expect(created.synology.getOverview(CANONICAL, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(infoCalls).toBe(1);
    expect(
      created.cache.get(
        CANONICAL,
        overviewFailureCacheOperation(synologyOverviewCacheOperation(1, created.secrets)),
      ),
    ).toMatchObject({ code: "TIMEOUT" });
  });

  it("shares enrollment quota across UUID case variants of the same record", async () => {
    const CANONICAL = "abcdef12-3456-7890-abcd-ef1234567890";
    const ALIAS = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    let loginCalls = 0;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => 1_000);
    const { synology } = createService(
      enrollTransport(() => {
        loginCalls += 1;
        return json({ success: false, error: { code: 404 } });
      }),
      { id: CANONICAL },
      undefined,
      { idAliases: [ALIAS] },
      limiter,
    );
    for (const id of [CANONICAL, CANONICAL, CANONICAL, ALIAS, ALIAS])
      await expect(synology.enrollDevice(id, "654321", adminDefault)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    await expect(synology.enrollDevice(ALIAS, "654321", adminDefault)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(synology.enrollDevice(CANONICAL, "654321", adminDefault)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(loginCalls).toBe(5);
  });
});
