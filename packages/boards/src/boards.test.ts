import { describe, expect, it } from "vitest";
import { BoardError } from "./errors";
import { DEFAULT_BOARD_LAYOUTS, validateLayoutPlacements } from "./layout";
import { canAccessBoard } from "./policy";
import { createBoardService } from "./service";
import type {
  BoardAccessContext,
  BoardRecord,
  BoardRepository,
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
      createBoardService(repository).update(
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
      createBoardService(repository).update(
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
      createBoardService(repository).update(
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
      createBoardService(repository).delete("b", { userId: "editor", subject: active }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deleted).toBe(false);
  });
});
