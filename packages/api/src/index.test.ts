import { describe, expect, it, vi } from "vitest";
import {
  BoardError,
  createBoardService,
  type BoardRepository,
  type BoardService,
} from "@dashboard/boards";
import { createCaller } from "./index";
import { AppError, type AppService } from "@dashboard/apps";
import { IntegrationError, type IntegrationService } from "@dashboard/integrations";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: false },
};
const service = (overrides: Partial<BoardService> = {}): BoardService =>
  ({
    list: vi.fn(async () => []),
    canAccess: vi.fn(),
    getBySlug: vi.fn(),
    getById: vi.fn(),
    getForEdit: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateLayoutBatch: vi.fn(),
    delete: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    catalog: vi.fn(() => []),
    ...overrides,
  }) as BoardService;
const apps = {} as AppService;
const integrations = {} as IntegrationService;
describe("board tRPC router", () => {
  it("does not expose business error details and maps forbidden", async () => {
    const boards = service({
      update: vi.fn(async () => {
        throw new BoardError("FORBIDDEN", "Board access denied");
      }),
    });
    await expect(
      createCaller({ actor, boards, apps, integrations }).board.update({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        name: "Home",
        description: "",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("exposes board.canAccess from the service", async () => {
    const boards = service({
      canAccess: vi.fn(async () => true),
    });
    await expect(
      createCaller({ actor, boards, apps, integrations }).board.canAccess({
        slug: "home",
        permission: "board.edit",
      }),
    ).resolves.toBe(true);
  });
  it("maps revision conflicts to tRPC conflict", async () => {
    const boards = service({
      updateLayoutBatch: vi.fn(async () => {
        throw new BoardError("BOARD_REVISION_CONFLICT", "Board revision conflict");
      }),
    });
    await expect(
      createCaller({ actor, boards, apps, integrations }).board.layout.updateBatch({
        boardId: "00000000-0000-4000-8000-000000000002",
        layoutId: "00000000-0000-4000-8000-000000000003",
        expectedRevision: 1,
        items: [{ itemId: "00000000-0000-4000-8000-000000000004", x: 0, y: 0, w: 1, h: 1 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("enforces visibility management through a manual tRPC mutation", async () => {
    const board = {
      id: "00000000-0000-4000-8000-000000000002",
      slug: "home",
      name: "Home",
      description: null,
      visibility: "private" as const,
      ownerUserId: "00000000-0000-4000-8000-000000000099",
      revision: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const repository = {
      findSnapshotById: async () => ({ board, layouts: [], items: [], placements: [] }),
      resolveResourcePermissions: async () => ["board.edit"],
      updateBoard: vi.fn(async () => 2),
    } as unknown as BoardRepository;
    await expect(
      createCaller({
        actor,
        boards: createBoardService(repository, createBuiltInWidgetPolicy()),
        apps,
        integrations,
      }).board.update({
        boardId: board.id,
        expectedRevision: 1,
        name: board.name,
        description: "",
        visibility: "authenticated",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.updateBoard).not.toHaveBeenCalled();
  });
});

describe("widget tRPC router", () => {
  it("returns a stable catalog from the board service", async () => {
    const catalog = [
      {
        id: "clock",
        version: 1,
        name: "Horloge",
        description: "Clock",
        category: "information",
        defaultSize: { w: 4, h: 2 },
        minSize: { w: 2, h: 1 },
        maxSize: { w: 8, h: 4 },
        publicSafe: true,
      },
      {
        id: "bookmarks",
        version: 1,
        name: "Signets",
        description: "Links",
        category: "navigation",
        defaultSize: { w: 4, h: 4 },
        minSize: { w: 2, h: 2 },
        maxSize: { w: 12, h: 12 },
        publicSafe: false,
      },
    ];
    const result = await createCaller({
      actor,
      boards: service({ catalog: () => catalog }),
      apps,
      integrations,
    }).widget.catalog();
    expect(result.map((entry: { id: string }) => entry.id)).toEqual(["clock", "bookmarks"]);
    expect(result[0]?.publicSafe).toBe(true);
    expect(result[1]?.publicSafe).toBe(false);
  });
  it("creates a clock item and rejects anonymous mutations", async () => {
    const boards = service({
      createItem: vi.fn(async () => ({ revision: 2, snapshot: {} as never })),
    });
    await expect(
      createCaller({ actor, boards, apps, integrations }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "clock",
        config: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
      }),
    ).resolves.toMatchObject({ revision: 2 });
    await expect(
      createCaller({
        actor: { userId: null, subject: null },
        boards: service({
          createItem: vi.fn(async () => {
            throw new BoardError("UNAUTHORIZED", "Login required");
          }),
        }),
        apps,
        integrations,
      }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "clock",
        config: { timezone: "UTC" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("maps viewer forbidden and stale item updates", async () => {
    await expect(
      createCaller({
        actor,
        boards: service({
          createItem: vi.fn(async () => {
            throw new BoardError("FORBIDDEN", "Board access denied");
          }),
        }),
        apps,
        integrations,
      }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "clock",
        config: {},
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createCaller({
        actor,
        boards: service({
          updateItem: vi.fn(async () => {
            throw new BoardError("BOARD_REVISION_CONFLICT", "Board revision conflict");
          }),
        }),
        apps,
        integrations,
      }).board.item.update({
        boardId: "00000000-0000-4000-8000-000000000002",
        itemId: "00000000-0000-4000-8000-000000000005",
        expectedRevision: 1,
        title: "Renamed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects unsafe bookmark URLs through the real widget policy", async () => {
    const repository = {
      findSnapshotById: async () => ({
        board: {
          id: "00000000-0000-4000-8000-000000000002",
          slug: "home",
          name: "Home",
          description: null,
          visibility: "private",
          ownerUserId: actor.userId,
          revision: 1,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
        layouts: [],
        items: [],
        placements: [],
      }),
      resolveResourcePermissions: async () => [],
      createItem: vi.fn(),
    } as unknown as BoardRepository;
    await expect(
      createCaller({
        actor,
        boards: createBoardService(repository, createBuiltInWidgetPolicy()),
        apps,
        integrations,
      }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "bookmarks",
        config: {
          links: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              title: "xss",
              url: "javascript:alert(1)",
              target: "new-tab",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it("rejects App Tile persistence when the App does not exist", async () => {
    const createItem = vi.fn();
    const get = vi.fn(async () => {
      throw new AppError("NOT_FOUND", "App not found");
    });
    await expect(
      createCaller({
        actor,
        boards: service({ createItem }),
        apps: { get } as unknown as AppService,
        integrations,
      }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "app-tile",
        config: {
          appId: "00000000-0000-4000-8000-000000000000",
          showStatus: true,
          showLatency: false,
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createItem).not.toHaveBeenCalled();
    await expect(
      createCaller({
        actor,
        boards: service({ createItem }),
        apps: { get } as unknown as AppService,
        integrations,
      }).board.item.create({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        widgetType: "app-tile",
        config: {
          appId: "22222222-2222-4222-8222-222222222222",
          showStatus: true,
          showLatency: false,
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createItem).not.toHaveBeenCalled();
  });
});

describe("app tRPC router", () => {
  const managedActor = {
    userId: actor.userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: ["app.manage", "app.read"],
    },
  };
  const readableActor = {
    userId: actor.userId,
    subject: { status: "active" as const, isSystemAdmin: false, directPermissions: ["app.read"] },
  };
  const appServices = (overrides: Partial<AppService> = {}) =>
    ({
      list: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      test: vi.fn(),
      ...overrides,
    }) as AppService;
  it("rejects anonymous list and read-only mutations through the real router", async () => {
    const appService = appServices({
      list: vi.fn(async (_actor) => {
        throw new AppError("UNAUTHORIZED", "Authentication required");
      }),
      create: vi.fn(async (_input, _actor) => {
        throw new AppError("FORBIDDEN", "Permission denied");
      }),
    });
    await expect(
      createCaller({
        actor: { userId: null, subject: null },
        boards: service(),
        apps: appService,
        integrations,
      }).app.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      createCaller({
        actor: readableActor,
        boards: service(),
        apps: appService,
        integrations,
      }).app.create({
        name: "App",
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("validates unsafe URLs before calling the service", async () => {
    const appService = appServices();
    await expect(
      createCaller({
        actor: managedActor,
        boards: service(),
        apps: appService,
        integrations,
      }).app.create({
        name: "App",
        url: "javascript:alert(1)",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(appService.create).not.toHaveBeenCalled();
  });
});

describe("integration tRPC router", () => {
  const SENTINEL = "SUPER_SECRET_VALUE_123";
  const managedActor = {
    userId: actor.userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: ["integration.manage", "integration.read", "integration.create"],
    },
  };
  const readableActor = {
    userId: actor.userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: ["integration.read"],
    },
  };
  const integrationServices = (overrides: Partial<IntegrationService> = {}) =>
    ({
      catalog: vi.fn(() => []),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setSecret: vi.fn(),
      test: vi.fn(),
      delete: vi.fn(),
      ...overrides,
    }) as IntegrationService;
  it("rejects anonymous access and read-only mutations", async () => {
    const integrationService = integrationServices({
      list: vi.fn(async () => {
        throw new IntegrationError("UNAUTHORIZED", "Authentication required");
      }),
      create: vi.fn(async () => {
        throw new IntegrationError("FORBIDDEN", "Permission denied");
      }),
      test: vi.fn(async () => {
        throw new IntegrationError("FORBIDDEN", "Permission denied");
      }),
    });
    await expect(
      createCaller({
        actor: { userId: null, subject: null },
        boards: service(),
        apps,
        integrations: integrationService,
      }).integration.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      createCaller({
        actor: readableActor,
        boards: service(),
        apps,
        integrations: integrationService,
      }).integration.create({
        type: "test-http",
        name: "Nope",
        baseUrl: "http://10.0.0.10:3000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createCaller({
        actor: readableActor,
        boards: service(),
        apps,
        integrations: integrationService,
      }).integration.test({ id: "00000000-0000-4000-8000-000000000009" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("never serializes the sentinel secret in tRPC outputs", async () => {
    const dto = {
      id: "00000000-0000-4000-8000-000000000009",
      type: "test-http",
      name: "Probe",
      baseUrl: "http://10.0.0.10:3000",
      enabled: true,
      config: { path: "/health" },
      status: "unknown" as const,
      lastCheckedAt: null,
      configRevision: 2,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      definitionAvailable: true,
      capabilities: ["test.ping"],
      secrets: { apiKey: { configured: true } },
    };
    const integrationService = integrationServices({
      get: vi.fn(async () => dto),
      list: vi.fn(async () => ({ items: [dto], nextCursor: null })),
      setSecret: vi.fn(async () => ({ configured: true as const })),
      test: vi.fn(async () => ({ ok: true as const, latencyMs: 12, metadata: { version: "1" } })),
    });
    const caller = createCaller({
      actor: managedActor,
      boards: service(),
      apps,
      integrations: integrationService,
    });
    const outputs = [
      await caller.integration.list(),
      await caller.integration.get({ id: dto.id }),
      await caller.integration.setSecret({
        integrationId: dto.id,
        key: "apiKey",
        value: SENTINEL,
      }),
      await caller.integration.test({ id: dto.id }),
    ];
    expect(JSON.stringify(outputs)).not.toContain(SENTINEL);
    expect(JSON.stringify(outputs)).not.toMatch(/ciphertext|authTag|"iv"/i);
  });
});

describe("app library tRPC router", () => {
  it("lists catalog metadata to app.read and forbids anonymous access", async () => {
    const reader = {
      userId: "00000000-0000-4000-8000-000000000009",
      subject: { status: "active" as const, isSystemAdmin: false, directPermissions: ["app.read"] },
    };
    const listed = await createCaller({
      actor: reader,
      boards: service(),
      apps,
      integrations,
    }).app.library.list();
    expect(listed.length).toBeGreaterThanOrEqual(50);
    expect(listed.find((item) => item.id === "jellyfin")).toMatchObject({
      name: "Jellyfin",
      icon: { path: "/app-icons/jellyfin.svg" },
    });
    expect(listed.find((item) => item.id === "jellyfin")?.defaults).not.toHaveProperty("url");
    await expect(
      createCaller({
        actor: { userId: null, subject: null },
        boards: service(),
        apps,
        integrations,
      }).app.library.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns a known definition and maps unknown ids to NOT_FOUND", async () => {
    const caller = createCaller({
      actor: {
        userId: "00000000-0000-4000-8000-000000000009",
        subject: {
          status: "active" as const,
          isSystemAdmin: false,
          directPermissions: ["app.read"],
        },
      },
      boards: service(),
      apps,
      integrations,
    });
    await expect(caller.app.library.get({ id: "jellyfin" })).resolves.toMatchObject({
      id: "jellyfin",
      name: "Jellyfin",
    });
    await expect(caller.app.library.get({ id: "does-not-exist" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.app.library.get({ id: "jellyseerr" })).resolves.toMatchObject({
      lifecycle: { status: "legacy", replacedBy: "seerr", replacedByName: "Seerr" },
    });
  });
});
