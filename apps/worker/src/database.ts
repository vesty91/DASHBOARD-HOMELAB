import {
  createPostgresqlAuthStore,
  createPostgresqlAutomationStore,
  createPostgresqlClient,
  createPostgresqlJobStore,
  createPostgresqlNotificationStore,
  createSqliteAuthStore,
  createSqliteAutomationStore,
  createSqliteClient,
  createSqliteJobStore,
  createSqliteNotificationStore,
  parseDatabaseConfig,
  toAutomationSchedulerStore,
  type AutomationStore,
} from "@dashboard/db";
import {
  createPostgresqlIntegrationStore,
  createSqliteIntegrationStore,
} from "@dashboard/db/integration-runtime";
import {
  createPostgresqlSecurityStore,
  createSqliteSecurityStore,
} from "@dashboard/db/security-runtime";
import type { AutomationOwnerRecord, AutomationSchedulerStore } from "@dashboard/automations";
import { createNotificationService, type NotificationStorePort } from "@dashboard/notifications";
import type { IntegrationStore } from "@dashboard/integrations";
import type { AutomationAuditSink } from "./actions";
import { createJobRecorder } from "./jobs";
import type { JobRecorder } from "./server";

export interface WorkerPersistence {
  jobs: JobRecorder;
  automations: AutomationStore;
  schedulerStore: AutomationSchedulerStore;
  notificationStore: NotificationStorePort;
  purgeNotifications: () => Promise<number>;
  integrationStore: IntegrationStore;
  audit: AutomationAuditSink;
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  close: () => Promise<void>;
}

function withPurge(store: NotificationStorePort): {
  notificationStore: NotificationStorePort;
  purgeNotifications: () => Promise<number>;
} {
  const service = createNotificationService({ store });
  return {
    notificationStore: store,
    purgeNotifications: () => service.purgeExpired(),
  };
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
    const security = createPostgresqlSecurityStore(client.pool);
    const notifications = withPurge(createPostgresqlNotificationStore(client));
    return {
      jobs: createJobRecorder(createPostgresqlJobStore(client)),
      automations,
      schedulerStore: toAutomationSchedulerStore(automations),
      ...notifications,
      integrationStore: createPostgresqlIntegrationStore(client.pool),
      audit: {
        async record(event) {
          await security.recordAudit(event);
        },
      },
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
  const security = createSqliteSecurityStore(client.sqlite);
  const notifications = withPurge(createSqliteNotificationStore(client));
  return {
    jobs: createJobRecorder(createSqliteJobStore(client)),
    automations,
    schedulerStore: toAutomationSchedulerStore(automations),
    ...notifications,
    integrationStore: createSqliteIntegrationStore(client.sqlite),
    audit: {
      async record(event) {
        await security.recordAudit(event);
      },
    },
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
