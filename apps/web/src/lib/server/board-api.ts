import "server-only";
import { createBoardService } from "@dashboard/boards";
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
import { MemoryServiceStatusCoalescer } from "@dashboard/monitoring";
import {
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
} from "@dashboard/integrations";
import { createEnvKeyring } from "@dashboard/secrets";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getDatabase } from "./database";
import { createApplicationIntegrationRegistry } from "./integration-registry";
import { serverEnv } from "../env";

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
    serviceStatusCoalescer: MemoryServiceStatusCoalescer;
  };
};

function eventBus(): Promise<EventBus> {
  globalRuntime.dashboardEventBus ??= createConfiguredEventBus(serverEnv.REDIS_URL);
  return globalRuntime.dashboardEventBus;
}

function occurredAt(): string {
  return new Date().toISOString();
}

function boardMutationEvents(bus: EventBus) {
  return {
    async publishBoardUpdated(boardId: string, revision: number) {
      await bus.publish({
        type: "board.updated",
        boardId,
        revision,
        occurredAt: occurredAt(),
      });
    },
    async publishBoardDeleted(boardId: string) {
      await bus.publish({
        type: "board.deleted",
        boardId,
        occurredAt: occurredAt(),
      });
    },
  };
}

function integrationMutationEvents(bus: EventBus) {
  return {
    async publishUpdated(integrationId: string, integrationType: string) {
      await bus.publish({
        type: "integration.updated",
        integrationId,
        integrationType,
        occurredAt: occurredAt(),
      });
    },
    async publishDeleted(integrationId: string, integrationType: string) {
      await bus.publish({
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
      await bus.publish({
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
    serviceStatusCoalescer: new MemoryServiceStatusCoalescer(),
  });
}

export async function createBoardApiContext(): Promise<BoardApiContext> {
  const session = await getServerSession(authOptions);
  const database = await getDatabase();
  const userId = session?.user?.id ?? null;
  const subject = userId
    ? ((await database.authStore.resolvePermissionSubject(userId)) ?? null)
    : null;
  const runtime = integrationRuntime();
  const bus = await eventBus();
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
  return {
    actor: { userId, subject },
    boards: createBoardService(
      database.boardStore,
      createBuiltInWidgetPolicy(),
      boardMutationEvents(bus),
    ),
    apps,
    integrations: createIntegrationService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      rateLimiter: runtime.rateLimiter,
      events: integrationMutationEvents(bus),
      ...(keyring ? { keyring } : {}),
    }),
    docker,
    synology,
    jellyfin,
    immich,
    beszel,
    prometheus,
    uptimeKuma,
    serviceStatus: createDashboardServiceStatusService({
      apps,
      docker,
      synology,
      jellyfin,
      immich,
      beszel,
      prometheus,
      uptimeKuma,
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
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
