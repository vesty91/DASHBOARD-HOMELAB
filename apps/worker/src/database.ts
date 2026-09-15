import {
  createPostgresqlAuthStore,
  createPostgresqlAutomationStore,
  createPostgresqlClient,
  createPostgresqlJobStore,
  createSqliteAuthStore,
  createSqliteAutomationStore,
  createSqliteClient,
  createSqliteJobStore,
  parseDatabaseConfig,
  toAutomationSchedulerStore,
  type AutomationStore,
} from "@dashboard/db";
import type { AutomationOwnerRecord, AutomationSchedulerStore } from "@dashboard/automations";
import { createJobRecorder } from "./jobs";
import type { JobRecorder } from "./server";

export interface WorkerPersistence {
  jobs: JobRecorder;
  automations: AutomationStore;
  schedulerStore: AutomationSchedulerStore;
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  close: () => Promise<void>;
}

export function createWorkerPersistenceFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): WorkerPersistence | undefined {
  if (!env.DATABASE_URL?.trim()) return undefined;
  const config = parseDatabaseConfig({
    DB_DRIVER: env.DB_DRIVER ?? "sqlite",
    DATABASE_URL: env.DATABASE_URL,
  });
  if (config.DB_DRIVER === "postgres") {
    const client = createPostgresqlClient(config.DATABASE_URL);
    const automations = createPostgresqlAutomationStore(client);
    const auth = createPostgresqlAuthStore(client.pool);
    return {
      jobs: createJobRecorder(createPostgresqlJobStore(client)),
      automations,
      schedulerStore: toAutomationSchedulerStore(automations),
      async loadOwner(userId) {
        const subject = await auth.resolvePermissionSubject(userId);
        if (!subject) return null;
        return { id: userId, ...subject };
      },
      close: () => client.close(),
    };
  }
  const client = createSqliteClient(config.DATABASE_URL);
  const automations = createSqliteAutomationStore(client);
  const auth = createSqliteAuthStore(client.sqlite);
  return {
    jobs: createJobRecorder(createSqliteJobStore(client)),
    automations,
    schedulerStore: toAutomationSchedulerStore(automations),
    async loadOwner(userId) {
      const subject = await auth.resolvePermissionSubject(userId);
      if (!subject) return null;
      return { id: userId, ...subject };
    },
    close: async () => {
      client.close();
    },
  };
}
