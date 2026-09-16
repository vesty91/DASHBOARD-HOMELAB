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
  safeActionAuditMetadata,
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
import { grafanaIntegrationInputSchema, type GrafanaService } from "@dashboard/grafana";
import {
  ntfyIntegrationInputSchema,
  ntfyPublishInputSchema,
  type NtfyService,
} from "@dashboard/ntfy";
import { prowlarrIntegrationInputSchema, type ProwlarrService } from "@dashboard/prowlarr";
import {
  qbittorrentIntegrationInputSchema,
  qbittorrentTorrentActionInputSchema,
  type QbittorrentService,
} from "@dashboard/qbittorrent";
import {
  seerrIntegrationInputSchema,
  seerrRequestActionInputSchema,
  type SeerrService,
} from "@dashboard/seerr";
import {
  customApiIntegrationInputSchema,
  customApiValueInputSchema,
  type CustomApiService,
} from "@dashboard/custom-api";
import {
  radarrIntegrationInputSchema,
  radarrRefreshMovieInputSchema,
  radarrSearchMovieInputSchema,
  type RadarrService,
} from "@dashboard/radarr";
import {
  sonarrIntegrationInputSchema,
  sonarrRefreshSeriesInputSchema,
  sonarrSearchEpisodeInputSchema,
  type SonarrService,
} from "@dashboard/sonarr";
import {
  proxmoxGuestActionInputSchema,
  proxmoxIntegrationInputSchema,
  type ProxmoxService,
} from "@dashboard/proxmox";
import { immichIntegrationInputSchema, type ImmichService } from "@dashboard/immich";
import { jellyfinIntegrationInputSchema, type JellyfinService } from "@dashboard/jellyfin";
import {
  synologyEnrollDeviceSchema,
  synologyIntegrationInputSchema,
  type SynologyService,
} from "@dashboard/synology";
import { serviceStatusQuerySchema, type ServiceStatusService } from "@dashboard/monitoring";
import type { RealtimeSubscription, RealtimeTicket, RuntimeStatusService } from "@dashboard/events";
import { APP_TILE_UNSET_APP_ID, appTileConfigSchema } from "@dashboard/widgets";
import { BackupError, type BackupService } from "@dashboard/backup";
import {
  AuthError,
  auditListInputSchema,
  createInMemoryActionRateLimiter,
  oidcSettingsInputSchema,
  type ActionRateLimiter,
  type AuditEvent,
  type AuditEventInput,
  type PublicAuthSession,
} from "@dashboard/auth";
import {
  AutomationError,
  automationEnabledUpdateSchema,
  automationRuleCreateSchema,
  automationRuleUpdateSchema,
  type AutomationService,
} from "@dashboard/automations";
import {
  NotificationError,
  incidentListQuerySchema,
  incidentTimelineQuerySchema,
  notificationListQuerySchema,
  pushSubscribeInputSchema,
  pushUnsubscribeInputSchema,
  type IncidentService,
  type NotificationService,
  type PushService,
} from "@dashboard/notifications";
import { requireServiceStatusActor } from "./service-status";
import { realtimeTicketInputSchema, resolveRealtimeSubscriptions } from "./realtime-ticket";

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
  proxmox: ProxmoxService;
  grafana: GrafanaService;
  ntfy: NtfyService;
  prowlarr: ProwlarrService;
  qbittorrent: QbittorrentService;
  seerr: SeerrService;
  customApi: CustomApiService;
  radarr: RadarrService;
  sonarr: SonarrService;
  serviceStatus: ServiceStatusService;
  runtime: RuntimeStatusService;
  realtimeTickets: {
    issue(input: {
      userId: string;
      subscriptions: readonly RealtimeSubscription[];
    }): RealtimeTicket;
  };
  jobs: {
    listRecent(limit: number): Promise<JobListItem[]>;
  };
  backup: BackupService;
  automations: AutomationService;
  notifications: NotificationService;
  push: PushService;
  incidents: IncidentService;
  audit: {
    record(event: AuditEventInput): Promise<void>;
    list(query: {
      limit: number;
      cursor?: string;
      action?: AuditEventInput["action"];
      actorUserId?: string;
      from?: Date;
      to?: Date;
    }): Promise<{ items: AuditEvent[]; nextCursor: string | null }>;
  };
  sessions: {
    listSelf(): Promise<PublicAuthSession[]>;
    revokeSelf(sessionId: string): Promise<void>;
    revokeOthers(): Promise<void>;
    listForUser(userId: string): Promise<PublicAuthSession[]>;
    revokeForUser(userId: string, sessionId: string): Promise<void>;
    revokeAllForUser(userId: string): Promise<void>;
  };
  oidc: {
    publicConfig(): Promise<{
      enabled: boolean;
      displayName: string | null;
      allowLocalLogin: boolean;
    }>;
    getSettings(): Promise<{
      enabled: boolean;
      issuer: string | null;
      clientId: string | null;
      displayName: string | null;
      scopes: string;
      redirectUri: string | null;
      groupClaim: string;
      autoLinkVerifiedEmail: boolean;
      autoProvision: boolean;
      allowLocalLogin: boolean;
      hasClientSecret: boolean;
    }>;
    saveSettings(input: z.infer<typeof oidcSettingsInputSchema>): Promise<void>;
    listMappings(): Promise<{ id: string; oidcGroup: string; localGroupId: string }[]>;
    replaceMappings(
      mappings: readonly { oidcGroup: string; localGroupId: string }[],
    ): Promise<void>;
    listGroups(): Promise<{ id: string; name: string }[]>;
  };
  actionRateLimiter?: ActionRateLimiter | undefined;
}
export type BoardApiContext = ApiContext;
const t = initTRPC.context<ApiContext>().create();
function mapBackupError(error: BackupError): never {
  switch (error.code) {
    case "UNAUTHORIZED":
      throw new TRPCError({ code: "UNAUTHORIZED", message: error.message, cause: error });
    case "FORBIDDEN":
      throw new TRPCError({ code: "FORBIDDEN", message: error.message, cause: error });
    case "RESTORE_FAILED":
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message, cause: error });
    case "VALIDATION_ERROR":
    case "INCOMPATIBLE_SCHEMA":
    case "HASH_MISMATCH":
    case "TOO_LARGE":
    case "CONFIRM_REQUIRED":
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
    default: {
      const exhaustive: never = error.code;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Backup failed",
        cause: exhaustive,
      });
    }
  }
}

const mapError = (error: unknown): never => {
  if (error instanceof BackupError) mapBackupError(error);
  if (
    error instanceof BoardError ||
    error instanceof AppError ||
    error instanceof IntegrationError ||
    error instanceof AutomationError ||
    error instanceof NotificationError
  ) {
    const code =
      error.code === "UNAUTHORIZED"
        ? "UNAUTHORIZED"
        : error.code === "FORBIDDEN" ||
            error.code === "DENIED_PERMISSION" ||
            error.code === "DENIED_OWNER_MISSING" ||
            error.code === "DENIED_OWNER_DISABLED"
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
  if (error instanceof AuthError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "AUTH_REQUIRED" || error.code === "AUTH_SESSION_INVALID"
            ? "UNAUTHORIZED"
            : "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
  throw error;
};
const procedure = <T>(operation: () => Promise<T>) => operation().catch(mapError);

const defaultSensitiveActionLimiter = createInMemoryActionRateLimiter(8, 60_000);

function consumeSensitiveAction(ctx: ApiContext, action: string): void {
  const limiter = ctx.actionRateLimiter ?? defaultSensitiveActionLimiter;
  const key = `${action}:${ctx.actor.userId ?? "anonymous"}`;
  if (!limiter.tryConsume(key))
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limited" });
}

function seerrRequestAuditMetadata(
  integrationId: string,
  result: { action: string; resourceId: string; status: "success" | "accepted" | "failed" },
): Record<string, unknown> {
  return {
    ...safeActionAuditMetadata({
      integrationId,
      integrationType: "seerr",
      action: result.action,
      resourceId: result.resourceId,
      result: result.status,
    }),
  };
}

function arrCommandAuditMetadata(
  integrationType: "sonarr" | "radarr",
  integrationId: string,
  result: { action: string; resourceId: string; status: "success" | "accepted" | "failed" },
): Record<string, unknown> {
  return {
    ...safeActionAuditMetadata({
      integrationId,
      integrationType,
      action: result.action,
      resourceId: result.resourceId,
      result: result.status,
    }),
  };
}

function ntfyPublishAuditMetadata(
  integrationId: string,
  result: { action: string; resourceId: string; status: "success" | "accepted" | "failed" },
  extras: { priority: string; messageLength: number },
): Record<string, unknown> {
  return {
    ...safeActionAuditMetadata({
      integrationId,
      integrationType: "ntfy",
      action: result.action,
      resourceId: result.resourceId,
      result: result.status,
    }),
    priority: extras.priority,
    messageLength: extras.messageLength,
  };
}

function qbittorrentTorrentAuditMetadata(
  integrationId: string,
  result: { action: string; resourceId: string; status: "success" | "accepted" | "failed" },
): Record<string, unknown> {
  return {
    ...safeActionAuditMetadata({
      integrationId,
      integrationType: "qbittorrent",
      action: result.action,
      resourceId: result.resourceId,
      result: result.status,
    }),
  };
}

function proxmoxGuestAuditMetadata(
  integrationId: string,
  result: { action: string; resourceId: string; status: "success" | "accepted" | "failed" },
): Record<string, unknown> {
  return {
    ...safeActionAuditMetadata({
      integrationId,
      integrationType: "proxmox",
      action: result.action,
      resourceId: result.resourceId,
      result: result.status,
    }),
  };
}

async function emitAudit(ctx: ApiContext, event: AuditEventInput): Promise<void> {
  try {
    await ctx.audit.record(event);
  } catch (error) {
    void error;
    console.error(JSON.stringify({ msg: "audit_write_failed" }));
  }
}

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
  create: t.procedure.input(integrationCreateSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      const created = await ctx.integrations.create(input, ctx.actor);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "integration.create",
        targetType: "integration",
        targetId: created.id,
        outcome: "success",
        metadata: { type: input.type },
      });
      return created;
    }),
  ),
  update: t.procedure
    .input(integrationUpdateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.update(input, ctx.actor))),
  setSecret: t.procedure.input(integrationSetSecretSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      const result = await ctx.integrations.setSecret(input, ctx.actor);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "integration.secret.set",
        targetType: "integration",
        targetId: input.integrationId,
        outcome: "success",
        metadata: { key: input.key },
      });
      return result;
    }),
  ),
  test: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.integrations.test(input.id, ctx.actor))),
  delete: t.procedure.input(z.object({ id: z.uuid() })).mutation(({ ctx, input }) =>
    procedure(async () => {
      const result = await ctx.integrations.delete(input.id, ctx.actor);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "integration.delete",
        targetType: "integration",
        targetId: input.id,
        outcome: "success",
      });
      return result;
    }),
  ),
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
    start: t.procedure.input(dockerContainerInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.docker.startContainer(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "docker.start",
          targetType: "container",
          targetId: input.containerId,
          outcome: "success",
          metadata: { integrationId: input.integrationId },
        });
        return result;
      }),
    ),
    stop: t.procedure.input(dockerActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.docker.stopContainer(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "docker.stop",
          targetType: "container",
          targetId: input.containerId,
          outcome: "success",
          metadata: { integrationId: input.integrationId },
        });
        return result;
      }),
    ),
    restart: t.procedure.input(dockerActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.docker.restartContainer(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "docker.restart",
          targetType: "container",
          targetId: input.containerId,
          outcome: "success",
          metadata: { integrationId: input.integrationId },
        });
        return result;
      }),
    ),
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
export const proxmoxRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.proxmox.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.proxmox.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(proxmoxIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.proxmox.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(proxmoxIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.proxmox.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(proxmoxIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.proxmox.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  guests: t.router({
    start: t.procedure.input(proxmoxGuestActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.proxmox.startGuest(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "proxmox.start",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: proxmoxGuestAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
    shutdown: t.procedure.input(proxmoxGuestActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.proxmox.shutdownGuest(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "proxmox.shutdown",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: proxmoxGuestAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
    reboot: t.procedure.input(proxmoxGuestActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.proxmox.rebootGuest(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "proxmox.reboot",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: proxmoxGuestAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
  }),
});
export const grafanaRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.grafana.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.grafana.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(grafanaIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.grafana.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(grafanaIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.grafana.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(grafanaIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.grafana.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
export const ntfyRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.ntfy.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.ntfy.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(ntfyIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.ntfy.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(ntfyIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.ntfy.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(ntfyIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.ntfy.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  publish: t.procedure.input(ntfyPublishInputSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      const result = await ctx.ntfy.publishMessage(input, ctx.actor);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "ntfy.publish",
        targetType: "integration",
        targetId: input.integrationId,
        outcome: "success",
        metadata: ntfyPublishAuditMetadata(input.integrationId, result, {
          priority: input.priority,
          messageLength: input.message.length,
        }),
      });
      return result;
    }),
  ),
});
export const prowlarrRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.prowlarr.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.prowlarr.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(prowlarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.prowlarr.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(prowlarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.prowlarr.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(prowlarrIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.prowlarr.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
});
export const qbittorrentRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.qbittorrent.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) =>
      procedure(() => ctx.qbittorrent.listIntegrations(ctx.actor)),
    ),
    get: t.procedure
      .input(qbittorrentIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.qbittorrent.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(qbittorrentIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.qbittorrent.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(qbittorrentIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.qbittorrent.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  torrents: t.router({
    pause: t.procedure.input(qbittorrentTorrentActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.qbittorrent.pauseTorrents(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "qbittorrent.pause",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: qbittorrentTorrentAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
    resume: t.procedure.input(qbittorrentTorrentActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.qbittorrent.resumeTorrents(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "qbittorrent.resume",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: qbittorrentTorrentAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
  }),
});
export const seerrRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.seerr.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.seerr.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(seerrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.seerr.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(seerrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.seerr.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(seerrIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.seerr.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  requests: t.router({
    approve: t.procedure.input(seerrRequestActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.seerr.approveRequest(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "seerr.approve",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: seerrRequestAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
    decline: t.procedure.input(seerrRequestActionInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.seerr.declineRequest(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "seerr.decline",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: seerrRequestAuditMetadata(input.integrationId, result),
        });
        return result;
      }),
    ),
  }),
});
export const customApiRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.customApi.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) =>
      procedure(() => ctx.customApi.listIntegrations(ctx.actor)),
    ),
    get: t.procedure
      .input(customApiIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.customApi.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(customApiIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.customApi.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(customApiIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.customApi.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  value: t.router({
    get: t.procedure
      .input(customApiValueInputSchema)
      .query(({ ctx, input }) => procedure(() => ctx.customApi.getValue(input, ctx.actor))),
    refresh: t.procedure
      .input(customApiValueInputSchema)
      .mutation(({ ctx, input }) => procedure(() => ctx.customApi.refreshValue(input, ctx.actor))),
  }),
});
export const radarrRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.radarr.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.radarr.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(radarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.radarr.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(radarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.radarr.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(radarrIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.radarr.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  movies: t.router({
    refresh: t.procedure.input(radarrRefreshMovieInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.radarr.refreshMovie(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "radarr.refresh-movie",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: arrCommandAuditMetadata("radarr", input.integrationId, result),
        });
        return result;
      }),
    ),
    search: t.procedure.input(radarrSearchMovieInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.radarr.searchMovie(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "radarr.search-movie",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: arrCommandAuditMetadata("radarr", input.integrationId, result),
        });
        return result;
      }),
    ),
  }),
});
export const sonarrRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.sonarr.permissions(ctx.actor)),
  integration: t.router({
    list: t.procedure.query(({ ctx }) => procedure(() => ctx.sonarr.listIntegrations(ctx.actor))),
    get: t.procedure
      .input(sonarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.sonarr.getIntegrationMetadata(input.integrationId, ctx.actor)),
      ),
  }),
  overview: t.router({
    get: t.procedure
      .input(sonarrIntegrationInputSchema)
      .query(({ ctx, input }) =>
        procedure(() => ctx.sonarr.getOverview(input.integrationId, ctx.actor)),
      ),
    refresh: t.procedure
      .input(sonarrIntegrationInputSchema)
      .mutation(({ ctx, input }) =>
        procedure(() => ctx.sonarr.refreshOverview(input.integrationId, ctx.actor)),
      ),
  }),
  series: t.router({
    refresh: t.procedure.input(sonarrRefreshSeriesInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.sonarr.refreshSeries(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "sonarr.refresh-series",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: arrCommandAuditMetadata("sonarr", input.integrationId, result),
        });
        return result;
      }),
    ),
  }),
  episodes: t.router({
    search: t.procedure.input(sonarrSearchEpisodeInputSchema).mutation(({ ctx, input }) =>
      procedure(async () => {
        const result = await ctx.sonarr.searchEpisode(input, ctx.actor);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "sonarr.search-episode",
          targetType: "integration",
          targetId: input.integrationId,
          outcome: "success",
          metadata: arrCommandAuditMetadata("sonarr", input.integrationId, result),
        });
        return result;
      }),
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
  ticket: t.procedure.input(realtimeTicketInputSchema.optional()).mutation(({ ctx, input }) =>
    procedure(async () => {
      const userId = requireAuthenticatedUser(ctx);
      try {
        const subscriptions = await resolveRealtimeSubscriptions(ctx, input ?? {});
        return ctx.realtimeTickets.issue({ userId, subscriptions });
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "AUTH_SECRET_TOO_SHORT") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "AUTH_SECRET is not configured",
          });
        }
        if (error instanceof Error && error.message === "TICKET_TOO_LARGE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Realtime ticket payload is too large",
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

export const backupValidateInputSchema = z.object({
  archive: z.unknown(),
});

export const backupRestoreInputSchema = z.object({
  archive: z.unknown(),
  confirm: z.literal(true),
});

function requireBackupManage(ctx: ApiContext): void {
  requireAuthenticatedUser(ctx);
  const subject = ctx.actor.subject;
  if (!subject || !hasPermission(subject, "backup.manage"))
    throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
}

export const backupRouter = t.router({
  export: t.procedure.mutation(({ ctx }) =>
    procedure(async () => {
      requireBackupManage(ctx);
      consumeSensitiveAction(ctx, "backup.export");
      const archive = await ctx.backup.exportArchive();
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "backup.export",
        targetType: "backup",
        outcome: "success",
      });
      return archive;
    }),
  ),
  validate: t.procedure.input(backupValidateInputSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      requireBackupManage(ctx);
      consumeSensitiveAction(ctx, "backup.validate");
      const preview = await ctx.backup.validate(input.archive);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "backup.validate",
        targetType: "backup",
        outcome: "success",
        metadata: { schemaVersion: preview.schemaVersion },
      });
      return preview;
    }),
  ),
  restore: t.procedure.input(backupRestoreInputSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      requireBackupManage(ctx);
      consumeSensitiveAction(ctx, "backup.restore");
      const restored = await ctx.backup.restore(input.archive, input.confirm);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "backup.restore",
        targetType: "backup",
        outcome: "success",
        metadata: { schemaVersion: restored.preview.schemaVersion },
      });
      return restored;
    }),
  ),
});

function requirePermission(ctx: ApiContext, permission: Parameters<typeof hasPermission>[1]) {
  requireAuthenticatedUser(ctx);
  const subject = ctx.actor.subject;
  if (!subject || !hasPermission(subject, permission))
    throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
}

export const auditRouter = t.router({
  list: t.procedure.input(auditListInputSchema.optional()).query(({ ctx, input }) =>
    procedure(async () => {
      requirePermission(ctx, "audit.read");
      return ctx.audit.list({
        limit: input?.limit ?? 50,
        ...(input?.cursor ? { cursor: input.cursor } : {}),
        ...(input?.action ? { action: input.action } : {}),
        ...(input?.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input?.from ? { from: new Date(input.from) } : {}),
        ...(input?.to ? { to: new Date(input.to) } : {}),
      });
    }),
  ),
});

export const sessionRouter = t.router({
  listSelf: t.procedure.query(({ ctx }) =>
    procedure(async () => {
      requirePermission(ctx, "session.read.self");
      return ctx.sessions.listSelf();
    }),
  ),
  revokeSelf: t.procedure.input(z.object({ sessionId: z.uuid() })).mutation(({ ctx, input }) =>
    procedure(async () => {
      requirePermission(ctx, "session.revoke.self");
      consumeSensitiveAction(ctx, "session.revoke");
      await ctx.sessions.revokeSelf(input.sessionId);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "session.revoke",
        targetType: "session",
        targetId: input.sessionId,
        outcome: "success",
      });
    }),
  ),
  revokeOthers: t.procedure.mutation(({ ctx }) =>
    procedure(async () => {
      requirePermission(ctx, "session.revoke.self");
      consumeSensitiveAction(ctx, "session.revoke");
      await ctx.sessions.revokeOthers();
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "session.revoke_others",
        targetType: "session",
        outcome: "success",
      });
    }),
  ),
  listForUser: t.procedure.input(z.object({ userId: z.uuid() })).query(({ ctx, input }) =>
    procedure(async () => {
      requirePermission(ctx, "session.manage");
      return ctx.sessions.listForUser(input.userId);
    }),
  ),
  revokeForUser: t.procedure
    .input(z.object({ userId: z.uuid(), sessionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      procedure(async () => {
        requirePermission(ctx, "session.manage");
        consumeSensitiveAction(ctx, "session.revoke");
        await ctx.sessions.revokeForUser(input.userId, input.sessionId);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "session.revoke",
          targetType: "session",
          targetId: input.sessionId,
          outcome: "success",
          metadata: { userId: input.userId },
        });
      }),
    ),
  revokeAllForUser: t.procedure.input(z.object({ userId: z.uuid() })).mutation(({ ctx, input }) =>
    procedure(async () => {
      requirePermission(ctx, "session.manage");
      consumeSensitiveAction(ctx, "session.revoke");
      await ctx.sessions.revokeAllForUser(input.userId);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "session.revoke_all",
        targetType: "user",
        targetId: input.userId,
        outcome: "success",
      });
    }),
  ),
});

export const oidcRouter = t.router({
  publicConfig: t.procedure.query(({ ctx }) => procedure(() => ctx.oidc.publicConfig())),
  getSettings: t.procedure.query(({ ctx }) =>
    procedure(async () => {
      requirePermission(ctx, "oidc.manage");
      return ctx.oidc.getSettings();
    }),
  ),
  saveSettings: t.procedure.input(oidcSettingsInputSchema).mutation(({ ctx, input }) =>
    procedure(async () => {
      requirePermission(ctx, "oidc.manage");
      consumeSensitiveAction(ctx, "oidc.save");
      await ctx.oidc.saveSettings(input);
      await emitAudit(ctx, {
        actorUserId: ctx.actor.userId,
        action: "auth.oidc.settings.update",
        targetType: "oidc",
        outcome: "success",
        metadata: { enabled: input.enabled, issuer: input.issuer },
      });
    }),
  ),
  listMappings: t.procedure.query(({ ctx }) =>
    procedure(async () => {
      requirePermission(ctx, "oidc.manage");
      return ctx.oidc.listMappings();
    }),
  ),
  replaceMappings: t.procedure
    .input(
      z.object({
        mappings: z
          .array(
            z.object({
              oidcGroup: z.string().trim().min(1).max(200),
              localGroupId: z.uuid(),
            }),
          )
          .max(200),
      }),
    )
    .mutation(({ ctx, input }) =>
      procedure(async () => {
        requirePermission(ctx, "oidc.manage");
        consumeSensitiveAction(ctx, "oidc.mappings");
        await ctx.oidc.replaceMappings(input.mappings);
        await emitAudit(ctx, {
          actorUserId: ctx.actor.userId,
          action: "auth.oidc.mapping.update",
          targetType: "oidc",
          outcome: "success",
          metadata: { count: input.mappings.length },
        });
      }),
    ),
  listGroups: t.procedure.query(({ ctx }) =>
    procedure(async () => {
      requirePermission(ctx, "oidc.manage");
      return ctx.oidc.listGroups();
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
export const automationsRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.automations.permissions(ctx.actor)),
  catalog: t.procedure.query(({ ctx }) =>
    procedure(async () => ctx.automations.catalog(ctx.actor)),
  ),
  list: t.procedure.query(({ ctx }) => procedure(() => ctx.automations.list(ctx.actor))),
  get: t.procedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) => procedure(() => ctx.automations.get(input.id, ctx.actor))),
  create: t.procedure
    .input(automationRuleCreateSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.automations.create(input, ctx.actor))),
  update: t.procedure
    .input(z.object({ id: z.uuid(), patch: automationRuleUpdateSchema }))
    .mutation(({ ctx, input }) =>
      procedure(() => ctx.automations.update(input.id, input.patch, ctx.actor)),
    ),
  setEnabled: t.procedure
    .input(z.object({ id: z.uuid() }).merge(automationEnabledUpdateSchema))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      return procedure(() => ctx.automations.setEnabled(id, patch, ctx.actor));
    }),
  delete: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.automations.delete(input.id, ctx.actor))),
  listRuns: t.procedure
    .input(
      z.object({
        id: z.uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) =>
      procedure(() => ctx.automations.listRuns(input.id, ctx.actor, input.limit)),
    ),
  dryRun: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.automations.dryRun(input.id, ctx.actor))),
  manualRun: t.procedure.input(z.object({ id: z.uuid() })).mutation(({ ctx, input }) => {
    consumeSensitiveAction(ctx, "automation.manualRun");
    return procedure(() => ctx.automations.manualRun(input.id, ctx.actor));
  }),
});
export const notificationsRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.notifications.permissions(ctx.actor)),
  list: t.procedure
    .input(notificationListQuerySchema.optional())
    .query(({ ctx, input }) => procedure(() => ctx.notifications.list(ctx.actor, input ?? {}))),
  unreadCount: t.procedure.query(({ ctx }) =>
    procedure(() => ctx.notifications.countUnread(ctx.actor)),
  ),
  markRead: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.notifications.markRead(input.id, ctx.actor))),
  markAllRead: t.procedure.mutation(({ ctx }) =>
    procedure(() => ctx.notifications.markAllRead(ctx.actor)),
  ),
  dismiss: t.procedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => procedure(() => ctx.notifications.dismiss(input.id, ctx.actor))),
});
export const pushRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.push.permissions(ctx.actor)),
  vapidPublicKey: t.procedure.query(({ ctx }) =>
    procedure(async () => ctx.push.getVapidPublicKey(ctx.actor)),
  ),
  list: t.procedure.query(({ ctx }) => procedure(() => ctx.push.list(ctx.actor))),
  subscribe: t.procedure
    .input(pushSubscribeInputSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.push.subscribe(ctx.actor, input))),
  unsubscribe: t.procedure
    .input(pushUnsubscribeInputSchema)
    .mutation(({ ctx, input }) => procedure(() => ctx.push.unsubscribe(ctx.actor, input))),
  unsubscribeAll: t.procedure.mutation(({ ctx }) =>
    procedure(() => ctx.push.unsubscribeAll(ctx.actor)),
  ),
});
export const incidentsRouter = t.router({
  permissions: t.procedure.query(({ ctx }) => ctx.incidents.permissions(ctx.actor)),
  list: t.procedure
    .input(incidentListQuerySchema.optional())
    .query(({ ctx, input }) => procedure(() => ctx.incidents.list(ctx.actor, input ?? {}))),
  get: t.procedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) => procedure(() => ctx.incidents.get(input.id, ctx.actor))),
  timeline: t.procedure
    .input(incidentTimelineQuerySchema)
    .query(({ ctx, input }) => procedure(() => ctx.incidents.timeline(ctx.actor, input))),
});
export const dashboardRouter = t.router({
  board: boardRouter,
  app: appsRouter,
  widget: widgetRouter,
  integration: integrationsRouter,
  automation: automationsRouter,
  notification: notificationsRouter,
  push: pushRouter,
  incident: incidentsRouter,
  docker: dockerRouter,
  synology: synologyRouter,
  jellyfin: jellyfinRouter,
  immich: immichRouter,
  beszel: beszelRouter,
  prometheus: prometheusRouter,
  uptimeKuma: uptimeKumaRouter,
  proxmox: proxmoxRouter,
  grafana: grafanaRouter,
  ntfy: ntfyRouter,
  prowlarr: prowlarrRouter,
  qbittorrent: qbittorrentRouter,
  seerr: seerrRouter,
  customApi: customApiRouter,
  radarr: radarrRouter,
  sonarr: sonarrRouter,
  serviceStatus: serviceStatusRouter,
  runtime: runtimeRouter,
  realtime: realtimeRouter,
  jobs: jobsRouter,
  backup: backupRouter,
  audit: auditRouter,
  session: sessionRouter,
  oidc: oidcRouter,
});
export const appRouter = dashboardRouter;
export type AppRouter = typeof dashboardRouter;
export const createCaller = (context: ApiContext) => dashboardRouter.createCaller(context);
export { createDashboardServiceStatusService } from "./service-status";
