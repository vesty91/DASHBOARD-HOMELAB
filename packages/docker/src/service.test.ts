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
import { TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { DOCKER_BOOTSTRAP_MAX_BYTES, DOCKER_LIST_MAX_BYTES } from "./client";
import { dockerIntegrationDefinition } from "./definition";
import { MemoryDockerActionRateLimiter } from "./rate-limiter";
import { createDockerService } from "./service";

const ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

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

function createMemoryStore(record?: Partial<IntegrationRecord>): IntegrationStore {
  const row: IntegrationRecord = {
    id: INTEGRATION_ID,
    type: "docker",
    name: "Docker",
    baseUrl: "http://socket-proxy.invalid:2375/",
    enabled: true,
    config: { verifyTls: true, timeoutMs: 8000 },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...record,
  };
  const rows = new Map<string, IntegrationRecord>([[row.id, row]]);
  return {
    async list() {
      return [...rows.values()];
    },
    async findById(id) {
      return rows.get(id);
    },
    async create() {
      throw new Error("unused");
    },
    async update() {
      return undefined;
    },
    async delete() {
      return false;
    },
    async listSecretStates() {
      return [];
    },
    async loadEncryptedSecrets(): Promise<readonly EncryptedSecretRow[]> {
      return [];
    },
    async upsertSecret() {},
    async persistConnectionResult() {
      return true;
    },
  };
}

function jsonResult(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 4 };
}

function textResult(body: string, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(body), latencyMs: 3 };
}

function versionPayload() {
  return {
    Version: "28.3.0",
    ApiVersion: "1.55",
    MinAPIVersion: "1.40",
    Os: "linux",
    Arch: "amd64",
  };
}

function containerSummary() {
  return {
    Id: ID,
    Names: ["/jellyfin"],
    Image: "jellyfin/jellyfin:10",
    Created: 1_700_000_000,
    State: "running",
    Status: "Up 2 hours",
    Ports: [{ PrivatePort: 8096, PublicPort: 8096, Type: "tcp", IP: "0.0.0.0" }],
    Env: ["PASSWORD=SECRET"],
    Labels: { token: "SECRET" },
    Mounts: [{ Destination: "/config" }],
    HostConfig: { Privileged: true },
    Command: "jellyfin",
  };
}

function inspectPayload() {
  return {
    Id: ID,
    Name: "/jellyfin",
    Image: "sha256:abc",
    RestartCount: 1,
    State: {
      Status: "running",
      StartedAt: new Date(Date.now() - 120_000).toISOString(),
      FinishedAt: "0001-01-01T00:00:00Z",
      Health: { Status: "healthy" },
    },
    Config: {
      Image: "jellyfin/jellyfin:10",
      Env: ["PASSWORD=SECRET"],
      Labels: { token: "SECRET" },
      Cmd: ["jellyfin"],
      Tty: false,
    },
    HostConfig: { Privileged: true },
    Mounts: [{ Destination: "/config" }],
    NetworkSettings: { Ports: { "8096/tcp": [{ HostIp: "0.0.0.0", HostPort: "8096" }] } },
  };
}

function serviceFor(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  cache = new MemoryIntegrationCache(),
  limiter = new MemoryDockerActionRateLimiter(),
  store = createMemoryStore(),
) {
  return createDockerService({
    store,
    registry: createIntegrationRegistry().register(dockerIntegrationDefinition).freeze(),
    cache,
    actionRateLimiter: limiter,
    request,
  });
}

describe("DockerService", () => {
  it("lists containers through the allowlist and strips secrets", async () => {
    const calls: string[] = [];
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      calls.push(`${options.method ?? "GET"} ${new URL(href).pathname}${new URL(href).search}`);
      expect(options.maxRetries).toBe(0);
      if (href.endsWith("/version")) {
        expect(options.maxBodyBytes).toBe(DOCKER_BOOTSTRAP_MAX_BYTES);
        return jsonResult(versionPayload());
      }
      if (href.includes("/containers/json")) {
        expect(options.maxBodyBytes).toBe(DOCKER_LIST_MAX_BYTES);
        return jsonResult([containerSummary()]);
      }
      throw new Error(href);
    });
    const listed = await docker.listContainers({ integrationId: INTEGRATION_ID }, systemAdmin);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: ID,
      image: "jellyfin/jellyfin:10",
      recognizedApp: { id: "jellyfin" },
    });
    expect(JSON.stringify(listed)).not.toContain("PASSWORD");
    expect(JSON.stringify(listed)).not.toMatch(/Env|Labels|Mounts|HostConfig|Command/);
    expect(calls.some((call) => call.includes("/v1.55/containers/json"))).toBe(true);
  });

  it("rejects a container list that contains an invalid entry instead of dropping it", async () => {
    const cache = new MemoryIntegrationCache();
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/containers/json"))
        return jsonResult([containerSummary(), { ...containerSummary(), Id: "short-id" }]);
      throw new Error(href);
    }, cache);
    await expect(
      docker.listContainers({ integrationId: INTEGRATION_ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(cache.get(INTEGRATION_ID, "docker.containers.list:100")).toBeUndefined();
  });

  it("inspects, stats, and logs without caching logs", async () => {
    let logCalls = 0;
    const cache = new MemoryIntegrationCache();
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.endsWith("/json")) return jsonResult(inspectPayload());
      if (href.includes("/stats"))
        return jsonResult({
          id: ID,
          cpu_stats: {
            cpu_usage: { total_usage: 200, percpu_usage: [1] },
            system_cpu_usage: 400,
            online_cpus: 1,
          },
          precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 },
        });
      if (href.includes("/logs")) {
        expect(options.onBodyLimit).toBe("truncate");
        logCalls += 1;
        return textResult("line\n");
      }
      throw new Error(href);
    }, cache);
    const detail = await docker.getContainer(
      { integrationId: INTEGRATION_ID, containerId: ID },
      systemAdmin,
    );
    expect(detail.health).toBe("healthy");
    expect(detail.uptimeSeconds).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain("SECRET");
    const cachedInspect = cache.get(INTEGRATION_ID, `docker.containers.inspect:${ID}`);
    expect(cachedInspect).toMatchObject({ tty: false, detail: { id: ID } });
    expect(JSON.stringify(cachedInspect)).not.toMatch(
      /Env|Labels|Mounts|HostConfig|PASSWORD|SECRET/,
    );
    const stats = await docker.getContainerStats(
      { integrationId: INTEGRATION_ID, containerId: ID },
      systemAdmin,
    );
    expect(stats.cpuPercent).toBe(50);
    await docker.getContainerLogs(
      { integrationId: INTEGRATION_ID, containerId: ID, tail: 20 },
      systemAdmin,
    );
    await docker.getContainerLogs(
      { integrationId: INTEGRATION_ID, containerId: ID, tail: 20 },
      systemAdmin,
    );
    expect(logCalls).toBe(2);
    const truncated = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.endsWith("/json")) return jsonResult(inspectPayload());
      if (href.includes("/logs"))
        return {
          ok: true,
          status: 200,
          body: Buffer.from("kept\n"),
          latencyMs: 1,
          truncated: true,
        };
      throw new Error(href);
    });
    await expect(
      truncated.getContainerLogs({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).resolves.toMatchObject({ text: "kept\n", truncated: true });
  });

  it("rejects inspect payloads whose container id differs from the request", async () => {
    const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.endsWith("/json")) return jsonResult({ ...inspectPayload(), Id: other });
      throw new Error(href);
    });
    await expect(
      docker.getContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects stats payloads whose container id differs from the request", async () => {
    const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await expect(
      serviceFor(async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        if (href.includes("/stats")) return jsonResult({ id: other });
        throw new Error(href);
      }).getContainerStats({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      serviceFor(async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        if (href.includes("/stats")) return jsonResult({});
        throw new Error(href);
      }).getContainerStats({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects non-object Docker stats payloads", async () => {
    await expect(
      serviceFor(async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        if (href.includes("/stats")) return jsonResult("not-an-object");
        throw new Error(href);
      }).getContainerStats({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      serviceFor(async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        if (href.includes("/stats")) return jsonResult([]);
        throw new Error(href);
      }).getContainerStats({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("posts start/stop/restart exactly once and invalidates cache", async () => {
    const methods: string[] = [];
    const cache = new MemoryIntegrationCache();
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      methods.push(`${options.method ?? "GET"} ${new URL(href).pathname}${new URL(href).search}`);
      expect(options.maxRetries).toBe(0);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/start") || href.includes("/stop") || href.includes("/restart"))
        return { ok: true, status: 204, body: Buffer.alloc(0), latencyMs: 1 };
      if (href.includes("/containers/json")) return jsonResult([containerSummary()]);
      throw new Error(href);
    }, cache);
    await docker.listContainers({ integrationId: INTEGRATION_ID }, systemAdmin);
    expect(
      await docker.startContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).toEqual({
      changed: true,
    });
    expect(
      await docker.stopContainer(
        { integrationId: INTEGRATION_ID, containerId: ID, timeoutSeconds: 10 },
        systemAdmin,
      ),
    ).toEqual({ changed: true });
    expect(
      await docker.restartContainer(
        { integrationId: INTEGRATION_ID, containerId: ID, timeoutSeconds: 10 },
        systemAdmin,
      ),
    ).toEqual({ changed: true });
    expect(methods.filter((item) => item.startsWith("POST")).sort()).toEqual([
      `POST /v1.55/containers/${ID}/restart?t=10`,
      `POST /v1.55/containers/${ID}/start`,
      `POST /v1.55/containers/${ID}/stop?t=10`,
    ]);
    const after = await docker.listContainers({ integrationId: INTEGRATION_ID }, systemAdmin);
    expect(after).toHaveLength(1);
    expect(methods.filter((item) => item.includes("/containers/json"))).toHaveLength(2);
  });

  it("maps 304/403/404/409 and never sends a request for invalid actions", async () => {
    const docker = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/start"))
        return { ok: true, status: 304, body: Buffer.alloc(0), latencyMs: 1 };
      if (href.includes("/stop"))
        return { ok: true, status: 403, body: Buffer.alloc(0), latencyMs: 1 };
      if (href.includes("/restart"))
        return { ok: true, status: 409, body: Buffer.alloc(0), latencyMs: 1 };
      throw new Error(href);
    });
    expect(
      await docker.startContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).toEqual({
      changed: false,
    });
    await expect(
      docker.stopContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      docker.restartContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const calls: string[] = [];
    const guarded = serviceFor(async (options) => {
      calls.push(String(options.url));
      return jsonResult(versionPayload());
    });
    await expect(
      guarded.startContainer({ integrationId: INTEGRATION_ID, containerId: "short" }, systemAdmin),
    ).rejects.toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("enforces the Docker permission matrix", async () => {
    const docker = serviceFor(async () => jsonResult(versionPayload()));
    await expect(
      docker.listContainers({ integrationId: INTEGRATION_ID }, { userId: null, subject: null }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      docker.listContainers({ integrationId: INTEGRATION_ID }, actor(["docker.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      docker.listContainers({ integrationId: INTEGRATION_ID }, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const reader = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/containers/json")) return jsonResult([containerSummary()]);
      if (href.includes("/stats")) return jsonResult({ id: ID });
      if (href.endsWith("/json")) return jsonResult(inspectPayload());
      if (href.includes("/logs") || href.includes("/restart"))
        throw new Error("should not be called");
      throw new Error(href);
    });
    const readActor = actor(["integration.use", "docker.read"]);
    await expect(
      reader.listContainers({ integrationId: INTEGRATION_ID }, readActor),
    ).resolves.toHaveLength(1);
    await expect(
      reader.getContainerStats({ integrationId: INTEGRATION_ID, containerId: ID }, readActor),
    ).resolves.toBeTruthy();
    await expect(
      reader.getContainerLogs({ integrationId: INTEGRATION_ID, containerId: ID }, readActor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reader.restartContainer({ integrationId: INTEGRATION_ID, containerId: ID }, readActor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const logsActor = actor(["integration.use", "docker.logs"]);
    const logs = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.endsWith("/json")) return jsonResult(inspectPayload());
      if (href.includes("/logs")) return textResult("ok");
      throw new Error(href);
    });
    await expect(
      logs.getContainerLogs({ integrationId: INTEGRATION_ID, containerId: ID }, logsActor),
    ).resolves.toMatchObject({
      text: "ok",
    });
    const restarter = actor(["integration.interact", "docker.restart"]);
    const restartService = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/restart"))
        return { ok: true, status: 204, body: Buffer.alloc(0), latencyMs: 1 };
      throw new Error(href);
    });
    await expect(
      restartService.restartContainer(
        { integrationId: INTEGRATION_ID, containerId: ID },
        restarter,
      ),
    ).resolves.toEqual({ changed: true });
    expect(docker.permissions(adminDefault)).toMatchObject({
      canRead: false,
      canRestart: false,
      canManage: false,
    });
    expect(docker.permissions(systemAdmin).canRestart).toBe(true);
    const manager = actor(["integration.manage", "docker.manage"]);
    expect(docker.permissions(manager)).toMatchObject({
      canRead: true,
      canLogs: true,
      canStart: true,
      canStop: true,
      canRestart: true,
      canManage: true,
    });
    const managed = serviceFor(async (options) => {
      const href = String(options.url);
      if (href.endsWith("/version")) return jsonResult(versionPayload());
      if (href.includes("/containers/json")) return jsonResult([]);
      throw new Error(href);
    });
    await expect(
      managed.listContainers({ integrationId: INTEGRATION_ID }, manager),
    ).resolves.toEqual([]);
  });

  it("returns safe Docker metadata for delegated readers without a network call", async () => {
    const reader = actor(["integration.use", "docker.read"]);
    const docker = serviceFor(async () => {
      throw new Error("network should not be called");
    });
    await expect(docker.getIntegrationMetadata(INTEGRATION_ID, reader)).resolves.toEqual({
      id: INTEGRATION_ID,
      name: "Docker",
      enabled: true,
    });
    const serialized = JSON.stringify(await docker.getIntegrationMetadata(INTEGRATION_ID, reader));
    expect(serialized).not.toMatch(/baseUrl|trustedCaPem|configRevision|secrets|PASSWORD/u);
    await expect(
      docker.getIntegrationMetadata(INTEGRATION_ID, actor(["docker.read"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      docker.getIntegrationMetadata(INTEGRATION_ID, actor(["integration.use"])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      docker.getIntegrationMetadata(INTEGRATION_ID, { userId: null, subject: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      docker.getIntegrationMetadata("00000000-0000-4000-8000-000000000099", reader),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const otherType = serviceFor(
      async () => {
        throw new Error("network should not be called");
      },
      new MemoryIntegrationCache(),
      new MemoryDockerActionRateLimiter(),
      createMemoryStore({ type: "http-health", name: "Health" }),
    );
    await expect(otherType.getIntegrationMetadata(INTEGRATION_ID, reader)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Définition Docker introuvable",
    });
    const disabled = serviceFor(
      async () => {
        throw new Error("network should not be called");
      },
      new MemoryIntegrationCache(),
      new MemoryDockerActionRateLimiter(),
      createMemoryStore({
        enabled: false,
        name: "Proxy off",
        config: {
          verifyTls: true,
          timeoutMs: 8000,
          trustedCaPem: "-----BEGIN CERTIFICATE-----\nSHOULD-NOT-LEAK\n-----END CERTIFICATE-----",
        },
      }),
    );
    await expect(disabled.getIntegrationMetadata(INTEGRATION_ID, reader)).resolves.toEqual({
      id: INTEGRATION_ID,
      name: "Proxy off",
      enabled: false,
    });
    expect(
      JSON.stringify(await disabled.getIntegrationMetadata(INTEGRATION_ID, reader)),
    ).not.toContain("trustedCaPem");
  });

  it("forwards trustedCaPem on Docker runtime requests", async () => {
    const seen: Array<string | undefined> = [];
    const docker = serviceFor(
      async (options) => {
        seen.push(options.trustedCaPem);
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        throw new Error(href);
      },
      new MemoryIntegrationCache(),
      new MemoryDockerActionRateLimiter(),
      createMemoryStore({
        config: { verifyTls: true, timeoutMs: 8000, trustedCaPem: TEST_TRUSTED_CA_PEM },
      }),
    );
    const system = await docker.getSystem(INTEGRATION_ID, systemAdmin);
    expect(
      seen.some((value) => typeof value === "string" && value.includes("BEGIN CERTIFICATE")),
    ).toBe(true);
    expect(JSON.stringify(system)).not.toMatch(/trustedCaPem|BEGIN CERTIFICATE|baseUrl/u);
  });

  it("rate-limits actions and does not cache errors", async () => {
    let now = 10;
    const limiter = new MemoryDockerActionRateLimiter(1, 60_000, () => now);
    const cache = new MemoryIntegrationCache();
    let versionCalls = 0;
    const docker = serviceFor(
      async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) {
          versionCalls += 1;
          return { ok: false, code: "TIMEOUT", latencyMs: 8 };
        }
        if (href.includes("/start"))
          return { ok: true, status: 204, body: Buffer.alloc(0), latencyMs: 1 };
        throw new Error(href);
      },
      cache,
      limiter,
    );
    await expect(docker.getSystem(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await expect(docker.getSystem(INTEGRATION_ID, systemAdmin)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(versionCalls).toBe(2);
    const ok = serviceFor(
      async (options) => {
        const href = String(options.url);
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        if (href.includes("/start"))
          return { ok: true, status: 204, body: Buffer.alloc(0), latencyMs: 1 };
        throw new Error(href);
      },
      cache,
      limiter,
    );
    await ok.startContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin);
    await expect(
      ok.startContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    now += 60_001;
    await expect(
      ok.startContainer({ integrationId: INTEGRATION_ID, containerId: ID }, systemAdmin),
    ).resolves.toEqual({ changed: true });
  });
});

describe("Docker definition connection test", () => {
  it("returns safe metadata and maps failures", async () => {
    const ok = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async (options) => {
        const href = String(options.url);
        if (href.endsWith("/_ping")) return textResult("OK");
        if (href.endsWith("/version")) return jsonResult(versionPayload());
        throw new Error(href);
      },
    });
    expect(ok).toMatchObject({
      ok: true,
      metadata: {
        engineVersion: "28.3.0",
        negotiatedApiVersion: "1.55",
      },
    });
    const failed = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async () => ({ ok: false, code: "DNS_ERROR", latencyMs: 2 }),
    });
    expect(failed).toMatchObject({ ok: false, code: "DNS_ERROR" });
    const tls = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async () => ({ ok: false, code: "TLS_ERROR", latencyMs: 2 }),
    });
    expect(tls).toMatchObject({ ok: false, code: "TLS_ERROR" });
    const timeout = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async () => ({ ok: false, code: "TIMEOUT", latencyMs: 8000 }),
    });
    expect(timeout).toMatchObject({ ok: false, code: "TIMEOUT" });
    const proxyForbidden = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async () => ({
        ok: true,
        status: 403,
        body: Buffer.from("forbidden"),
        latencyMs: 1,
      }),
    });
    expect(proxyForbidden).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const invalidJson = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async (options) => {
        const href = String(options.url);
        if (href.endsWith("/_ping")) return textResult("OK");
        return { ok: true, status: 200, body: Buffer.from("not-json"), latencyMs: 1 };
      },
    });
    expect(invalidJson).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
    const unsupported = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "http://socket-proxy.invalid:2375/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: {},
      verifyTls: true,
      timeoutMs: 8000,
      request: async (options) => {
        const href = String(options.url);
        if (href.endsWith("/_ping")) return textResult("OK");
        return jsonResult({ Version: "17.0.0", ApiVersion: "1.30", MinAPIVersion: "1.12" });
      },
    });
    expect(unsupported).toMatchObject({ ok: false, code: "UNSUPPORTED_VERSION" });
  });
});
