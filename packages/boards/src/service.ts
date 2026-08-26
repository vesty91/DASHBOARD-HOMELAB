import { hasPermission } from "@dashboard/permissions";
import { BoardError } from "./errors";
import { DEFAULT_BOARD_LAYOUTS, validateLayoutPlacements } from "./layout";
import { canAccessBoard } from "./policy";
import type {
  BoardActor,
  BoardRepository,
  BoardResourcePermission,
  BoardSnapshot,
  BoardVisibility,
  LayoutPlacementInput,
} from "./types";
export function createBoardService(repository: BoardRepository) {
  async function mutation<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        const code = String((error as Error & { code: unknown }).code);
        if (code === "BOARD_REVISION_CONFLICT")
          throw new BoardError("BOARD_REVISION_CONFLICT", "Board revision conflict");
        if (code === "BOARD_RELATION_MISMATCH")
          throw new BoardError("VALIDATION_ERROR", "Layout or item does not belong to board");
      }
      throw error;
    }
  }
  async function grants(snapshot: BoardSnapshot, actor: BoardActor) {
    return actor.userId
      ? repository.resolveResourcePermissions(snapshot.board.id, actor.userId)
      : [];
  }
  async function requireAccess(
    snapshot: BoardSnapshot | undefined,
    actor: BoardActor,
    required: BoardResourcePermission,
  ) {
    if (!snapshot) throw new BoardError("NOT_FOUND", "Board not found");
    if (
      !canAccessBoard(
        { board: snapshot.board, actor, resourcePermissions: await grants(snapshot, actor) },
        required,
      )
    )
      throw new BoardError(actor.userId ? "FORBIDDEN" : "UNAUTHORIZED", "Board access denied");
    return snapshot;
  }
  return {
    async list(actor: BoardActor) {
      const result = [];
      for (const board of await repository.listBoards())
        if (
          canAccessBoard(
            {
              board,
              actor,
              resourcePermissions: actor.userId
                ? await repository.resolveResourcePermissions(board.id, actor.userId)
                : [],
            },
            "board.view",
          )
        )
          result.push(board);
      return result;
    },
    async getBySlug(slug: string, actor: BoardActor) {
      return requireAccess(await repository.findSnapshotBySlug(slug), actor, "board.view");
    },
    async getById(id: string, actor: BoardActor) {
      return requireAccess(await repository.findSnapshotById(id), actor, "board.view");
    },
    async getForEdit(slug: string, actor: BoardActor) {
      return requireAccess(await repository.findSnapshotBySlug(slug), actor, "board.edit");
    },
    async create(
      input: {
        slug: string;
        name: string;
        description: string | null;
        visibility: BoardVisibility;
      },
      actor: BoardActor,
    ) {
      if (!actor.userId || !actor.subject) throw new BoardError("UNAUTHORIZED", "Login required");
      const ownerUserId = actor.userId;
      if (!hasPermission(actor.subject, "board.create"))
        throw new BoardError("FORBIDDEN", "Board creation denied");
      return mutation(() =>
        repository.createBoardWithLayouts({
          ...input,
          visibility: input.visibility === "public" ? "private" : input.visibility,
          ownerUserId,
          layouts: DEFAULT_BOARD_LAYOUTS,
        }),
      );
    },
    async update(
      input: {
        boardId: string;
        expectedRevision: number;
        name: string;
        description: string | null;
        visibility?: BoardVisibility;
      },
      actor: BoardActor,
    ) {
      const snapshot = await requireAccess(
        await repository.findSnapshotById(input.boardId),
        actor,
        input.visibility === undefined ? "board.edit" : "board.manage",
      );
      if (input.visibility === "public" && snapshot.items.length > 0)
        throw new BoardError(
          "VALIDATION_ERROR",
          "Boards containing items cannot be public before Widget Engine public-safe policy",
        );
      return mutation(() => repository.updateBoard(input));
    },
    async updateLayoutBatch(
      input: {
        boardId: string;
        layoutId: string;
        expectedRevision: number;
        items: readonly LayoutPlacementInput[];
      },
      actor: BoardActor,
    ) {
      await requireAccess(await repository.findSnapshotById(input.boardId), actor, "board.edit");
      return mutation(() =>
        repository.updateLayoutBatch(input, (columns, placements) =>
          validateLayoutPlacements({ columns, placements }),
        ),
      );
    },
    async delete(boardId: string, actor: BoardActor) {
      await requireAccess(await repository.findSnapshotById(boardId), actor, "board.manage");
      await repository.deleteBoard(boardId);
    },
  };
}
export type BoardService = ReturnType<typeof createBoardService>;
