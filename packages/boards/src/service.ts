import { hasPermission } from "@dashboard/permissions";
import { BoardError } from "./errors";
import {
  clampWidgetSize,
  DEFAULT_BOARD_LAYOUTS,
  findFirstFitPlacement,
  validateLayoutPlacements,
} from "./layout";
import { canAccessBoard } from "./policy";
import type {
  BoardActor,
  BoardRepository,
  BoardResourcePermission,
  BoardSnapshot,
  BoardWidgetPolicy,
  BoardVisibility,
  CreateItemInput,
  DeleteItemInput,
  ItemRecord,
  LayoutPlacementInput,
  PersistedBoardSnapshot,
  PersistedItemRecord,
  UpdateItemInput,
} from "./types";

function hydrateItem(item: PersistedItemRecord, policy: BoardWidgetPolicy): ItemRecord {
  const resolved = policy.resolve(
    item.widgetType,
    item.widgetVersion,
    item.configJson,
    item.configParseFailed,
  );
  if (resolved.status !== "ready")
    return {
      id: item.id,
      boardId: item.boardId,
      widgetType: item.widgetType,
      widgetVersion: item.widgetVersion,
      title: item.title,
      config: null,
      runtimeStatus: resolved.status,
      publicSafe: false,
    };
  return {
    id: item.id,
    boardId: item.boardId,
    widgetType: item.widgetType,
    widgetVersion: item.widgetVersion,
    title: item.title,
    config: resolved.config,
    runtimeStatus: "ready",
    publicSafe: resolved.publicSafe,
  };
}

function present(
  snapshot: PersistedBoardSnapshot,
  policy: BoardWidgetPolicy,
  projectPublic: boolean,
): BoardSnapshot {
  const items = snapshot.items.map((item) => hydrateItem(item, policy));
  if (!projectPublic) return { ...snapshot, items };
  const visible = items.filter((item) => item.runtimeStatus === "ready" && item.publicSafe);
  const ids = new Set(visible.map((item) => item.id));
  return {
    ...snapshot,
    items: visible,
    placements: snapshot.placements.filter((placement) => ids.has(placement.itemId)),
  };
}

function assertPublicPublishable(items: readonly PersistedItemRecord[], policy: BoardWidgetPolicy) {
  for (const item of items) {
    const resolved = policy.resolve(
      item.widgetType,
      item.widgetVersion,
      item.configJson,
      item.configParseFailed,
    );
    if (resolved.status !== "ready" || !resolved.publicSafe)
      throw new BoardError(
        "VALIDATION_ERROR",
        "Public boards may only contain known public-safe widgets with valid configuration",
      );
  }
}

export function createBoardService(repository: BoardRepository, policy: BoardWidgetPolicy) {
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
  async function grants(snapshot: PersistedBoardSnapshot, actor: BoardActor) {
    return actor.userId
      ? repository.resolveResourcePermissions(snapshot.board.id, actor.userId)
      : [];
  }
  async function requireAccess(
    snapshot: PersistedBoardSnapshot | undefined,
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
  async function shouldProjectPublic(snapshot: PersistedBoardSnapshot, actor: BoardActor) {
    if (snapshot.board.visibility !== "public") return false;
    return !canAccessBoard(
      { board: snapshot.board, actor, resourcePermissions: await grants(snapshot, actor) },
      "board.edit",
    );
  }
  async function presented(
    snapshot: PersistedBoardSnapshot,
    actor: BoardActor,
  ): Promise<BoardSnapshot> {
    return present(snapshot, policy, await shouldProjectPublic(snapshot, actor));
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
      return presented(
        await requireAccess(await repository.findSnapshotBySlug(slug), actor, "board.view"),
        actor,
      );
    },
    async getById(id: string, actor: BoardActor) {
      return presented(
        await requireAccess(await repository.findSnapshotById(id), actor, "board.view"),
        actor,
      );
    },
    async getForEdit(slug: string, actor: BoardActor) {
      const snapshot = await requireAccess(
        await repository.findSnapshotBySlug(slug),
        actor,
        "board.edit",
      );
      return present(snapshot, policy, false);
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
      const created = await mutation(() =>
        repository.createBoardWithLayouts({
          ...input,
          visibility: input.visibility === "public" ? "private" : input.visibility,
          ownerUserId,
          layouts: DEFAULT_BOARD_LAYOUTS,
        }),
      );
      return present(created, policy, false);
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
      const current = await repository.findSnapshotById(input.boardId);
      if (!current) throw new BoardError("NOT_FOUND", "Board not found");
      const visibilityChanged =
        input.visibility !== undefined && input.visibility !== current.board.visibility;
      const snapshot = await requireAccess(
        current,
        actor,
        visibilityChanged ? "board.manage" : "board.edit",
      );
      if (visibilityChanged && input.visibility === "public")
        assertPublicPublishable(snapshot.items, policy);
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
      const snapshot = await requireAccess(
        await repository.findSnapshotById(input.boardId),
        actor,
        "board.edit",
      );
      const constraints = new Map(
        snapshot.placements
          .filter((placement) => placement.layoutId === input.layoutId)
          .map((placement) => [
            placement.itemId,
            {
              minW: placement.minW,
              minH: placement.minH,
              maxW: placement.maxW,
              maxH: placement.maxH,
            },
          ]),
      );
      return mutation(() =>
        repository.updateLayoutBatch(input, (columns, placements) =>
          validateLayoutPlacements({ columns, placements, constraints }),
        ),
      );
    },
    async createItem(input: CreateItemInput, actor: BoardActor) {
      const snapshot = await requireAccess(
        await repository.findSnapshotById(input.boardId),
        actor,
        "board.edit",
      );
      const sizing = policy.getSizing(input.widgetType);
      const currentVersion = policy.currentVersion(input.widgetType);
      const resolved =
        currentVersion === undefined
          ? { status: "unknown" as const }
          : policy.resolve(input.widgetType, currentVersion, input.config);
      if (!sizing || resolved.status !== "ready")
        throw new BoardError("VALIDATION_ERROR", "Unknown widget or invalid configuration");
      const definitionVersion = resolved.version;
      if (snapshot.board.visibility === "public" && !resolved.publicSafe)
        throw new BoardError("VALIDATION_ERROR", "This widget cannot be added to a public board");
      const itemId = crypto.randomUUID();
      const placements = snapshot.layouts.map((layout) => {
        const size = clampWidgetSize(sizing, layout.columns);
        const existing = snapshot.placements
          .filter((placement) => placement.layoutId === layout.id)
          .map((placement) => ({
            itemId: placement.itemId,
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
          }));
        const box = findFirstFitPlacement({
          columns: layout.columns,
          size,
          existing,
          itemId,
        });
        return {
          layoutId: layout.id,
          ...box,
          minW: size.minW,
          minH: size.minH,
          maxW: size.maxW,
          maxH: size.maxH,
        };
      });
      const title = input.title === undefined ? null : input.title;
      const revision = await mutation(() =>
        repository.createItem({
          boardId: input.boardId,
          expectedRevision: input.expectedRevision,
          item: {
            id: itemId,
            widgetType: input.widgetType,
            widgetVersion: definitionVersion,
            title,
            configJson: resolved.config,
            integrationId: null,
          },
          placements,
        }),
      );
      const next = await repository.findSnapshotById(input.boardId);
      if (!next) throw new BoardError("NOT_FOUND", "Board not found");
      return { revision, snapshot: present(next, policy, false) };
    },
    async updateItem(input: UpdateItemInput, actor: BoardActor) {
      const snapshot = await requireAccess(
        await repository.findSnapshotById(input.boardId),
        actor,
        "board.edit",
      );
      const current = snapshot.items.find((item) => item.id === input.itemId);
      if (!current) throw new BoardError("NOT_FOUND", "Item not found");
      const nextConfig = input.config === undefined ? current.configJson : input.config;
      const version =
        input.config === undefined
          ? current.widgetVersion
          : (policy.currentVersion(current.widgetType) ?? current.widgetVersion);
      const resolved = policy.resolve(
        current.widgetType,
        version,
        nextConfig,
        input.config === undefined ? current.configParseFailed : false,
      );
      if (resolved.status !== "ready")
        throw new BoardError("VALIDATION_ERROR", "Unknown widget or invalid configuration");
      if (snapshot.board.visibility === "public" && !resolved.publicSafe)
        throw new BoardError("VALIDATION_ERROR", "This widget cannot remain on a public board");
      const title = input.title === undefined ? current.title : input.title;
      return mutation(() =>
        repository.updateItem({
          boardId: input.boardId,
          itemId: input.itemId,
          expectedRevision: input.expectedRevision,
          title,
          configJson: resolved.config,
          widgetVersion: resolved.version,
        }),
      );
    },
    async deleteItem(input: DeleteItemInput, actor: BoardActor) {
      const snapshot = await requireAccess(
        await repository.findSnapshotById(input.boardId),
        actor,
        "board.edit",
      );
      if (!snapshot.items.some((item) => item.id === input.itemId))
        throw new BoardError("NOT_FOUND", "Item not found");
      return mutation(() => repository.deleteItem(input));
    },
    async delete(boardId: string, actor: BoardActor) {
      await requireAccess(await repository.findSnapshotById(boardId), actor, "board.manage");
      await repository.deleteBoard(boardId);
    },
    catalog() {
      return policy.catalog();
    },
  };
}
export type BoardService = ReturnType<typeof createBoardService>;
