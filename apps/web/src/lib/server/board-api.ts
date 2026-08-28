import "server-only";
import { createBoardService } from "@dashboard/boards";
import { createCaller, type BoardApiContext } from "@dashboard/api";
import { createAppService } from "@dashboard/apps";
import {
  createIntegrationService,
  createProductionIntegrationRegistry,
  MemoryIntegrationCache,
  MemoryTestRateLimiter,
} from "@dashboard/integrations";
import { createEnvKeyring } from "@dashboard/secrets";
import { createBuiltInWidgetPolicy } from "@dashboard/widgets";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getDatabase } from "./database";

const globalRuntime = globalThis as typeof globalThis & {
  dashboardIntegrationRuntime?: {
    registry: ReturnType<typeof createProductionIntegrationRegistry>;
    cache: MemoryIntegrationCache;
    rateLimiter: MemoryTestRateLimiter;
  };
};

function integrationRuntime() {
  return (globalRuntime.dashboardIntegrationRuntime ??= {
    registry: createProductionIntegrationRegistry(),
    cache: new MemoryIntegrationCache(),
    rateLimiter: new MemoryTestRateLimiter(),
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
  };
}

export async function getBoardCaller() {
  return createCaller(await createBoardApiContext());
}
