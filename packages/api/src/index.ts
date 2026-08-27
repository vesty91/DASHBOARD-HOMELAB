import { initTRPC, TRPCError } from "@trpc/server";
import {
  BoardError,
  createBoardSchema,
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
export const dashboardRouter = t.router({ board: boardRouter, app: appsRouter });
export const appRouter = dashboardRouter;
export type AppRouter = typeof dashboardRouter;
export const createCaller = (context: ApiContext) => dashboardRouter.createCaller(context);
