import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createEnvKeyring } from "@dashboard/secrets";
import { MemoryIntegrationCache } from "./cache";
import { createIntegrationRegistry } from "./registry";
import { MemoryTestRateLimiter } from "./rate-limiter";
import { createIntegrationService } from "./service";
import { createTestHttpIntegrationDefinition } from "./test-support";
import type { EncryptedSecretRow, IntegrationRecord, IntegrationStore } from "./types";

const SENTINEL = "SUPER_SECRET_VALUE_123";
const keyring = createEnvKeyring(Buffer.alloc(32, 11).toString("base64"))!;
const admin = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: {
    status: "active" as const,
    isSystemAdmin: false,
    directPermissions: ["integration.create", "integration.read", "integration.manage"],
  },
};
const reader = {
  userId: "00000000-0000-4000-8000-000000000002",
  subject: {
    status: "active" as const,
    isSystemAdmin: false,
    directPermissions: ["integration.read"],
  },
};

function createMemoryStore(): IntegrationStore & { secrets: Map<string, EncryptedSecretRow[]> } {
  const rows = new Map<string, IntegrationRecord>();
  const secrets = new Map<string, EncryptedSecretRow[]>();
  const now = () => new Date();
  return {
    secrets,
    async list(limit, cursor) {
      return [...rows.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .filter((row) => !cursor || row.id > cursor)
        .slice(0, limit);
    },
    async findById(id) {
      return rows.get(id);
    },
    async create(input) {
      const record: IntegrationRecord = {
        id: crypto.randomUUID(),
        type: input.type,
        name: input.name,
        baseUrl: input.baseUrl,
        enabled: input.enabled,
        config: input.config,
        status: "unknown",
        lastCheckedAt: null,
        configRevision: 1,
        createdBy: input.createdBy,
        createdAt: now(),
        updatedAt: now(),
      };
      rows.set(record.id, record);
      secrets.set(record.id, []);
      return record;
    },
    async update(input) {
      const current = rows.get(input.id);
      if (!current) return undefined;
      const next: IntegrationRecord = {
        ...current,
        name: input.name ?? current.name,
        baseUrl: input.baseUrl ?? current.baseUrl,
        enabled: input.enabled ?? current.enabled,
        config: input.config ?? current.config,
        status: input.resetStatus ? "unknown" : current.status,
        lastCheckedAt: input.resetStatus ? null : current.lastCheckedAt,
        configRevision: current.configRevision + (input.bumpRevision ? 1 : 0),
        updatedAt: now(),
      };
      rows.set(next.id, next);
      return next;
    },
    async delete(id) {
      secrets.delete(id);
      return rows.delete(id);
    },
    async listSecretStates(integrationId) {
      return (secrets.get(integrationId) ?? []).map((row) => ({
        key: row.key,
        configured: true as const,
      }));
    },
    async loadEncryptedSecrets(integrationId) {
      return secrets.get(integrationId) ?? [];
    },
    async upsertSecret(integrationId, secret) {
      const current = rows.get(integrationId);
      if (!current) return;
      const existing = secrets.get(integrationId) ?? [];
      secrets.set(integrationId, [...existing.filter((row) => row.key !== secret.key), secret]);
      rows.set(integrationId, {
        ...current,
        configRevision: current.configRevision + 1,
        status: "unknown",
        lastCheckedAt: null,
        updatedAt: now(),
      });
    },
    async persistConnectionResult(id, revision, status) {
      const current = rows.get(id);
      if (!current || current.configRevision !== revision) return false;
      rows.set(id, { ...current, status, lastCheckedAt: now(), updatedAt: now() });
      return true;
    },
  };
}

const servers: http.Server[] = [];
afterEach(async () =>
  Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  ),
);

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server");
  return `http://127.0.0.1:${address.port}`;
}

function serviceFor(store: IntegrationStore, limiter = new MemoryTestRateLimiter()) {
  const registry = createIntegrationRegistry()
    .register(createTestHttpIntegrationDefinition())
    .freeze();
  return createIntegrationService({
    store,
    registry,
    cache: new MemoryIntegrationCache(),
    rateLimiter: limiter,
    keyring,
    request: async (options) => {
      const { secureRequest } = await import("./http-client");
      return secureRequest({ ...options, allowAddress: () => true });
    },
  });
}

describe("integration service", () => {
  it("separates config from secrets and never returns the sentinel", async () => {
    const store = createMemoryStore();
    const service = serviceFor(store);
    const created = await service.create(
      {
        type: "test-http",
        name: "Probe",
        baseUrl: "http://192.168.1.5:3000",
        enabled: true,
        config: { path: "/health", verifyTls: true, timeoutMs: 2000 },
      },
      admin,
    );
    expect(JSON.stringify(created)).not.toContain(SENTINEL);
    const secret = await service.setSecret(
      { integrationId: created.id, key: "apiKey", value: SENTINEL },
      admin,
    );
    expect(secret).toEqual({ configured: true });
    expect(JSON.stringify(secret)).not.toContain(SENTINEL);
    const loaded = await service.get(created.id, admin);
    expect(loaded.secrets.apiKey).toEqual({ configured: true });
    expect(JSON.stringify(loaded)).not.toContain(SENTINEL);
    expect(JSON.stringify(loaded)).not.toMatch(/ciphertext|authTag|keyVersion/i);
    const listed = await service.list(admin, { limit: 10 });
    expect(JSON.stringify(listed)).not.toContain(SENTINEL);
    await expect(
      service.create({ ...created, type: "test-http", name: "x" }, reader),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.setSecret({ integrationId: created.id, key: "apiKey", value: SENTINEL }, reader),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.test(created.id, reader)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps local HTTP outcomes and ignores stale results", async () => {
    const store = createMemoryStore();
    const service = serviceFor(store);
    const origin = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, version: "1" }));
    });
    const created = await service.create(
      {
        type: "test-http",
        name: "Probe",
        baseUrl: origin,
        enabled: true,
        config: { path: "/health", timeoutMs: 1000 },
      },
      admin,
    );
    await service.setSecret({ integrationId: created.id, key: "apiKey", value: SENTINEL }, admin);
    const ok = await service.test(created.id, admin);
    expect(ok).toMatchObject({ ok: true });
    expect(JSON.stringify(ok)).not.toContain(SENTINEL);
    expect((await service.get(created.id, admin)).status).toBe("available");

    const unauthorizedOrigin = await listen((_request, response) => {
      response.writeHead(401).end("nope");
    });
    const unauthorized = await service.create(
      {
        type: "test-http",
        name: "401",
        baseUrl: unauthorizedOrigin,
        enabled: true,
        config: { path: "/", timeoutMs: 1000 },
      },
      admin,
    );
    await service.setSecret(
      { integrationId: unauthorized.id, key: "apiKey", value: SENTINEL },
      admin,
    );
    expect(await service.test(unauthorized.id, admin)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });

    const stale = await service.create(
      {
        type: "test-http",
        name: "stale",
        baseUrl: origin,
        enabled: true,
        config: { path: "/health", timeoutMs: 1000 },
      },
      admin,
    );
    await service.setSecret({ integrationId: stale.id, key: "apiKey", value: SENTINEL }, admin);
    const originalPersist = store.persistConnectionResult.bind(store);
    store.persistConnectionResult = async (id, revision, status) => {
      await store.update({ id, name: "changed", bumpRevision: true, resetStatus: true });
      return originalPersist(id, revision, status);
    };
    expect(await service.test(stale.id, admin)).toMatchObject({ ok: false, code: "STALE_RESULT" });
    expect((await service.get(stale.id, admin)).status).toBe("unknown");
  });

  it("does not expose unknown production adapters and lists unknown DB types safely", async () => {
    const store = createMemoryStore();
    const orphan = await store.create({
      type: "docker",
      name: "Legacy",
      baseUrl: "http://10.0.0.8:2375",
      enabled: true,
      config: {},
      createdBy: admin.userId,
    });
    const service = serviceFor(store);
    const dto = await service.get(orphan.id, reader);
    expect(dto.definitionAvailable).toBe(false);
    expect(dto.capabilities).toEqual([]);
    expect(await service.test(orphan.id, admin)).toMatchObject({
      ok: false,
      code: "MISCONFIGURED",
    });
    await expect(
      service.update({ id: orphan.id, config: { socket: "/var/run/docker.sock" } }, admin),
    ).rejects.toMatchObject({ code: "MISCONFIGURED" });
    expect(service.catalog(admin)).toEqual([
      expect.objectContaining({ id: "test-http", displayName: "Test HTTP" }),
    ]);
  });
});
