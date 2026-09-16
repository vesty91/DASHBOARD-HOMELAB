import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type {
  DailyReliabilityRollup,
  IncidentIntervalInput,
  MaintenanceIntervalInput,
  ReliabilityStorePort,
  ServicePresence,
} from "@dashboard/reliability";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

function toRollup(row: {
  id: string;
  serviceKey: string;
  dateUtc: string;
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  incidentCount: number;
  updatedAt: Date;
}): DailyReliabilityRollup {
  return {
    id: row.id,
    serviceKey: row.serviceKey,
    dateUtc: row.dateUtc,
    observedSeconds: row.observedSeconds,
    availableSeconds: row.availableSeconds,
    degradedSeconds: row.degradedSeconds,
    unavailableSeconds: row.unavailableSeconds,
    maintenanceSeconds: row.maintenanceSeconds,
    unknownSeconds: row.unknownSeconds,
    incidentCount: row.incidentCount,
    updatedAt: row.updatedAt,
  };
}

function createReliabilityStore(adapters: {
  listIntegrationPresence(): Promise<ServicePresence[]>;
  listIncidentsBetween(fromMs: number, toMs: number): Promise<IncidentIntervalInput[]>;
  listMaintenancesBetween(fromMs: number, toMs: number): Promise<MaintenanceIntervalInput[]>;
  upsertDaily(rows: readonly DailyReliabilityRollup[]): Promise<void>;
  listDaily(input: {
    serviceKeys: readonly string[];
    fromDateUtc: string;
    toDateUtc: string;
    limit: number;
  }): Promise<DailyReliabilityRollup[]>;
  deleteOlderThan(dateUtcExclusive: string): Promise<number>;
}): ReliabilityStorePort {
  return {
    listIntegrationPresence: () => adapters.listIntegrationPresence(),
    listIncidentsBetween: (fromMs, toMs) => adapters.listIncidentsBetween(fromMs, toMs),
    listMaintenancesBetween: (fromMs, toMs) => adapters.listMaintenancesBetween(fromMs, toMs),
    upsertDaily: (rows) => adapters.upsertDaily(rows),
    listDaily: (input) => adapters.listDaily(input),
    deleteOlderThan: (dateUtcExclusive) => adapters.deleteOlderThan(dateUtcExclusive),
  };
}

export function createSqliteReliabilityStore(client: SqliteClient): ReliabilityStorePort {
  const db = client.db;
  const schema = sqliteSchema;
  return createReliabilityStore({
    async listIntegrationPresence() {
      const rows = await db
        .select({ id: schema.integrations.id, createdAt: schema.integrations.createdAt })
        .from(schema.integrations);
      return rows.map((row) => ({
        serviceKey: row.id,
        observableFromMs: row.createdAt.getTime(),
      }));
    },
    async listIncidentsBetween(fromMs, toMs) {
      const rows = await db
        .select({
          id: schema.incidents.id,
          integrationId: schema.incidents.integrationId,
          openedAt: schema.incidents.openedAt,
          resolvedAt: schema.incidents.resolvedAt,
        })
        .from(schema.incidents)
        .where(
          and(
            eq(schema.incidents.kind, "availability"),
            lt(schema.incidents.openedAt, new Date(toMs)),
            or(
              sql`${schema.incidents.resolvedAt} IS NULL`,
              gte(schema.incidents.resolvedAt, new Date(fromMs)),
            ),
          ),
        );
      return rows.map((row) => ({
        id: row.id,
        serviceKey: row.integrationId,
        openedAtMs: row.openedAt.getTime(),
        resolvedAtMs: row.resolvedAt ? row.resolvedAt.getTime() : null,
      }));
    },
    async listMaintenancesBetween(fromMs, toMs) {
      const windows = await db
        .select({
          id: schema.maintenanceWindows.id,
          startsAt: schema.maintenanceWindows.startsAt,
          endsAt: schema.maintenanceWindows.endsAt,
          status: schema.maintenanceWindows.status,
        })
        .from(schema.maintenanceWindows)
        .where(
          and(
            lt(schema.maintenanceWindows.startsAt, new Date(toMs)),
            gte(schema.maintenanceWindows.endsAt, new Date(fromMs)),
          ),
        );
      if (windows.length === 0) return [];
      const targets = await db
        .select({
          maintenanceId: schema.maintenanceWindowTargets.maintenanceId,
          integrationId: schema.maintenanceWindowTargets.integrationId,
        })
        .from(schema.maintenanceWindowTargets)
        .where(
          inArray(
            schema.maintenanceWindowTargets.maintenanceId,
            windows.map((item) => item.id),
          ),
        );
      const byId = new Map(windows.map((item) => [item.id, item]));
      return targets.flatMap((target) => {
        const window = byId.get(target.maintenanceId);
        if (!window) return [];
        return [
          {
            id: window.id,
            serviceKey: target.integrationId,
            startsAtMs: window.startsAt.getTime(),
            endsAtMs: window.endsAt.getTime(),
            cancelled: window.status === "cancelled",
          },
        ];
      });
    },
    async upsertDaily(rows) {
      if (rows.length === 0) return;
      try {
        for (const row of rows) {
          await db
            .insert(schema.serviceReliabilityDaily)
            .values({
              id: row.id,
              serviceKey: row.serviceKey,
              dateUtc: row.dateUtc,
              observedSeconds: row.observedSeconds,
              availableSeconds: row.availableSeconds,
              degradedSeconds: row.degradedSeconds,
              unavailableSeconds: row.unavailableSeconds,
              maintenanceSeconds: row.maintenanceSeconds,
              unknownSeconds: row.unknownSeconds,
              incidentCount: row.incidentCount,
              updatedAt: row.updatedAt,
            })
            .onConflictDoUpdate({
              target: [
                schema.serviceReliabilityDaily.serviceKey,
                schema.serviceReliabilityDaily.dateUtc,
              ],
              set: {
                observedSeconds: row.observedSeconds,
                availableSeconds: row.availableSeconds,
                degradedSeconds: row.degradedSeconds,
                unavailableSeconds: row.unavailableSeconds,
                maintenanceSeconds: row.maintenanceSeconds,
                unknownSeconds: row.unknownSeconds,
                incidentCount: row.incidentCount,
                updatedAt: row.updatedAt,
              },
            });
        }
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listDaily(input) {
      const rows = await db
        .select()
        .from(schema.serviceReliabilityDaily)
        .where(
          and(
            inArray(schema.serviceReliabilityDaily.serviceKey, [...input.serviceKeys]),
            gte(schema.serviceReliabilityDaily.dateUtc, input.fromDateUtc),
            lte(schema.serviceReliabilityDaily.dateUtc, input.toDateUtc),
          ),
        )
        .orderBy(
          asc(schema.serviceReliabilityDaily.serviceKey),
          asc(schema.serviceReliabilityDaily.dateUtc),
        )
        .limit(input.limit);
      return rows.map(toRollup);
    },
    async deleteOlderThan(dateUtcExclusive) {
      await db
        .delete(schema.serviceReliabilityDaily)
        .where(lt(schema.serviceReliabilityDaily.dateUtc, dateUtcExclusive));
      return 0;
    },
  });
}

export function createPostgresqlReliabilityStore(client: PostgresqlClient): ReliabilityStorePort {
  const db = client.db;
  const schema = postgresqlSchema;
  return createReliabilityStore({
    async listIntegrationPresence() {
      const rows = await db
        .select({ id: schema.integrations.id, createdAt: schema.integrations.createdAt })
        .from(schema.integrations);
      return rows.map((row) => ({
        serviceKey: row.id,
        observableFromMs: row.createdAt.getTime(),
      }));
    },
    async listIncidentsBetween(fromMs, toMs) {
      const rows = await db
        .select({
          id: schema.incidents.id,
          integrationId: schema.incidents.integrationId,
          openedAt: schema.incidents.openedAt,
          resolvedAt: schema.incidents.resolvedAt,
        })
        .from(schema.incidents)
        .where(
          and(
            eq(schema.incidents.kind, "availability"),
            lt(schema.incidents.openedAt, new Date(toMs)),
            or(
              sql`${schema.incidents.resolvedAt} IS NULL`,
              gte(schema.incidents.resolvedAt, new Date(fromMs)),
            ),
          ),
        );
      return rows.map((row) => ({
        id: row.id,
        serviceKey: row.integrationId,
        openedAtMs: row.openedAt.getTime(),
        resolvedAtMs: row.resolvedAt ? row.resolvedAt.getTime() : null,
      }));
    },
    async listMaintenancesBetween(fromMs, toMs) {
      const windows = await db
        .select({
          id: schema.maintenanceWindows.id,
          startsAt: schema.maintenanceWindows.startsAt,
          endsAt: schema.maintenanceWindows.endsAt,
          status: schema.maintenanceWindows.status,
        })
        .from(schema.maintenanceWindows)
        .where(
          and(
            lt(schema.maintenanceWindows.startsAt, new Date(toMs)),
            gte(schema.maintenanceWindows.endsAt, new Date(fromMs)),
          ),
        );
      if (windows.length === 0) return [];
      const targets = await db
        .select({
          maintenanceId: schema.maintenanceWindowTargets.maintenanceId,
          integrationId: schema.maintenanceWindowTargets.integrationId,
        })
        .from(schema.maintenanceWindowTargets)
        .where(
          inArray(
            schema.maintenanceWindowTargets.maintenanceId,
            windows.map((item) => item.id),
          ),
        );
      const byId = new Map(windows.map((item) => [item.id, item]));
      return targets.flatMap((target) => {
        const window = byId.get(target.maintenanceId);
        if (!window) return [];
        return [
          {
            id: window.id,
            serviceKey: target.integrationId,
            startsAtMs: window.startsAt.getTime(),
            endsAtMs: window.endsAt.getTime(),
            cancelled: window.status === "cancelled",
          },
        ];
      });
    },
    async upsertDaily(rows) {
      if (rows.length === 0) return;
      try {
        for (const row of rows) {
          await db
            .insert(schema.serviceReliabilityDaily)
            .values({
              id: row.id,
              serviceKey: row.serviceKey,
              dateUtc: row.dateUtc,
              observedSeconds: row.observedSeconds,
              availableSeconds: row.availableSeconds,
              degradedSeconds: row.degradedSeconds,
              unavailableSeconds: row.unavailableSeconds,
              maintenanceSeconds: row.maintenanceSeconds,
              unknownSeconds: row.unknownSeconds,
              incidentCount: row.incidentCount,
              updatedAt: row.updatedAt,
            })
            .onConflictDoUpdate({
              target: [
                schema.serviceReliabilityDaily.serviceKey,
                schema.serviceReliabilityDaily.dateUtc,
              ],
              set: {
                observedSeconds: row.observedSeconds,
                availableSeconds: row.availableSeconds,
                degradedSeconds: row.degradedSeconds,
                unavailableSeconds: row.unavailableSeconds,
                maintenanceSeconds: row.maintenanceSeconds,
                unknownSeconds: row.unknownSeconds,
                incidentCount: row.incidentCount,
                updatedAt: row.updatedAt,
              },
            });
        }
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listDaily(input) {
      const rows = await db
        .select()
        .from(schema.serviceReliabilityDaily)
        .where(
          and(
            inArray(schema.serviceReliabilityDaily.serviceKey, [...input.serviceKeys]),
            gte(schema.serviceReliabilityDaily.dateUtc, input.fromDateUtc),
            lte(schema.serviceReliabilityDaily.dateUtc, input.toDateUtc),
          ),
        )
        .orderBy(
          asc(schema.serviceReliabilityDaily.serviceKey),
          asc(schema.serviceReliabilityDaily.dateUtc),
        )
        .limit(input.limit);
      return rows.map(toRollup);
    },
    async deleteOlderThan(dateUtcExclusive) {
      const result = await db
        .delete(schema.serviceReliabilityDaily)
        .where(lt(schema.serviceReliabilityDaily.dateUtc, dateUtcExclusive));
      return Number(result.rowCount ?? 0);
    },
  });
}
