import "server-only";
import { createBoardService } from "@dashboard/boards";
import { createBackupService } from "@dashboard/backup";
import { persistPreRestoreArchive } from "./persist-pre-restore";
import {
  createCaller,
  createDashboardServiceStatusService,
  type BoardApiContext,
} from "@dashboard/api";
import { createAppService } from "@dashboard/apps";
import { createDockerService, MemoryDockerActionRateLimiter } from "@dashboard/docker";
import {
  createBeszelService,
  MemoryBeszelOverviewCoalescer,
  MemoryBeszelRefreshFence,
  MemoryBeszelRefreshRateLimiter,
} from "@dashboard/beszel";
import {
  createPrometheusService,
  MemoryPrometheusOverviewCoalescer,
  MemoryPrometheusRefreshFence,
  MemoryPrometheusRefreshRateLimiter,
} from "@dashboard/prometheus";
import {
  createUptimeKumaService,
  MemoryUptimeKumaOverviewCoalescer,
  MemoryUptimeKumaRefreshFence,
  MemoryUptimeKumaRefreshRateLimiter,
} from "@dashboard/uptime-kuma";
import {
  createGrafanaService,
  MemoryGrafanaOverviewCoalescer,
  MemoryGrafanaRefreshFence,
  MemoryGrafanaRefreshRateLimiter,
} from "@dashboard/grafana";
import {
  createNtfyService,
  MemoryNtfyOverviewCoalescer,
  MemoryNtfyRefreshFence,
  MemoryNtfyRefreshRateLimiter,
} from "@dashboard/ntfy";
import {
  createSonarrService,
  MemorySonarrOverviewCoalescer,
  MemorySonarrRefreshFence,
  MemorySonarrRefreshRateLimiter,
} from "@dashboard/sonarr";
import {
  createProxmoxService,
  MemoryProxmoxOverviewCoalescer,
  MemoryProxmoxRefreshFence,
  MemoryProxmoxRefreshRateLimiter,
} from "@dashboard/proxmox";
import { MemoryServiceStatusCoalescer } from "@dashboard/monitoring";
import {
  MemoryEventBus,
  createConfiguredEventBus,
  createRuntimeStatusService,
  issueRealtimeTicket,
  pingRedisUrl,
  probeHttpReady,
  type EventBus,
} from "@dashboard/events";
import {
  createImmichService,
  MemoryImmichOverviewCoalescer,
  MemoryImmichRefreshFence,
  MemoryImmichRefreshRateLimiter,
} from "@dashboard/immich";
import {
  createJellyfinService,
  MemoryJellyfinOverviewCoalescer,
  MemoryJellyfinRefreshFence,
  MemoryJellyfinRefreshRateLimiter,
} from "@dashboard/jellyfin";
import {
  createSynologyService,
  MemorySynologyEnrollmentRateLimiter,
  MemorySynologyOverviewCoalescer,
  MemorySynologyRefreshFence,
  MemorySynologyRefreshRateLimiter,
} from "@dashboard/synology";
import {
  createIntegrationService,
  MemoryIntegrationCache,
  MemoryTestRateLimiter,
  secureRequest,
  type IntegrationActor,
} from "@dashboard/integrations";
import { createEnvKeyring } from "@dashboard/secrets";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
import { toPublicAuthSession } from "@dashboard/auth";
import { getServerSession } from "next-auth";
import { clearAuthOptionsCache, getAuthOptions } from "./auth";
import { getDatabase } from "./database";
import { createApplicationIntegrationRegistry } from "./integration-registry";
import { serverEnv } from "../env";
import { publishAfterSuccess } from "./publish-after-success";
import { saveOidcSettings } from "./security-services";

const globalRuntime = globalThis as typeof globalThis & {
  dashboardEventBus?: Promise<EventBus>;
  dashboardIntegrationRuntime?: {
    registry: ReturnType<typeof createApplicationIntegrationRegistry>;
    cache: MemoryIntegrationCache;
    rateLimiter: MemoryTestRateLimiter;
    dockerActionRateLimiter: MemoryDockerActionRateLimiter;
    synologyRefreshRateLimiter: MemorySynologyRefreshRateLimiter;
    synologyEnrollmentRateLimiter: MemorySynologyEnrollmentRateLimiter;
    synologyRefreshFence: MemorySynologyRefreshFence;
    synologyOverviewCoalescer: MemorySynologyOverviewCoalescer;
    jellyfinRefreshRateLimiter: MemoryJellyfinRefreshRateLimiter;
    jellyfinRefreshFence: MemoryJellyfinRefreshFence;
    jellyfinOverviewCoalescer: MemoryJellyfinOverviewCoalescer;
    immichRefreshRateLimiter: MemoryImmichRefreshRateLimiter;
    immichRefreshFence: MemoryImmichRefreshFence;
    immichOverviewCoalescer: MemoryImmichOverviewCoalescer;
    beszelRefreshRateLimiter: MemoryBeszelRefreshRateLimiter;
    beszelRefreshFence: MemoryBeszelRefreshFence;
    beszelOverviewCoalescer: MemoryBeszelOverviewCoalescer;
    prometheusRefreshRateLimiter: MemoryPrometheusRefreshRateLimiter;
    prometheusRefreshFence: MemoryPrometheusRefreshFence;
    prometheusOverviewCoalescer: MemoryPrometheusOverviewCoalescer;
    uptimeKumaRefreshRateLimiter: MemoryUptimeKumaRefreshRateLimiter;
    uptimeKumaRefreshFence: MemoryUptimeKumaRefreshFence;
    uptimeKumaOverviewCoalescer: MemoryUptimeKumaOverviewCoalescer;
    proxmoxRefreshRateLimiter: MemoryProxmoxRefreshRateLimiter;
    proxmoxRefreshFence: MemoryProxmoxRefreshFence;
    proxmoxOverviewCoalescer: MemoryProxmoxOverviewCoalescer;
    grafanaRefreshRateLimiter: MemoryGrafanaRefreshRateLimiter;
    grafanaRefreshFence: MemoryGrafanaRefreshFence;
    grafanaOverviewCoalescer: MemoryGrafanaOverviewCoalescer;
    ntfyRefreshRateLimiter: MemoryNtfyRefreshRateLimiter;
    ntfyRefreshFence: MemoryNtfyRefreshFence;
    ntfyOverviewCoalescer: MemoryNtfyOverviewCoalescer;
    sonarrRefreshRateLimiter: MemorySonarrRefreshRateLimiter;
    sonarrRefreshFence: MemorySonarrRefreshFence;
    sonarrOverviewCoalescer: MemorySonarrOverviewCoalescer;
    serviceStatusCoalescer: MemoryServiceStatusCoalescer;
  };
};

function eventBus(): Promise<EventBus> {
  globalRuntime.dashboardEventBus ??= (async () => {
    try {
      return await createConfiguredEventBus(serverEnv.REDIS_URL);
    } catch (error) {
      void error;
      delete globalRuntime.dashboardEventBus;
      return new MemoryEventBus();
    }
  })();
  return globalRuntime.dashboardEventBus;
}

function occurredAt(): string {
  return new Date().toISOString();
}

async function publish(event: Parameters<EventBus["publish"]>[0]): Promise<void> {
  const bus = await eventBus();
  await bus.publish(event);
}

function attachDataChangedEvents(
  service: {
    refreshOverview: (integrationId: string, actor: IntegrationActor) => Promise<unknown>;
  },
  integrationType: string,
): void {
  const refreshOverview = service.refreshOverview.bind(service);
  service.refreshOverview = (integrationId, actor) =>
    publishAfterSuccess(
      () => refreshOverview(integrationId, actor),
      () =>
        publish({
          type: "integration.data.changed",
          integrationId,
          integrationType,
          occurredAt: occurredAt(),
        }),
    );
}

function boardMutationEvents() {
  return {
    async publishBoardUpdated(boardId: string, revision: number) {
      await publish({
        type: "board.updated",
        boardId,
        revision,
        occurredAt: occurredAt(),
      });
    },
    async publishBoardDeleted(boardId: string) {
      await publish({
        type: "board.deleted",
        boardId,
        occurredAt: occurredAt(),
      });
    },
  };
}

function integrationMutationEvents() {
  return {
    async publishUpdated(integrationId: string, integrationType: string) {
      await publish({
        type: "integration.updated",
        integrationId,
        integrationType,
        occurredAt: occurredAt(),
      });
    },
    async publishDeleted(integrationId: string, integrationType: string) {
      await publish({
        type: "integration.deleted",
        integrationId,
        integrationType,
        occurredAt: occurredAt(),
      });
    },
    async publishStatusChanged(
      integrationId: string,
      integrationType: string,
      status: "unknown" | "available" | "unavailable",
    ) {
      await publish({
        type: "integration.status.changed",
        integrationId,
        integrationType,
        status,
        occurredAt: occurredAt(),
      });
    },
  };
}

function integrationRuntime() {
  return (globalRuntime.dashboardIntegrationRuntime ??= {
    registry: createApplicationIntegrationRegistry(),
    cache: new MemoryIntegrationCache(),
    rateLimiter: new MemoryTestRateLimiter(),
    dockerActionRateLimiter: new MemoryDockerActionRateLimiter(),
    synologyRefreshRateLimiter: new MemorySynologyRefreshRateLimiter(),
    synologyEnrollmentRateLimiter: new MemorySynologyEnrollmentRateLimiter(),
    synologyRefreshFence: new MemorySynologyRefreshFence(),
    synologyOverviewCoalescer: new MemorySynologyOverviewCoalescer(),
    jellyfinRefreshRateLimiter: new MemoryJellyfinRefreshRateLimiter(),
    jellyfinRefreshFence: new MemoryJellyfinRefreshFence(),
    jellyfinOverviewCoalescer: new MemoryJellyfinOverviewCoalescer(),
    immichRefreshRateLimiter: new MemoryImmichRefreshRateLimiter(),
    immichRefreshFence: new MemoryImmichRefreshFence(),
    immichOverviewCoalescer: new MemoryImmichOverviewCoalescer(),
    beszelRefreshRateLimiter: new MemoryBeszelRefreshRateLimiter(),
    beszelRefreshFence: new MemoryBeszelRefreshFence(),
    beszelOverviewCoalescer: new MemoryBeszelOverviewCoalescer(),
    prometheusRefreshRateLimiter: new MemoryPrometheusRefreshRateLimiter(),
    prometheusRefreshFence: new MemoryPrometheusRefreshFence(),
    prometheusOverviewCoalescer: new MemoryPrometheusOverviewCoalescer(),
    uptimeKumaRefreshRateLimiter: new MemoryUptimeKumaRefreshRateLimiter(),
    uptimeKumaRefreshFence: new MemoryUptimeKumaRefreshFence(),
    uptimeKumaOverviewCoalescer: new MemoryUptimeKumaOverviewCoalescer(),
    proxmoxRefreshRateLimiter: new MemoryProxmoxRefreshRateLimiter(),
    proxmoxRefreshFence: new MemoryProxmoxRefreshFence(),
    proxmoxOverviewCoalescer: new MemoryProxmoxOverviewCoalescer(),
    grafanaRefreshRateLimiter: new MemoryGrafanaRefreshRateLimiter(),
    grafanaRefreshFence: new MemoryGrafanaRefreshFence(),
    grafanaOverviewCoalescer: new MemoryGrafanaOverviewCoalescer(),
    ntfyRefreshRateLimiter: new MemoryNtfyRefreshRateLimiter(),
    ntfyRefreshFence: new MemoryNtfyRefreshFence(),
    ntfyOverviewCoalescer: new MemoryNtfyOverviewCoalescer(),
    sonarrRefreshRateLimiter: new MemorySonarrRefreshRateLimiter(),
    sonarrRefreshFence: new MemorySonarrRefreshFence(),
    sonarrOverviewCoalescer: new MemorySonarrOverviewCoalescer(),
    serviceStatusCoalescer: new MemoryServiceStatusCoalescer(),
  });
}

export async function createBoardApiContext(): Promise<BoardApiContext> {
  const session = await getServerSession(await getAuthOptions());
  const database = await getDatabase();
  const userId = session?.user?.id ?? null;
  const currentSessionId = session?.sessionId ?? "";
  const subject = userId
    ? ((await database.authStore.resolvePermissionSubject(userId)) ?? null)
    : null;
  const runtime = integrationRuntime();
  const keyring = createEnvKeyring(process.env.SECRET_ENCRYPTION_KEY);
  const apps = createAppService(database.appStore);
  const docker = createDockerService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    actionRateLimiter: runtime.dockerActionRateLimiter,
    request: secureRequest,
  });
  const synology = createSynologyService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.synologyRefreshRateLimiter,
    enrollmentRateLimiter: runtime.synologyEnrollmentRateLimiter,
    refreshFence: runtime.synologyRefreshFence,
    overviewCoalescer: runtime.synologyOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const jellyfin = createJellyfinService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.jellyfinRefreshRateLimiter,
    refreshFence: runtime.jellyfinRefreshFence,
    overviewCoalescer: runtime.jellyfinOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const immich = createImmichService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.immichRefreshRateLimiter,
    refreshFence: runtime.immichRefreshFence,
    overviewCoalescer: runtime.immichOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const beszel = createBeszelService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.beszelRefreshRateLimiter,
    refreshFence: runtime.beszelRefreshFence,
    overviewCoalescer: runtime.beszelOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const prometheus = createPrometheusService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.prometheusRefreshRateLimiter,
    refreshFence: runtime.prometheusRefreshFence,
    overviewCoalescer: runtime.prometheusOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const uptimeKuma = createUptimeKumaService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.uptimeKumaRefreshRateLimiter,
    refreshFence: runtime.uptimeKumaRefreshFence,
    overviewCoalescer: runtime.uptimeKumaOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const proxmox = createProxmoxService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.proxmoxRefreshRateLimiter,
    refreshFence: runtime.proxmoxRefreshFence,
    overviewCoalescer: runtime.proxmoxOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const grafana = createGrafanaService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.grafanaRefreshRateLimiter,
    refreshFence: runtime.grafanaRefreshFence,
    overviewCoalescer: runtime.grafanaOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const ntfy = createNtfyService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.ntfyRefreshRateLimiter,
    refreshFence: runtime.ntfyRefreshFence,
    overviewCoalescer: runtime.ntfyOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  const sonarr = createSonarrService({
    store: database.integrationStore,
    registry: runtime.registry,
    cache: runtime.cache,
    request: secureRequest,
    refreshRateLimiter: runtime.sonarrRefreshRateLimiter,
    refreshFence: runtime.sonarrRefreshFence,
    overviewCoalescer: runtime.sonarrOverviewCoalescer,
    ...(keyring ? { keyring } : {}),
  });
  attachDataChangedEvents(synology, "synology");
  attachDataChangedEvents(jellyfin, "jellyfin");
  attachDataChangedEvents(immich, "immich");
  attachDataChangedEvents(beszel, "beszel");
  attachDataChangedEvents(prometheus, "prometheus");
  attachDataChangedEvents(uptimeKuma, "uptime-kuma");
  attachDataChangedEvents(proxmox, "proxmox");
  attachDataChangedEvents(grafana, "grafana");
  attachDataChangedEvents(ntfy, "ntfy");
  attachDataChangedEvents(sonarr, "sonarr");
  return {
    actor: { userId, subject },
    boards: createBoardService(
      database.boardStore,
      createBuiltInWidgetPolicy(),
      boardMutationEvents(),
    ),
    apps,
    integrations: createIntegrationService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      rateLimiter: runtime.rateLimiter,
      events: integrationMutationEvents(),
      ...(keyring ? { keyring } : {}),
    }),
    docker,
    synology,
    jellyfin,
    immich,
    beszel,
    prometheus,
    uptimeKuma,
    proxmox,
    grafana,
    ntfy,
    sonarr,
    serviceStatus: createDashboardServiceStatusService({
      apps,
      docker,
      synology,
      jellyfin,
      immich,
      beszel,
      prometheus,
      uptimeKuma,
      proxmox,
      grafana,
      ntfy,
      sonarr,
      coalescer: runtime.serviceStatusCoalescer,
    }),
    runtime: createRuntimeStatusService(
      {
        ...(serverEnv.REDIS_URL ? { redisUrl: serverEnv.REDIS_URL } : {}),
        ...(serverEnv.WORKER_URL ? { workerUrl: serverEnv.WORKER_URL } : {}),
        ...(serverEnv.REALTIME_URL ? { realtimeUrl: serverEnv.REALTIME_URL } : {}),
      },
      {
        pingRedis: () =>
          serverEnv.REDIS_URL ? pingRedisUrl(serverEnv.REDIS_URL) : Promise.resolve(false),
        probeHttp: probeHttpReady,
      },
    ),
    realtimeTickets: {
      issue(input) {
        const secret = serverEnv.AUTH_SECRET;
        if (!secret) throw new Error("AUTH_SECRET_TOO_SHORT");
        return issueRealtimeTicket(secret, input);
      },
    },
    jobs: {
      async listRecent(limit: number) {
        const rows = await database.jobStore.listRecent(limit);
        return rows.map((row) => ({
          id: row.id,
          type: row.type,
          status: row.status,
          scheduledAt: row.scheduledAt.toISOString(),
          startedAt: row.startedAt ? row.startedAt.toISOString() : null,
          finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
          attempt: row.attempt,
          errorCode: row.errorCode,
          errorMessageSafe: row.errorMessageSafe,
        }));
      },
    },
    backup: createBackupService({
      store: database.backupStore,
      persistPreRestore: persistPreRestoreArchive,
      afterCommit: () => runtime.cache.clear(),
    }),
    audit: {
      record: (event) => database.securityStore.recordAudit(event),
      list: (query) => database.securityStore.listAudit(query),
    },
    sessions: {
      listSelf: async () => {
        if (!userId) return [];
        const rows = await database.securityStore.listSessions(userId);
        return rows.map((row) => toPublicAuthSession(row, currentSessionId));
      },
      revokeSelf: async (sessionId) => {
        if (!userId) return;
        await database.securityStore.revokeSession(sessionId, userId);
      },
      revokeOthers: async () => {
        if (!userId || !currentSessionId) return;
        await database.securityStore.revokeOtherSessions(userId, currentSessionId);
      },
      listForUser: async (targetUserId) => {
        const rows = await database.securityStore.listSessions(targetUserId);
        return rows.map((row) => toPublicAuthSession(row, currentSessionId));
      },
      revokeForUser: (targetUserId, sessionId) =>
        database.securityStore.revokeSession(sessionId, targetUserId),
      revokeAllForUser: (targetUserId) => database.securityStore.revokeAllSessions(targetUserId),
    },
    oidc: {
      publicConfig: async () => {
        const settings = await database.securityStore.getOidcSettings();
        return {
          enabled: settings.enabled,
          displayName: settings.displayName,
          allowLocalLogin: settings.allowLocalLogin,
        };
      },
      getSettings: async () => {
        const settings = await database.securityStore.getOidcSettings();
        const secret = await database.securityStore.getOidcSecret();
        return {
          enabled: settings.enabled,
          issuer: settings.issuer,
          clientId: settings.clientId,
          displayName: settings.displayName,
          scopes: settings.scopes,
          redirectUri: settings.redirectUri,
          groupClaim: settings.groupClaim,
          autoLinkVerifiedEmail: settings.autoLinkVerifiedEmail,
          autoProvision: settings.autoProvision,
          allowLocalLogin: settings.allowLocalLogin,
          hasClientSecret: Boolean(secret),
        };
      },
      saveSettings: async (input) => {
        await saveOidcSettings(input);
        clearAuthOptionsCache();
      },
      listMappings: () => database.securityStore.listOidcMappings(),
      replaceMappings: (mappings) => database.securityStore.replaceOidcMappings(mappings),
      listGroups: async () => {
        const groups = await database.authStore.listGroups();
        return groups.map((group) => ({ id: group.id, name: group.name }));
      },
    },
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
