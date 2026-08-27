import { initTRPC, TRPCError } from "@trpc/server";
import {
  BoardError,
  createBoardItemSchema,
  createBoardSchema,
  deleteBoardItemSchema,
  updateBoardItemSchema,
  updateBoardSchema,
  updateLayoutBatchSchema,
  type BoardActor,
  type BoardService,
} from "@dashboard/boards";
import { z } from "zod";
import { hasPermission } from "@dashboard/permissions";
import {
  AppError,
  appCreateSchema,
  appUpdateSchema,
  type AppActor,
  type AppService,
} from "@dashboard/apps";
import { APP_TILE_UNSET_APP_ID, appTileConfigSchema } from "@dashboard/widgets";

export interface ApiContext {
  actor: BoardActor & AppActor;
  boards: BoardService;
  apps: AppService;
}
export type BoardApiContext = ApiContext;
const t = initTRPC.context<ApiContext>().create();
const mapError = (error: unknown): never => {
  if (error instanceof BoardError || error instanceof AppError) {
    const code =
      error.code === "UNAUTHORIZED"
        ? "UNAUTHORIZED"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "BOARD_REVISION_CONFLICT" || error.code === "CONFLICT"
              ? "CONFLICT"
              : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  throw error;
};
const procedure = <T>(operation: () => Promise<T>) => operation().catch(mapError);

async function ensureAppTileTarget(
  ctx: ApiContext,
  widgetType: string | undefined,
  config: unknown,
) {
  const parsed = appTileConfigSchema.safeParse(config);
  const isAppTile = widgetType === "app-tile" || (widgetType === undefined && parsed.success);
  if (!isAppTile || !parsed.success) return;
  if (parsed.data.appId === APP_TILE_UNSET_APP_ID)
    throw new BoardError("VALIDATION_ERROR", "Application introuvable ou inaccessible");
  try {
    await ctx.apps.get(parsed.data.appId, ctx.actor);
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"))
      throw new BoardError("VALIDATION_ERROR", "Application introuvable ou inaccessible");
    mapError(error);
  }
}

export const boardRouter = t.router({
  canCreate: t.procedure.query(({ ctx }) =>
    ctx.actor.subject ? hasPermission(ctx.actor.subject, "board.create") : false,
  ),
  list: t.procedure.query(({ ctx }) => procedure(() => ctx.boards.list(ctx.actor))),
  get: t.procedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => procedure(() => ctx.boards.getBySlug(input.slug, ctx.actor))),
  getForEdit: t.procedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => procedure(() => ctx.boards.getForEdit(input.slug, ctx.actor))),
  create: t.procedure
    .input(createBoardSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.boards.create(input, ctx.actor))),
  update: t.procedure.input(updateBoardSchema).mutation(({ ctx, input }) =>
    procedure(() =>
      ctx.boards.update(
        input.visibility === undefined
          ? {
              boardId: input.boardId,
              expectedRevision: input.expectedRevision,
              name: input.name,
              description: input.description,
            }
          : { ...input, visibility: input.visibility },
        ctx.actor,
      ),
    ),
  ),
  delete: t.procedure
    .input(z.object({ boardId: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.boards.delete(input.boardId, ctx.actor))),
  layout: t.router({
    updateBatch: t.procedure
      .input(updateLayoutBatchSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.boards.updateLayoutBatch(input, ctx.actor)),
      ),
  }),
  item: t.router({
    create: t.procedure.input(createBoardItemSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        await ensureAppTileTarget(ctx, input.widgetType, input.config);
        return ctx.boards.createItem(
          {
            boardId: input.boardId,
            expectedRevision: input.expectedRevision,
            widgetType: input.widgetType,
            config: input.config,
            ...(input.title === undefined ? {} : { title: input.title }),
          },
          ctx.actor,
        );
      }),
    ),
    update: t.procedure.input(updateBoardItemSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        if (input.config !== undefined) await ensureAppTileTarget(ctx, undefined, input.config);
        return ctx.boards.updateItem(
          {
            boardId: input.boardId,
            itemId: input.itemId,
            expectedRevision: input.expectedRevision,
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.config === undefined ? {} : { config: input.config }),
          },
          ctx.actor,
        );
      }),
    ),
    delete: t.procedure
      .input(deleteBoardItemSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.boards.deleteItem(input, ctx.actor))),
  }),
});
export const widgetRouter = t.router({
  catalog: t.procedure.query(({ ctx }) => ctx.boards.catalog()),
});
export const appsRouter = t.router({
  canManage: t.procedure.query(({ ctx }) =>
    ctx.actor.subject ? hasPermission(ctx.actor.subject, "app.manage") : false,
  ),
  list: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.uuid().optional(),
        })
        .default({ limit: 50 }),
    )
    .query(({ ctx, input }) => procedure(() => ctx.apps.list(ctx.actor, input))),
  get: t.procedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) => procedure(() => ctx.apps.get(input.id, ctx.actor))),
  create: t.procedure
    .input(appCreateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.apps.create(input, ctx.actor))),
  update: t.procedure
    .input(appUpdateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.apps.update(input, ctx.actor))),
  delete: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.apps.delete(input.id, ctx.actor))),
  test: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.apps.test(input.id, ctx.actor))),
});
export const dashboardRouter = t.router({
  board: boardRouter,
  app: appsRouter,
  widget: widgetRouter,
});
export const appRouter = dashboardRouter;
export type AppRouter = typeof dashboardRouter;
export const createCaller = (context: ApiContext) => dashboardRouter.createCaller(context);
