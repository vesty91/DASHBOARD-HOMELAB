import { describe, expect, it } from "vitest";
import {
  MemoryIntegrationCache,
  createIntegrationRegistry,
  type EncryptedSecretRow,
  type IntegrationRecord,
  type IntegrationStore,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { createEnvKeyring, encryptSecret, type SecretKeyring } from "@dashboard/secrets";
import { synologyOverviewCacheOperation } from "./cache-key";
import { synologyIntegrationDefinition } from "./definition";
import { MemorySynologyRefreshRateLimiter } from "./rate-limiter";
import { createSynologyService } from "./service";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.alloc(32, 9).toString("base64");

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

function createMemoryStore(record?: Partial<IntegrationRecord>): {
  store: IntegrationStore;
  keyring: SecretKeyring;
  secrets: EncryptedSecretRow[];
} {
  const keyring = createEnvKeyring(KEY);
  if (!keyring) throw new Error("keyring");
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
  const password = encryptSecret(keyring, {
    integrationId: row.id,
    key: "password",
    plaintext: "s3cret",
  });
  const secrets: EncryptedSecretRow[] = [{ key: "password", ...password }];
  return {
    keyring,
    secrets,
    store: {
      async list() {
        return [...rows.values()];
      },
      async findById(id) {
        return rows.get(id);
      },
      async create() {
        throw new Error("unused");
      },
      async update(input) {
        const current = rows.get(input.id);
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
        rows.set(input.id, next);
        return next;
      },
      async delete() {
        return false;
      },
      async listSecretStates() {
        return secrets.map((item) => ({ key: item.key, configured: true as const }));
      },
      async loadEncryptedSecrets() {
        return [...secrets];
      },
      async upsertSecret(_id, secret) {
        const index = secrets.findIndex((item) => item.key === secret.key);
        if (index >= 0) secrets[index] = secret;
        else secrets.push(secret);
      },
      async deleteSecret(_id, key) {
        const index = secrets.findIndex((item) => item.key === key);
        if (index < 0) return false;
        secrets.splice(index, 1);
        return true;
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
      return json({ success: true, data: {} });
    }
    expect(options.headers?.cookie).toMatch(/^id=/u);
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
  refreshRateLimiter = new MemorySynologyRefreshRateLimiter(),
) {
  const { store, keyring, secrets } = createMemoryStore(record);
  const cache = new MemoryIntegrationCache();
  return {
    store,
    cache,
    secrets,
    keyring,
    synology: createSynologyService({
      store,
      registry: createIntegrationRegistry().register(synologyIntegrationDefinition).freeze(),
      cache,
      request,
      refreshRateLimiter,
      keyring,
    }),
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
    expect(cleared.system.data?.model).not.toBe("DS-2");
    expect(dsmInfoCalls).toBe(2);
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
});
