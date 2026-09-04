import "server-only";
import { createBoardService } from "@dashboard/boards";
import { createCaller, type BoardApiContext } from "@dashboard/api";
import { createAppService } from "@dashboard/apps";
import { createDockerService, MemoryDockerActionRateLimiter } from "@dashboard/docker";
import {
  createSynologyService,
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
    synologyRefreshFence: MemorySynologyRefreshFence;
    synologyOverviewCoalescer: MemorySynologyOverviewCoalescer;
  };
};

function integrationRuntime() {
  return (globalRuntime.dashboardIntegrationRuntime ??= {
    registry: createApplicationIntegrationRegistry(),
    cache: new MemoryIntegrationCache(),
    rateLimiter: new MemoryTestRateLimiter(),
    dockerActionRateLimiter: new MemoryDockerActionRateLimiter(),
    synologyRefreshRateLimiter: new MemorySynologyRefreshRateLimiter(),
    synologyRefreshFence: new MemorySynologyRefreshFence(),
    synologyOverviewCoalescer: new MemorySynologyOverviewCoalescer(),
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
      refreshFence: runtime.synologyRefreshFence,
      overviewCoalescer: runtime.synologyOverviewCoalescer,
      ...(keyring ? { keyring } : {}),
    }),
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
