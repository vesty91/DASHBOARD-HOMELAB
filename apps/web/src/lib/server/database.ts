import "server-only";
import {
  createPostgresqlAuthStore,
  createPostgresqlClient,
  createSqliteAuthStore,
  createSqliteClient,
} from "@dashboard/db/auth-runtime";
import { createPostgresqlJobStore, createSqliteJobStore } from "@dashboard/db/job-runtime";
import { createPostgresqlBackupStore, createSqliteBackupStore } from "@dashboard/db/backup-runtime";
import {
  createPostgresqlSecurityStore,
  createSqliteSecurityStore,
} from "@dashboard/db/security-runtime";
import { createPostgresqlBoardStore, createSqliteBoardStore } from "@dashboard/db/board-runtime";
import { createPostgresqlAppStore, createSqliteAppStore } from "@dashboard/db/app-runtime";
import {
  createPostgresqlIntegrationStore,
  createSqliteIntegrationStore,
} from "@dashboard/db/integration-runtime";
import {
  createPostgresqlAutomationStore,
  createSqliteAutomationStore,
} from "@dashboard/db/automation-runtime";
import {
  createPostgresqlNotificationStore,
  createSqliteNotificationStore,
} from "@dashboard/db/notification-runtime";
import {
  createPostgresqlIncidentStore,
  createSqliteIncidentStore,
} from "@dashboard/db/incident-runtime";
import {
  createPostgresqlPushSubscriptionStore,
  createSqlitePushSubscriptionStore,
} from "@dashboard/db/push-subscription-runtime";

const globalDatabase = globalThis as typeof globalThis & {
  dashboardDatabase?: ReturnType<typeof createDatabase>;
};
async function createDatabase() {
  if (process.env.DB_DRIVER === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL");
    const client = createPostgresqlClient(process.env.DATABASE_URL);
    return {
      dialect: "postgres" as const,
      client,
      authStore: createPostgresqlAuthStore(client.pool),
      boardStore: createPostgresqlBoardStore(client.pool),
      appStore: createPostgresqlAppStore(client.pool),
      integrationStore: createPostgresqlIntegrationStore(client.pool),
      automationStore: createPostgresqlAutomationStore(client),
      notificationStore: createPostgresqlNotificationStore(client),
      incidentStore: createPostgresqlIncidentStore(client),
      pushSubscriptionStore: createPostgresqlPushSubscriptionStore(client),
      jobStore: createPostgresqlJobStore(client),
      backupStore: createPostgresqlBackupStore(client),
      securityStore: createPostgresqlSecurityStore(client.pool),
    };
  }
  const client = createSqliteClient(process.env.DATABASE_URL ?? "./appdata/dashboard.sqlite");
  return {
    dialect: "sqlite" as const,
    client,
    authStore: createSqliteAuthStore(client.sqlite),
    boardStore: createSqliteBoardStore(client.sqlite),
    appStore: createSqliteAppStore(client.sqlite),
    integrationStore: createSqliteIntegrationStore(client.sqlite),
    automationStore: createSqliteAutomationStore(client),
    notificationStore: createSqliteNotificationStore(client),
    incidentStore: createSqliteIncidentStore(client),
    pushSubscriptionStore: createSqlitePushSubscriptionStore(client),
    jobStore: createSqliteJobStore(client),
    backupStore: createSqliteBackupStore(client),
    securityStore: createSqliteSecurityStore(client.sqlite),
  };
}
export function getDatabase() {
  return (globalDatabase.dashboardDatabase ??= createDatabase());
}
