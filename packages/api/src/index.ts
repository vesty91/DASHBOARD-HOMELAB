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
import { getAppLibraryEntry, listAppLibrary } from "@dashboard/app-library";
import { hasPermission } from "@dashboard/permissions";
import {
  AppError,
  appCreateSchema,
  appUpdateSchema,
  type AppActor,
  type AppService,
} from "@dashboard/apps";
import {
  IntegrationError,
  integrationCreateSchema,
  integrationSetSecretSchema,
  integrationUpdateSchema,
  type IntegrationActor,
  type IntegrationService,
} from "@dashboard/integrations";
import {
  dockerActionInputSchema,
  dockerContainerInputSchema,
  dockerIntegrationInputSchema,
  dockerListInputSchema,
  dockerLogsInputSchema,
  type DockerService,
} from "@dashboard/docker";
import { beszelIntegrationInputSchema, type BeszelService } from "@dashboard/beszel";
import {
  prometheusInstantQueryInputSchema,
  prometheusIntegrationInputSchema,
  prometheusRangeQueryInputSchema,
  type PrometheusService,
} from "@dashboard/prometheus";
import { uptimeKumaIntegrationInputSchema, type UptimeKumaService } from "@dashboard/uptime-kuma";
import { immichIntegrationInputSchema, type ImmichService } from "@dashboard/immich";
import { jellyfinIntegrationInputSchema, type JellyfinService } from "@dashboard/jellyfin";
import {
  synologyEnrollDeviceSchema,
  synologyIntegrationInputSchema,
  type SynologyService,
} from "@dashboard/synology";
import { serviceStatusQuerySchema, type ServiceStatusService } from "@dashboard/monitoring";
import type { RealtimeTicket, RuntimeStatusService } from "@dashboard/events";
import { APP_TILE_UNSET_APP_ID, appTileConfigSchema } from "@dashboard/widgets";
import { requireServiceStatusActor } from "./service-status";

export const JOB_LIST_MAX = 50;

export const jobListInputSchema = z.object({
  limit: z.number().int().min(1).max(JOB_LIST_MAX).default(20),
});

export interface JobListItem {
  id: string;
  type: "heartbeat";
  status: "queued" | "running" | "succeeded" | "failed";
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempt: number;
  errorCode: string | null;
  errorMessageSafe: string | null;
}

export interface ApiContext {
  actor: BoardActor & AppActor & IntegrationActor;
  boards: BoardService;
  apps: AppService;
  integrations: IntegrationService;
  docker: DockerService;
  synology: SynologyService;
  jellyfin: JellyfinService;
  immich: ImmichService;
  beszel: BeszelService;
  prometheus: PrometheusService;
  uptimeKuma: UptimeKumaService;
  serviceStatus: ServiceStatusService;
  runtime: RuntimeStatusService;
  realtimeTickets: {
    issue(userId: string): RealtimeTicket;
  };
  jobs: {
    listRecent(limit: number): Promise<JobListItem[]>;
  };
}
export type BoardApiContext = ApiContext;
const t = initTRPC.context<ApiContext>().create();
const mapError = (error: unknown): never => {
  if (
    error instanceof BoardError ||
    error instanceof AppError ||
    error instanceof IntegrationError
  ) {
    const code =
      error.code === "UNAUTHORIZED"
        ? "UNAUTHORIZED"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "BOARD_REVISION_CONFLICT" || error.code === "CONFLICT"
              ? "CONFLICT"
              : error.code === "SECRETS_NOT_CONFIGURED"
                ? "PRECONDITION_FAILED"
                : error.code === "RATE_LIMITED"
                  ? "TOO_MANY_REQUESTS"
                  : error.code === "TIMEOUT"
                    ? "TIMEOUT"
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
  canAccess: t.procedure
    .input(
      z.object({
        slug: z.string().min(1),
        permission: z.enum(["board.view", "board.edit", "board.manage"]),
      }),
    )
    .query(({ ctx, input }) =>
      procedure(() => ctx.boards.canAccess({ slug: input.slug }, ctx.actor, input.permission)),
    ),
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
function requireAppRead(ctx: ApiContext) {
  if (!ctx.actor.userId || !ctx.actor.subject || ctx.actor.subject.status !== "active")
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  if (!hasPermission(ctx.actor.subject, "app.read"))
    throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
}

export const appsRouter = t.router({
  canManage: t.procedure.query(({ ctx }) =>
    ctx.actor.subject ? hasPermission(ctx.actor.subject, "app.manage") : false,
  ),
  library: t.router({
    list: t.procedure.query(({ ctx }) => {
      requireAppRead(ctx);
      return listAppLibrary();
    }),
    get: t.procedure.input(z.object({ id: z.string().min(1).max(64) })).query(({ ctx, input }) => {
      requireAppRead(ctx);
      const entry = getAppLibraryEntry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "App definition not found" });
      return entry;
    }),
  }),
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
export const widgetRouter = t.router({
  catalog: t.procedure.query(({ ctx }) => ctx.boards.catalog()),
});
export const integrationsRouter = t.router({
  canManage: t.procedure.query(({ ctx }) =>
    ctx.actor.subject ? hasPermission(ctx.actor.subject, "integration.manage") : false,
  ),
  canCreate: t.procedure.query(({ ctx }) =>
    ctx.actor.subject ? hasPermission(ctx.actor.subject, "integration.create") : false,
  ),
  catalog: t.procedure.query(({ ctx }) =>
    procedure(async () => ctx.integrations.catalog(ctx.actor)),
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
    .query(({ ctx, input }) => procedure(() => ctx.integrations.list(ctx.actor, input))),
  get: t.procedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) => procedure(() => ctx.integrations.get(input.id, ctx.actor))),
  create: t.procedure
    .input(integrationCreateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.create(input, ctx.actor))),
  update: t.procedure
    .input(integrationUpdateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.update(input, ctx.actor))),
  setSecret: t.procedure
    .input(integrationSetSecretSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.setSecret(input, ctx.actor))),
  test: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.test(input.id, ctx.actor))),
  delete: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.delete(input.id, ctx.actor))),
});
export const dockerRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.docker.permissions(ctx.actor)),
  integration: t.router({
    get: t.procedure
      .input(dockerIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.docker.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.docker.listIntegrations(ctx.actor))),
  }),
  system: t.router({
    get: t.procedure
      .input(z.object({ integrationId: z.uuid() }))
      .query(({ ctx, input }) =>
        procedure(() => ctx.docker.getSystem(input.integrationId, ctx.actor)),
      ),
  }),
  containers: t.router({
    list: t.procedure
      .input(dockerListInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.docker.listContainers(input, ctx.actor))),
    get: t.procedure
      .input(dockerContainerInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.docker.getContainer(input, ctx.actor))),
    stats: t.procedure
      .input(dockerContainerInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.docker.getContainerStats(input, ctx.actor))),
    logs: t.procedure
      .input(dockerLogsInputSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.docker.getContainerLogs(input, ctx.actor))),
    start: t.procedure
      .input(dockerContainerInputSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.docker.startContainer(input, ctx.actor))),
    stop: t.procedure
      .input(dockerActionInputSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.docker.stopContainer(input, ctx.actor))),
    restart: t.procedure
      .input(dockerActionInputSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.docker.restartContainer(input, ctx.actor))),
  }),
});
export const synologyRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.synology.permissions(ctx.actor)),
  integration: t.router({
    get: t.procedure
      .input(synologyIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.synology.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.synology.listIntegrations(ctx.actor))),
  }),
  overview: t.router({
    get: t.procedure
      .input(synologyIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.synology.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(synologyIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.synology.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  auth: t.router({
    enrollDevice: t.procedure
      .input(synologyEnrollDeviceSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.synology.enrollDevice(input.integrationId, input.otpCode, ctx.actor)),
      ),
    clearDevice: t.procedure
      .input(synologyIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.synology.clearDevice(input.integrationId, ctx.actor)),
      ),
  }),
});
export const jellyfinRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.jellyfin.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.jellyfin.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(jellyfinIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.jellyfin.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(jellyfinIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.jellyfin.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(jellyfinIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.jellyfin.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
export const immichRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.immich.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.immich.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(immichIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.immich.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(immichIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.immich.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(immichIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.immich.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
export const beszelRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.beszel.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.beszel.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(beszelIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.beszel.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(beszelIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.beszel.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(beszelIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.beszel.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
export const prometheusRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.prometheus.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) =>
      procedure(() => ctx.prometheus.listIntegrations(ctx.actor)),
    ),
    get: t.procedure
      .input(prometheusIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.prometheus.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(prometheusIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.prometheus.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(prometheusIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.prometheus.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  query: t.router({
    instant: t.procedure
      .input(prometheusInstantQueryInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.prometheus.queryInstant(input, ctx.actor))),
    range: t.procedure
      .input(prometheusRangeQueryInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.prometheus.queryRange(input, ctx.actor))),
  }),
});
export const uptimeKumaRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.uptimeKuma.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) =>
      procedure(() => ctx.uptimeKuma.listIntegrations(ctx.actor)),
    ),
    get: t.procedure
      .input(uptimeKumaIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.uptimeKuma.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(uptimeKumaIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.uptimeKuma.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(uptimeKumaIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.uptimeKuma.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
function requireAuthenticatedUser(ctx: ApiContext): string {
  if (!ctx.actor.userId || !ctx.actor.subject || ctx.actor.subject.status !== "active")
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  return ctx.actor.userId;
}

function requireSettingsRead(ctx: ApiContext): void {
  requireAuthenticatedUser(ctx);
  const subject = ctx.actor.subject;
  if (!subject || !hasPermission(subject, "settings.read"))
    throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
}

export const runtimeRouter = t.router({
  status: t.procedure.query(({ ctx }) =>
    procedure(async () => {
      requireSettingsRead(ctx);
      return ctx.runtime.getStatus();
    }),
  ),
});

export const realtimeRouter = t.router({
  ticket: t.procedure.mutation(({ ctx }) =>
    procedure(async () => {
      const userId = requireAuthenticatedUser(ctx);
      try {
        return ctx.realtimeTickets.issue(userId);
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "AUTH_SECRET_TOO_SHORT") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "AUTH_SECRET is not configured",
          });
        }
        throw error;
      }
    }),
  ),
});

export const jobsRouter = t.router({
  list: t.procedure.input(jobListInputSchema.optional()).query(({ ctx, input }) =>
    procedure(async () => {
      requireSettingsRead(ctx);
      const items = await ctx.jobs.listRecent(input?.limit ?? 20);
      return { items };
    }),
  ),
});

export const serviceStatusRouter = t.router({
  list: t.procedure.input(serviceStatusQuerySchema.optional()).query(({ ctx, input }) =>
    procedure(async () => {
      requireServiceStatusActor(ctx.actor);
      return ctx.serviceStatus.list(input ?? {}, ctx.actor);
    }),
  ),
  catalog: t.procedure.input(serviceStatusQuerySchema.optional()).query(({ ctx, input }) =>
    procedure(async () => {
      requireServiceStatusActor(ctx.actor);
      return ctx.serviceStatus.catalog(input ?? {}, ctx.actor);
    }),
  ),
});
export const dashboardRouter = t.router({
  board: boardRouter,
  app: appsRouter,
  widget: widgetRouter,
  integration: integrationsRouter,
  docker: dockerRouter,
  synology: synologyRouter,
  jellyfin: jellyfinRouter,
  immich: immichRouter,
  beszel: beszelRouter,
  prometheus: prometheusRouter,
  uptimeKuma: uptimeKumaRouter,
  serviceStatus: serviceStatusRouter,
  runtime: runtimeRouter,
  realtime: realtimeRouter,
  jobs: jobsRouter,
});
export const appRouter = dashboardRouter;
export type AppRouter = typeof dashboardRouter;
export const createCaller = (context: ApiContext) => dashboardRouter.createCaller(context);
export { createDashboardServiceStatusService } from "./service-status";
