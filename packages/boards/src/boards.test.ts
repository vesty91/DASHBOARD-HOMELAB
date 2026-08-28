import { describe, expect, it } from "vitest";
import { BoardError } from "./errors";
import { canAccessBoard } from "./policy";
import { createBoardService } from "./service";
import {
  clampWidgetSize,
  DEFAULT_BOARD_LAYOUTS,
  findFirstFitPlacement,
  validateLayoutPlacements,
} from "./layout";
import type {
  BoardAccessContext,
  BoardRecord,
  BoardRepository,
  BoardWidgetPolicy,
  LayoutPlacementInput,
} from "./types";
const board: BoardRecord = {
  id: "b",
  slug: "home",
  name: "Home",
  description: null,
  visibility: "private",
  ownerUserId: "owner",
  revision: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const active = { status: "active" as const, isSystemAdmin: false };
const ctx = (o: Partial<BoardAccessContext> = {}): BoardAccessContext => ({
  board,
  actor: { userId: "viewer", subject: active },
  resourcePermissions: [],
  ...o,
});
const p = (itemId: string, x: number, y: number, w = 2, h = 2): LayoutPlacementInput => ({
  itemId,
  x,
  y,
  w,
  h,
});
const policy: BoardWidgetPolicy = {
  has: (type) => type === "clock" || type === "bookmarks",
  getSizing: (type) =>
    type === "clock"
      ? {
          defaultSize: { w: 4, h: 2 },
          minSize: { w: 2, h: 1 },
          maxSize: { w: 8, h: 4 },
        }
      : type === "bookmarks"
        ? {
            defaultSize: { w: 4, h: 4 },
            minSize: { w: 2, h: 2 },
            maxSize: { w: 12, h: 12 },
          }
        : undefined,
  currentVersion: (type) => (type === "clock" || type === "bookmarks" ? 1 : undefined),
  resolve: (type, _version, config) => {
    if (type === "clock") return { status: "ready", config, version: 1, publicSafe: true };
    if (type === "bookmarks") return { status: "ready", config, version: 1, publicSafe: false };
    return { status: "unknown" };
  },
  catalog: () => [],
};
const owner = { userId: "owner", subject: active };
describe("board domain", () => {
  it("defines independent defaults", () =>
    expect(DEFAULT_BOARD_LAYOUTS).toMatchObject([
      { breakpoint: "desktop", columns: 12 },
      { breakpoint: "mobile", columns: 4 },
    ]));
  it.each([
    ["horizontal", [p("a", 0, 0), p("b", 1, 0)]],
    ["vertical", [p("a", 0, 0), p("b", 0, 1)]],
    ["contained", [p("a", 0, 0, 4, 4), p("b", 1, 1)]],
    ["corner", [p("a", 0, 0), p("b", 1, 1)]],
    ["bounds", [p("a", 11, 0, 2)]],
    ["negative x", [p("a", -1, 0)]],
    ["negative y", [p("a", 0, -1)]],
    ["zero", [p("a", 0, 0, 0)]],
    ["duplicate", [p("a", 0, 0), p("a", 3, 0)]],
  ])("rejects %s", (_n, placements) =>
    expect(() => validateLayoutPlacements({ columns: 12, placements })).toThrow(BoardError),
  );
  it("accepts adjacency", () => {
    expect(() =>
      validateLayoutPlacements({ columns: 12, placements: [p("a", 0, 0), p("b", 2, 0)] }),
    ).not.toThrow();
    expect(() =>
      validateLayoutPlacements({ columns: 12, placements: [p("a", 0, 0), p("b", 0, 2)] }),
    ).not.toThrow();
  });
  it("applies resource hierarchy and visibility", () => {
    expect(canAccessBoard(ctx(), "board.view")).toBe(false);
    expect(
      canAccessBoard(ctx({ actor: { userId: "owner", subject: active } }), "board.manage"),
    ).toBe(true);
    expect(canAccessBoard(ctx({ resourcePermissions: ["board.manage"] }), "board.edit")).toBe(true);
    expect(canAccessBoard(ctx({ resourcePermissions: ["board.edit"] }), "board.view")).toBe(true);
    expect(
      canAccessBoard(ctx({ board: { ...board, visibility: "authenticated" } }), "board.view"),
    ).toBe(true);
    expect(
      canAccessBoard(
        ctx({ board: { ...board, visibility: "public" }, actor: { userId: null, subject: null } }),
        "board.view",
      ),
    ).toBe(true);
  });
  it("lists canEdit from resolved direct ACL instead of empty resource grants", async () => {
    const editor = { userId: "editor", subject: active };
    const viewer = { userId: "viewer", subject: active };
    const snapshot = { board, layouts: [], items: [], placements: [] };
    const grants: Record<string, readonly ("board.view" | "board.edit")[]> = {
      editor: ["board.edit"],
      viewer: ["board.view"],
    };
    const repository = {
      listBoards: async () => [board],
      findSnapshotBySlug: async () => snapshot,
      resolveResourcePermissions: async (_boardId: string, userId: string) => grants[userId] ?? [],
    } as unknown as BoardRepository;
    const service = createBoardService(repository, policy);
    const listed = await service.list(editor);
    expect(listed).toEqual([
      expect.objectContaining({ id: "b", slug: "home", access: { canEdit: true } }),
    ]);
    expect((await service.list(viewer))[0]?.access.canEdit).toBe(false);
    expect(await service.canAccess({ slug: "home" }, editor, "board.edit")).toBe(true);
    expect(await service.canAccess({ slug: "home" }, viewer, "board.edit")).toBe(false);
    expect(await service.getForEdit("home", editor)).toMatchObject({ board: { slug: "home" } });
    await expect(service.getForEdit("home", viewer)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("lists canEdit when board.edit is inherited from a group grant", async () => {
    const member = { userId: "member", subject: active };
    const snapshot = { board, layouts: [], items: [], placements: [] };
    const repository = {
      listBoards: async () => [board],
      findSnapshotBySlug: async () => snapshot,
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => ["board.edit"] as const,
    } as unknown as BoardRepository;
    const service = createBoardService(repository, policy);
    expect((await service.list(member))[0]?.access.canEdit).toBe(true);
    expect(await service.canAccess({ boardId: "b" }, member, "board.edit")).toBe(true);
    expect(await service.getForEdit("home", member)).toMatchObject({ board: { id: "b" } });
  });
  it("maps repository revision conflicts to the stable domain error", async () => {
    const snapshot = { board, layouts: [], items: [], placements: [] };
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => [],
      updateBoard: async () => {
        throw Object.assign(new Error("driver detail"), { code: "BOARD_REVISION_CONFLICT" });
      },
    } as unknown as BoardRepository;
    await expect(
      createBoardService(repository, policy).update(
        { boardId: "b", expectedRevision: 1, name: "Home", description: null },
        { userId: "owner", subject: active },
      ),
    ).rejects.toMatchObject({
      code: "BOARD_REVISION_CONFLICT",
      message: "Board revision conflict",
    });
  });
  it.each([
    ["name", { name: "Renamed", description: null }, "board.edit"],
    ["description", { name: "Home", description: "Changed" }, "board.edit"],
    [
      "unchanged visibility",
      { name: "Renamed", description: null, visibility: "private" as const },
      "board.edit",
    ],
    [
      "changed visibility",
      { name: "Home", description: null, visibility: "authenticated" as const },
      "board.manage",
    ],
  ])("allows %s with the required resource grant", async (_name, changes, grant) => {
    const snapshot = { board, layouts: [], items: [], placements: [] };
    let updated = false;
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => [grant],
      updateBoard: async () => {
        updated = true;
        return 2;
      },
    } as unknown as BoardRepository;
    await expect(
      createBoardService(repository, policy).update(
        { boardId: "b", expectedRevision: 1, ...changes },
        { userId: "editor", subject: active },
      ),
    ).resolves.toBe(2);
    expect(updated).toBe(true);
  });
  it("rejects a real visibility change for board.edit, including manual API-shaped input", async () => {
    const snapshot = { board, layouts: [], items: [], placements: [] };
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => ["board.edit"],
      updateBoard: async () => 2,
    } as unknown as BoardRepository;
    await expect(
      createBoardService(repository, policy).update(
        {
          boardId: "b",
          expectedRevision: 1,
          name: "Home",
          description: null,
          visibility: "authenticated",
        },
        { userId: "editor", subject: active },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not let board.edit delete a board", async () => {
    const snapshot = { board, layouts: [], items: [], placements: [] };
    let deleted = false;
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => ["board.edit"],
      deleteBoard: async () => {
        deleted = true;
      },
    } as unknown as BoardRepository;
    await expect(
      createBoardService(repository, policy).delete("b", { userId: "editor", subject: active }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deleted).toBe(false);
  });
  it("places sequential widgets without overlap and clamps to layout columns", () => {
    expect(clampWidgetSize(policy.getSizing("clock")!, 4)).toMatchObject({ w: 4, h: 2 });
    const first = findFirstFitPlacement({
      columns: 12,
      size: { w: 4, h: 2 },
      existing: [],
      itemId: "one",
    });
    const second = findFirstFitPlacement({
      columns: 12,
      size: { w: 4, h: 2 },
      existing: [{ itemId: "one", ...first }],
      itemId: "two",
    });
    expect(first).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(second).toEqual({ x: 4, y: 0, w: 4, h: 2 });
  });
  it("rejects publishing a board that contains unsafe or unknown widgets", async () => {
    const snapshot = {
      board,
      layouts: [],
      items: [
        {
          id: "i1",
          boardId: "b",
          widgetType: "bookmarks",
          widgetVersion: 1,
          title: null,
          configJson: { links: [] },
          configParseFailed: false,
          integrationId: null,
        },
      ],
      placements: [],
    };
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => [],
      updateBoard: async () => 2,
    } as unknown as BoardRepository;
    await expect(
      createBoardService(repository, policy).update(
        {
          boardId: "b",
          expectedRevision: 1,
          name: "Home",
          description: null,
          visibility: "public",
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("allows publishing a clock-only board and filters unsafe items on public read", async () => {
    const snapshot = {
      board: { ...board, visibility: "public" as const },
      layouts: [
        {
          id: "ld",
          boardId: "b",
          name: "Desktop",
          breakpoint: "desktop",
          columns: 12,
          rowHeight: 72,
          sortOrder: 0,
        },
      ],
      items: [
        {
          id: "clock-1",
          boardId: "b",
          widgetType: "clock",
          widgetVersion: 1,
          title: null,
          configJson: { timezone: "UTC" },
          configParseFailed: false,
          integrationId: null,
        },
        {
          id: "bm-1",
          boardId: "b",
          widgetType: "bookmarks",
          widgetVersion: 1,
          title: null,
          configJson: { links: [{ url: "http://192.168.1.5" }] },
          configParseFailed: false,
          integrationId: null,
        },
      ],
      placements: [
        {
          id: "p1",
          itemId: "clock-1",
          layoutId: "ld",
          x: 0,
          y: 0,
          w: 4,
          h: 2,
          minW: 2,
          minH: 1,
          maxW: 8,
          maxH: 4,
        },
        {
          id: "p2",
          itemId: "bm-1",
          layoutId: "ld",
          x: 4,
          y: 0,
          w: 4,
          h: 4,
          minW: 2,
          minH: 2,
          maxW: 12,
          maxH: 12,
        },
      ],
    };
    const repository = {
      findSnapshotBySlug: async () => snapshot,
      resolveResourcePermissions: async () => [],
    } as unknown as BoardRepository;
    const result = await createBoardService(repository, policy).getBySlug("home", {
      userId: null,
      subject: null,
    });
    expect(result.items.map((item) => item.id)).toEqual(["clock-1"]);
    expect(result.items[0]?.config).toEqual({ timezone: "UTC" });
    expect(result.placements.map((placement) => placement.itemId)).toEqual(["clock-1"]);
  });
  it("rejects item mutations without board.edit and cross-board item ids", async () => {
    const snapshot = { board, layouts: [], items: [], placements: [] };
    const repository = {
      findSnapshotById: async () => snapshot,
      resolveResourcePermissions: async () => ["board.view"],
      createItem: async () => 2,
      deleteItem: async () => 2,
    } as unknown as BoardRepository;
    const service = createBoardService(repository, policy);
    await expect(
      service.createItem(
        { boardId: "b", expectedRevision: 1, widgetType: "clock", config: { timezone: "UTC" } },
        { userId: "viewer", subject: active },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owned = {
      board,
      layouts: [],
      items: [
        {
          id: "other",
          boardId: "other-board",
          widgetType: "clock",
          widgetVersion: 1,
          title: null,
          configJson: {},
          configParseFailed: false,
          integrationId: null,
        },
      ],
      placements: [],
    };
    const idor = {
      findSnapshotById: async () => owned,
      resolveResourcePermissions: async () => [],
      deleteItem: async () => 2,
    } as unknown as BoardRepository;
    await expect(
      createBoardService(idor, policy).deleteItem(
        { boardId: "b", itemId: "missing-on-this-board", expectedRevision: 1 },
        owner,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
