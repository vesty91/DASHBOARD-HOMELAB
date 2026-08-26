import { describe, expect, it, vi } from "vitest";
import {
  BoardError,
  createBoardService,
  type BoardRepository,
  type BoardService,
} from "@dashboard/boards";
import { createCaller } from "./index";
const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  subject: { status: "active" as const, isSystemAdmin: false },
};
const service = (overrides: Partial<BoardService> = {}): BoardService =>
  ({
    list: vi.fn(async () => []),
    getBySlug: vi.fn(),
    getById: vi.fn(),
    getForEdit: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateLayoutBatch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }) as BoardService;
describe("board tRPC router", () => {
  it("does not expose business error details and maps forbidden", async () => {
    const boards = service({
      update: vi.fn(async () => {
        throw new BoardError("FORBIDDEN", "Board access denied");
      }),
    });
    await expect(
      createCaller({ actor, boards }).board.update({
        boardId: "00000000-0000-4000-8000-000000000002",
        expectedRevision: 1,
        name: "Home",
        description: "",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("maps revision conflicts to tRPC conflict", async () => {
    const boards = service({
      updateLayoutBatch: vi.fn(async () => {
        throw new BoardError("BOARD_REVISION_CONFLICT", "Board revision conflict");
      }),
    });
    await expect(
      createCaller({ actor, boards }).board.layout.updateBatch({
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
      createCaller({ actor, boards: createBoardService(repository) }).board.update({
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
