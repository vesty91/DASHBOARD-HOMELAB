import "server-only";
import { createBoardService } from "@dashboard/boards";
import { createCaller, type BoardApiContext } from "@dashboard/api";
import { createAppService } from "@dashboard/apps";
import { createDockerService, MemoryDockerActionRateLimiter } from "@dashboard/docker";
import {
  createBeszelService,
  MemoryBeszelOverviewCoalescer,
  MemoryBeszelRefreshFence,
  MemoryBeszelRefreshRateLimiter,
} from "@dashboard/beszel";
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

const globalRuntime = globalThis as typeof globalThis & {
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
  };
};

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
  const keyring = createEnvKeyring(process.env.SECRET_ENCRYPTION_KEY);
  return {
    actor: { userId, subject },
    boards: createBoardService(database.boardStore, createBuiltInWidgetPolicy()),
    apps: createAppService(database.appStore),
    integrations: createIntegrationService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      rateLimiter: runtime.rateLimiter,
      ...(keyring ? { keyring } : {}),
    }),
    docker: createDockerService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      actionRateLimiter: runtime.dockerActionRateLimiter,
      request: secureRequest,
    }),
    synology: createSynologyService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      request: secureRequest,
      refreshRateLimiter: runtime.synologyRefreshRateLimiter,
      enrollmentRateLimiter: runtime.synologyEnrollmentRateLimiter,
      refreshFence: runtime.synologyRefreshFence,
      overviewCoalescer: runtime.synologyOverviewCoalescer,
      ...(keyring ? { keyring } : {}),
    }),
    jellyfin: createJellyfinService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      request: secureRequest,
      refreshRateLimiter: runtime.jellyfinRefreshRateLimiter,
      refreshFence: runtime.jellyfinRefreshFence,
      overviewCoalescer: runtime.jellyfinOverviewCoalescer,
      ...(keyring ? { keyring } : {}),
    }),
    immich: createImmichService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      request: secureRequest,
      refreshRateLimiter: runtime.immichRefreshRateLimiter,
      refreshFence: runtime.immichRefreshFence,
      overviewCoalescer: runtime.immichOverviewCoalescer,
      ...(keyring ? { keyring } : {}),
    }),
    beszel: createBeszelService({
      store: database.integrationStore,
      registry: runtime.registry,
      cache: runtime.cache,
      request: secureRequest,
      refreshRateLimiter: runtime.beszelRefreshRateLimiter,
      refreshFence: runtime.beszelRefreshFence,
      overviewCoalescer: runtime.beszelOverviewCoalescer,
      ...(keyring ? { keyring } : {}),
    }),
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
