import {
  createPostgresqlAuthStore,
  createPostgresqlAutomationStore,
  createPostgresqlClient,
  createPostgresqlIncidentStore,
  createPostgresqlJobStore,
  createPostgresqlNotificationStore,
  createPostgresqlStatusPageStore,
  createPostgresqlReliabilityStore,
  createPostgresqlTopologyStore,
  createSqliteAuthStore,
  createSqliteAutomationStore,
  createSqliteClient,
  createSqliteIncidentStore,
  createSqliteJobStore,
  createSqliteNotificationStore,
  createSqliteStatusPageStore,
  createSqliteReliabilityStore,
  createSqliteTopologyStore,
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
import {
  createIncidentService,
  createNotificationService,
  type IncidentService,
  type NotificationStorePort,
} from "@dashboard/notifications";
import { hasPermission } from "@dashboard/permissions";
import type { IntegrationStore } from "@dashboard/integrations";
import { createStatusPageService, type MaintenanceWindowService } from "@dashboard/status-pages";
import { createReliabilityService, type ReliabilityService } from "@dashboard/reliability";
import { createImpactEventReconciler, type ImpactEventReconciler } from "@dashboard/topology";
import type { DomainEvent } from "@dashboard/events";
import type { AutomationAuditSink } from "./actions";
import { createJobRecorder } from "./jobs";
import type { JobRecorder } from "./server";

export interface WorkerPersistence {
  jobs: JobRecorder;
  automations: AutomationStore;
  schedulerStore: AutomationSchedulerStore;
  notificationStore: NotificationStorePort;
  purgeNotifications: () => Promise<number>;
  incidents: IncidentService;
  maintenance: Pick<MaintenanceWindowService, "tick">;
  reliability: Pick<ReliabilityService, "tick">;
  impactReconciler: ImpactEventReconciler;
  integrationStore: IntegrationStore;
  audit: AutomationAuditSink;
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  bindDomainEventPublisher: (publish: (event: DomainEvent) => Promise<void>) => void;
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

function buildIncidentService(input: {
  notificationStore: NotificationStorePort;
  incidentStore: Parameters<typeof createIncidentService>[0]["store"];
  listUsers: () => Promise<ReadonlyArray<{ id: string; status: "active" | "disabled" }>>;
  resolvePermissionSubject: (userId: string) => Promise<{
    status: "active" | "disabled";
    isSystemAdmin: boolean;
    directPermissions?: readonly string[];
    groupPermissions?: readonly string[];
  } | null>;
}): IncidentService {
  const notifications = createNotificationService({ store: input.notificationStore });
  return createIncidentService({
    store: input.incidentStore,
    notifications,
    async listRecipientUserIds() {
      const users = await input.listUsers();
      const recipients: string[] = [];
      for (const user of users) {
        if (user.status !== "active") continue;
        const subject = await input.resolvePermissionSubject(user.id);
        if (!subject) continue;
        if (subject.isSystemAdmin || hasPermission(subject, "integration.read"))
          recipients.push(user.id);
      }
      return recipients;
    },
  });
}

function buildMaintenanceService(input: {
  notificationStore: NotificationStorePort;
  statusPageStore: Parameters<typeof createStatusPageService>[0]["store"];
  listUsers: () => Promise<ReadonlyArray<{ id: string; status: "active" | "disabled" }>>;
  resolvePermissionSubject: (userId: string) => Promise<{
    status: "active" | "disabled";
    isSystemAdmin: boolean;
    directPermissions?: readonly string[];
    groupPermissions?: readonly string[];
  } | null>;
}): Pick<MaintenanceWindowService, "tick"> {
  const notifications = createNotificationService({ store: input.notificationStore });
  const statusPages = createStatusPageService({
    store: input.statusPageStore,
    notifications,
    async listMaintenanceRecipientUserIds() {
      const users = await input.listUsers();
      const recipients: string[] = [];
      for (const user of users) {
        if (user.status !== "active") continue;
        const subject = await input.resolvePermissionSubject(user.id);
        if (!subject) continue;
        if (subject.isSystemAdmin || hasPermission(subject, "status-page.manage"))
          recipients.push(user.id);
      }
      return recipients;
    },
  });
  return statusPages.maintenance;
}

function buildReliabilityService(input: {
  store: Parameters<typeof createReliabilityService>[0]["store"];
  notificationStore: NotificationStorePort;
  listUsers: () => Promise<ReadonlyArray<{ id: string; status: "active" | "disabled" }>>;
  resolvePermissionSubject: (userId: string) => Promise<{
    status: "active" | "disabled";
    isSystemAdmin: boolean;
    directPermissions?: readonly string[];
    groupPermissions?: readonly string[];
  } | null>;
  publishRef: { current: (event: DomainEvent) => Promise<void> };
}): Pick<ReliabilityService, "tick"> {
  const notifications = createNotificationService({ store: input.notificationStore });
  return createReliabilityService({
    store: input.store,
    alerts: {
      async listRecipientUserIds() {
        const users = await input.listUsers();
        const recipients: string[] = [];
        for (const user of users) {
          if (user.status !== "active") continue;
          const subject = await input.resolvePermissionSubject(user.id);
          if (!subject) continue;
          if (
            subject.isSystemAdmin ||
            hasPermission(subject, "reliability.read") ||
            hasPermission(subject, "slo.manage")
          ) {
            recipients.push(user.id);
          }
        }
        return recipients;
      },
      async createNotification(payload) {
        await notifications.createForUser({
          userId: payload.userId,
          title: payload.title,
          body: payload.body,
          severity: payload.severity,
          category: payload.category,
          dedupKey: payload.dedupKey,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
        });
      },
      async publishEvent(event) {
        await input.publishRef.current(event);
      },
    },
  });
}

export function createWorkerPersistenceFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): WorkerPersistence | undefined {
  if (!env.DATABASE_URL?.trim()) return undefined;
  const config = parseDatabaseConfig({
    DB_DRIVER: env.DB_DRIVER ?? "sqlite",
    DATABASE_URL: env.DATABASE_URL,
  });
  const publishRef: { current: (event: DomainEvent) => Promise<void> } = {
    current: async () => undefined,
  };
  const bindDomainEventPublisher = (publish: (event: DomainEvent) => Promise<void>) => {
    publishRef.current = publish;
  };
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
      incidents: buildIncidentService({
        notificationStore: notifications.notificationStore,
        incidentStore: createPostgresqlIncidentStore(client),
        listUsers: () => auth.listUsers(),
        resolvePermissionSubject: async (userId) =>
          (await auth.resolvePermissionSubject(userId)) ?? null,
      }),
      maintenance: buildMaintenanceService({
        notificationStore: notifications.notificationStore,
        statusPageStore: createPostgresqlStatusPageStore(client),
        listUsers: () => auth.listUsers(),
        resolvePermissionSubject: async (userId) =>
          (await auth.resolvePermissionSubject(userId)) ?? null,
      }),
      reliability: buildReliabilityService({
        store: createPostgresqlReliabilityStore(client),
        notificationStore: notifications.notificationStore,
        listUsers: () => auth.listUsers(),
        resolvePermissionSubject: async (userId) =>
          (await auth.resolvePermissionSubject(userId)) ?? null,
        publishRef,
      }),
      impactReconciler: createImpactEventReconciler({
        store: createPostgresqlTopologyStore(client),
        publishEvent: async (event) => {
          await publishRef.current(event);
        },
      }),
      bindDomainEventPublisher,
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
    incidents: buildIncidentService({
      notificationStore: notifications.notificationStore,
      incidentStore: createSqliteIncidentStore(client),
      listUsers: () => auth.listUsers(),
      resolvePermissionSubject: async (userId) =>
        (await auth.resolvePermissionSubject(userId)) ?? null,
    }),
    maintenance: buildMaintenanceService({
      notificationStore: notifications.notificationStore,
      statusPageStore: createSqliteStatusPageStore(client),
      listUsers: () => auth.listUsers(),
      resolvePermissionSubject: async (userId) =>
        (await auth.resolvePermissionSubject(userId)) ?? null,
    }),
    reliability: buildReliabilityService({
      store: createSqliteReliabilityStore(client),
      notificationStore: notifications.notificationStore,
      listUsers: () => auth.listUsers(),
      resolvePermissionSubject: async (userId) =>
        (await auth.resolvePermissionSubject(userId)) ?? null,
      publishRef,
    }),
    impactReconciler: createImpactEventReconciler({
      store: createSqliteTopologyStore(client),
      publishEvent: async (event) => {
        await publishRef.current(event);
      },
    }),
    bindDomainEventPublisher,
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
