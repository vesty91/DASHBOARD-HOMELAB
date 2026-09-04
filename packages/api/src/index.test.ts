import { describe, expect, it, vi } from "vitest";
import {
  BoardError,
  createBoardService,
  type BoardRepository,
  type BoardService,
} from "@dashboard/boards";
import { createCaller as createAppCaller, type ApiContext } from "./index";
import { AppError, type AppService } from "@dashboard/apps";
import { IntegrationError, type IntegrationService } from "@dashboard/integrations";
import type { DockerService } from "@dashboard/docker";
import type { SynologyService } from "@dashboard/synology";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: false },
};
const synology = {} as SynologyService;
function createCaller(context: Omit<ApiContext, "synology"> & { synology?: SynologyService }) {
  return createAppCaller({ synology, ...context });
}
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
const docker = {} as DockerService;
describe("board tRPC router", () => {
  it("does not expose business error details and maps forbidden", async () => {
    const boards = service({
      update: vi.fn(async () => {
        throw new BoardError("FORBIDDEN", "Board access denied");
      }),
    });
    await expect(
      createCaller({ actor, boards, apps, integrations, docker }).board.update({
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
      createCaller({ actor, boards, apps, integrations, docker }).board.canAccess({
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
      createCaller({ actor, boards, apps, integrations, docker }).board.layout.updateBatch({
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
        docker,
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
      docker,
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
      createCaller({ actor, boards, apps, integrations, docker }).board.item.create({
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
        docker,
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
        docker,
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
        docker,
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
        docker,
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
        docker,
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
        docker,
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
        docker,
      }).app.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      createCaller({
        actor: readableActor,
        boards: service(),
        apps: appService,
        integrations,
        docker,
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
        docker,
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
        docker,
      }).integration.list(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      createCaller({
        actor: readableActor,
        boards: service(),
        apps,
        integrations: integrationService,
        docker,
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
        docker,
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
      docker,
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
      docker,
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
        docker,
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
      docker,
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

describe("docker tRPC router", () => {
  const ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const integrationId = "00000000-0000-4000-8000-000000000009";
  const dockerActor = {
    userId: actor.userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: ["integration.use", "docker.read"],
    },
  };
  const dockerServices = (overrides: Partial<DockerService> = {}) =>
    ({
      permissions: vi.fn(() => ({
        canRead: true,
        canLogs: false,
        canStart: false,
        canStop: false,
        canRestart: false,
        canManage: false,
      })),
      getIntegrationMetadata: vi.fn(),
      getSystem: vi.fn(),
      listContainers: vi.fn(async () => []),
      getContainer: vi.fn(),
      getContainerStats: vi.fn(),
      getContainerLogs: vi.fn(),
      startContainer: vi.fn(),
      stopContainer: vi.fn(),
      restartContainer: vi.fn(),
      ...overrides,
    }) as DockerService;

  it("returns safe Docker metadata for a delegated reader without config", async () => {
    const dockerService = dockerServices({
      getIntegrationMetadata: vi.fn(async () => ({
        id: integrationId,
        name: "Proxy maison",
        enabled: true,
      })),
    });
    const result = await createCaller({
      actor: dockerActor,
      boards: service(),
      apps,
      integrations,
      docker: dockerService,
    }).docker.integration.get({ integrationId });
    expect(result).toEqual({
      id: integrationId,
      name: "Proxy maison",
      enabled: true,
    });
    expect(result).not.toHaveProperty("baseUrl");
    expect(result).not.toHaveProperty("config");
    expect(result).not.toHaveProperty("trustedCaPem");
    expect(result).not.toHaveProperty("secrets");
    expect(result).not.toHaveProperty("configRevision");
    expect(dockerService.getIntegrationMetadata).toHaveBeenCalledWith(integrationId, dockerActor);
  });

  it("rejects invalid container ids before calling Docker", async () => {
    const dockerService = dockerServices();
    await expect(
      createCaller({
        actor: dockerActor,
        boards: service(),
        apps,
        integrations,
        docker: dockerService,
      }).docker.containers.get({ integrationId, containerId: "short-id" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dockerService.getContainer).not.toHaveBeenCalled();
    await expect(
      createCaller({
        actor: dockerActor,
        boards: service(),
        apps,
        integrations,
        docker: dockerService,
      }).docker.containers.logs({
        integrationId,
        containerId: ID.toUpperCase(),
        tail: 999,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dockerService.getContainerLogs).not.toHaveBeenCalled();
  });

  it("exposes permissions and maps restart forbidden", async () => {
    const dockerService = dockerServices({
      restartContainer: vi.fn(async () => {
        throw new IntegrationError("FORBIDDEN", "Permission denied");
      }),
    });
    const caller = createCaller({
      actor: dockerActor,
      boards: service(),
      apps,
      integrations,
      docker: dockerService,
    });
    await expect(caller.docker.permissions()).resolves.toMatchObject({
      canRead: true,
      canRestart: false,
    });
    await expect(caller.docker.containers.list({ integrationId })).resolves.toEqual([]);
    await expect(
      caller.docker.containers.restart({ integrationId, containerId: ID }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("exposes the remaining Docker procedures with Zod inputs", async () => {
    const dockerService = dockerServices({
      getSystem: vi.fn(async () => ({
        engineVersion: "27.0.0",
        serverApiVersion: "1.55",
        serverMinApiVersion: "1.40",
        negotiatedApiVersion: "1.55",
        os: "linux",
        arch: "amd64",
      })),
      getContainer: vi.fn(async () => ({
        id: ID,
        shortId: ID.slice(0, 12),
        name: "jellyfin",
        image: "jellyfin/jellyfin",
        state: "running" as const,
        health: "none" as const,
        startedAt: null,
        finishedAt: null,
        restartCount: 0,
        uptimeSeconds: null,
        ports: [],
        recognizedApp: null,
      })),
      getContainerStats: vi.fn(async () => ({
        cpuPercent: null,
        memoryUsageBytes: null,
        memoryLimitBytes: null,
        memoryPercent: null,
        networkRxBytes: null,
        networkTxBytes: null,
        blockReadBytes: null,
        blockWriteBytes: null,
      })),
      getContainerLogs: vi.fn(async () => ({
        text: "ok",
        tail: 200,
        truncated: false,
        tty: false,
      })),
      startContainer: vi.fn(async () => ({ changed: true })),
      stopContainer: vi.fn(async () => ({ changed: false })),
    });
    const caller = createCaller({
      actor: dockerActor,
      boards: service(),
      apps,
      integrations,
      docker: dockerService,
    });
    await expect(caller.docker.system.get({ integrationId })).resolves.toMatchObject({
      negotiatedApiVersion: "1.55",
    });
    await expect(
      caller.docker.containers.get({ integrationId, containerId: ID }),
    ).resolves.toMatchObject({
      id: ID,
    });
    await expect(
      caller.docker.containers.stats({ integrationId, containerId: ID }),
    ).resolves.toMatchObject({
      cpuPercent: null,
    });
    await expect(
      caller.docker.containers.logs({ integrationId, containerId: ID, tail: 200 }),
    ).resolves.toMatchObject({
      tail: 200,
    });
    await expect(
      caller.docker.containers.start({ integrationId, containerId: ID }),
    ).resolves.toEqual({
      changed: true,
    });
    await expect(
      caller.docker.containers.stop({ integrationId, containerId: ID, timeoutSeconds: 10 }),
    ).resolves.toEqual({ changed: false });
    expect(dockerService.getSystem).toHaveBeenCalledTimes(1);
    expect(dockerService.getContainerLogs).toHaveBeenCalledTimes(1);
  });

  it("maps Docker logs forbidden from the service", async () => {
    const dockerService = dockerServices({
      getContainerLogs: vi.fn(async () => {
        throw new IntegrationError("FORBIDDEN", "Permission denied");
      }),
    });
    await expect(
      createCaller({
        actor: dockerActor,
        boards: service(),
        apps,
        integrations,
        docker: dockerService,
      }).docker.containers.logs({ integrationId, containerId: ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("synology tRPC router", () => {
  const integrationId = "00000000-0000-4000-8000-000000000019";
  const synologyActor = {
    userId: actor.userId,
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: ["integration.use", "synology.read"],
    },
  };
  const overview = {
    status: "available" as const,
    fetchedAt: "2026-09-01T12:00:00.000Z",
    system: {
      status: "available" as const,
      data: {
        model: "DS920+",
        dsmVersion: "DSM 7.2",
        uptimeSeconds: 3600,
        systemTemperatureC: 41,
        temperatureWarning: null,
        ramTotalBytes: 8,
        cpuCores: 4,
        cpuFamily: "Intel",
        cpuSeries: "J4125",
      },
    },
    resources: {
      status: "available" as const,
      data: {
        cpuTotalPercent: 12,
        cpuUserPercent: 10,
        cpuSystemPercent: 2,
        cpuOtherPercent: 0,
        memoryTotalBytes: 2,
        memoryAvailableBytes: 1,
        memoryUsedBytes: 1,
        memoryPercentUsed: 50,
        swapTotalBytes: null,
        swapUsedPercent: null,
      },
    },
    storage: {
      status: "available" as const,
      data: {
        volumes: [
          {
            id: "volume_1",
            name: "Volume 1",
            filesystem: "btrfs",
            raidType: "raid1",
            status: "normal",
            usedBytes: 10,
            totalBytes: 100,
            freeBytes: 90,
            usedPercent: 10,
            temperatureC: null,
          },
        ],
        disks: [
          {
            id: "sata1",
            displayName: "Drive 1",
            vendor: "WD",
            model: "WD80",
            type: "HDD",
            totalBytes: 8000,
            status: "normal",
            temperatureC: 33,
            smartStatus: "normal",
            sizeBytes: 8000,
            badSectorWarning: null,
            remainingLifeWarning: null,
          },
        ],
      },
    },
  };

  it("returns safe Synology metadata and overview for a delegated reader", async () => {
    const synologyService = {
      permissions: vi.fn(() => ({ canRead: true, canManageAuth: false })),
      getIntegrationMetadata: vi.fn(async () => ({
        id: integrationId,
        name: "NAS Lab",
        enabled: true,
      })),
      getOverview: vi.fn(async () => overview),
      refreshOverview: vi.fn(async () => overview),
      enrollDevice: vi.fn(async () => ({ enrolled: true as const })),
      clearDevice: vi.fn(async () => ({ cleared: true as const })),
    } as unknown as SynologyService;
    const caller = createCaller({
      actor: synologyActor,
      boards: service(),
      apps,
      integrations,
      docker,
      synology: synologyService,
    });
    const metadata = await caller.synology.integration.get({ integrationId });
    expect(metadata).toEqual({ id: integrationId, name: "NAS Lab", enabled: true });
    expect(metadata).not.toHaveProperty("baseUrl");
    expect(metadata).not.toHaveProperty("config");
    expect(metadata).not.toHaveProperty("trustedCaPem");
    expect(metadata).not.toHaveProperty("secrets");
    const loaded = await caller.synology.overview.get({ integrationId });
    expect(loaded.system.data?.model).toBe("DS920+");
    expect(JSON.stringify(loaded)).not.toMatch(/password|sid|serial|trustedCaPem|DID-SECRET/u);
    expect(synologyService.getOverview).toHaveBeenCalledWith(integrationId, synologyActor);
    const refreshed = await caller.synology.overview.refresh({ integrationId });
    expect(refreshed.status).toBe("available");
    expect(synologyService.refreshOverview).toHaveBeenCalledWith(integrationId, synologyActor);
    await expect(
      caller.synology.auth.enrollDevice({ integrationId, otpCode: "123456" }),
    ).resolves.toEqual({ enrolled: true });
    await expect(caller.synology.auth.clearDevice({ integrationId })).resolves.toEqual({
      cleared: true,
    });
    expect(synologyService.enrollDevice).toHaveBeenCalledWith(
      integrationId,
      "123456",
      synologyActor,
    );
  });
});
