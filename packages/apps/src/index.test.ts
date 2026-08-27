import { describe, expect, it, vi } from "vitest";
import { appCreateSchema, createAppService, type AppStore } from "./index";

describe("app validation", () => {
  it.each(["javascript:alert(1)", "file:///etc/passwd", "http://user:pass@example.com"])(
    "rejects unsafe URL %s",
    (url) => expect(() => appCreateSchema.parse({ name: "App", url })).toThrow(),
  );
  it("normalizes safe input and rejects duplicate canonical tags", () => {
    expect(
      appCreateSchema.parse({ name: " App ", url: "https://example.com", tags: [" NAS "] }),
    ).toMatchObject({ name: "App", url: "https://example.com/", tags: ["NAS"], target: "new-tab" });
    expect(() =>
      appCreateSchema.parse({ name: "App", url: "https://example.com", tags: ["NAS", "nas"] }),
    ).toThrow();
  });
  it.each(["red", "rgb(0,0,0)", "var(--x)"])("rejects unsafe color %s", (color) =>
    expect(() =>
      appCreateSchema.parse({ name: "App", url: "https://example.com", color }),
    ).toThrow(),
  );
});
describe("app RBAC", () => {
  const store = {
    list: vi.fn(async () => []),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    persistHealthResult: vi.fn(),
  } as unknown as AppStore;
  it("allows app.read to list but forbids management", async () => {
    const service = createAppService(store);
    const actor = {
      userId: crypto.randomUUID(),
      subject: { status: "active" as const, isSystemAdmin: false, directPermissions: ["app.read"] },
    };
    await expect(service.list(actor, { limit: 50 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      service.create(appCreateSchema.parse({ name: "App", url: "https://example.com" }), actor),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("returns a stable bounded page and cursor", async () => {
    const rows = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ].map((id) => ({
      id,
      name: id,
      description: null,
      url: "https://example.com/",
      iconRef: null,
      color: null,
      target: "new-tab" as const,
      tags: [],
      healthcheckEnabled: false,
      healthcheckConfig: {
        path: "/",
        method: "GET" as const,
        timeoutMs: 5000,
        expectedStatusMin: 200,
        expectedStatusMax: 399,
      },
      healthStatus: "unknown" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastHttpStatus: null,
      lastHealthErrorCode: null,
      healthConfigRevision: 1,
      integrationId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
    const pagedStore = { ...store, list: vi.fn(async () => rows) } as unknown as AppStore;
    const actor = {
      userId: crypto.randomUUID(),
      subject: { status: "active" as const, isSystemAdmin: false, directPermissions: ["app.read"] },
    };
    await expect(
      createAppService(pagedStore).list(actor, { limit: 2, cursor: rows[0]!.id }),
    ).resolves.toEqual({ items: rows.slice(0, 2), nextCursor: rows[1]!.id });
    expect(pagedStore.list).toHaveBeenCalledWith(3, rows[0]!.id);
  });
  it("denies anonymous and disabled actors", async () => {
    const service = createAppService(store);
    await expect(
      service.list({ userId: null, subject: null }, { limit: 50 }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      service.list(
        {
          userId: crypto.randomUUID(),
          subject: { status: "disabled", isSystemAdmin: true },
        },
        { limit: 50 },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("requires app.manage for testing and returns only a safe blocked-target result", async () => {
    const app = {
      id: crypto.randomUUID(),
      name: "Local",
      description: null,
      url: "http://127.0.0.1/",
      iconRef: null,
      color: null,
      target: "new-tab" as const,
      tags: [],
      healthcheckEnabled: true,
      healthcheckConfig: {
        path: "/health",
        method: "GET" as const,
        timeoutMs: 500,
        expectedStatusMin: 200,
        expectedStatusMax: 399,
      },
      healthStatus: "unknown" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastHttpStatus: null,
      lastHealthErrorCode: null,
      healthConfigRevision: 1,
      integrationId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const healthStore = {
      ...store,
      findById: vi.fn(async () => app),
      persistHealthResult: vi.fn(async () => true),
    } as unknown as AppStore;
    const service = createAppService(healthStore);
    const reader = {
      userId: crypto.randomUUID(),
      subject: { status: "active" as const, isSystemAdmin: false, directPermissions: ["app.read"] },
    };
    const manager = {
      userId: crypto.randomUUID(),
      subject: {
        status: "active" as const,
        isSystemAdmin: false,
        directPermissions: ["app.manage"],
      },
    };
    await expect(service.test(app.id, reader)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.test(app.id, manager)).resolves.toMatchObject({
      status: "error",
      errorCode: "TARGET_BLOCKED",
      httpStatus: null,
    });
    expect(healthStore.persistHealthResult).toHaveBeenCalledWith(
      app.id,
      1,
      expect.objectContaining({ errorCode: "TARGET_BLOCKED" }),
    );
  });
  it("rejects a stale health result", async () => {
    const app = {
      id: crypto.randomUUID(),
      name: "LAN",
      description: null,
      url: "http://192.168.1.5/",
      iconRef: null,
      color: null,
      target: "new-tab" as const,
      tags: [],
      healthcheckEnabled: true,
      healthcheckConfig: {
        path: "/",
        method: "GET" as const,
        timeoutMs: 500,
        expectedStatusMin: 200,
        expectedStatusMax: 399,
      },
      healthStatus: "unknown" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastHttpStatus: null,
      lastHealthErrorCode: null,
      healthConfigRevision: 2,
      integrationId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const stale = {
      ...store,
      findById: vi.fn(async () => app),
      persistHealthResult: vi.fn(async () => false),
    } as unknown as AppStore;
    const service = createAppService(stale);
    const manager = {
      userId: crypto.randomUUID(),
      subject: { status: "active" as const, isSystemAdmin: true },
    };
    await expect(service.test(app.id, manager)).rejects.toMatchObject({
      code: "HEALTH_STALE_RESULT",
    });
  });
});
