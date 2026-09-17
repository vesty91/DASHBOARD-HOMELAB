import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  ReliabilityError,
  type DailyReliabilityRollup,
  type HourlyReliabilityRollup,
  type IncidentIntervalInput,
  type MaintenanceIntervalInput,
  type ReliabilityStorePort,
  type ServicePresence,
  type ServiceSlo,
} from "@dashboard/reliability";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

type RollupRow = {
  id: string;
  serviceKey: string;
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  incidentCount: number;
  updatedAt: Date;
};

function toDailyRollup(row: RollupRow & { dateUtc: string }): DailyReliabilityRollup {
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

function toHourlyRollup(row: RollupRow & { hourUtc: string }): HourlyReliabilityRollup {
  return {
    id: row.id,
    serviceKey: row.serviceKey,
    hourUtc: row.hourUtc,
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

function toSlo(row: {
  id: string;
  serviceKey: string;
  name: string;
  objectiveBasisPoints: number;
  windowDays: number;
  excludeMaintenance: boolean;
  enabled: boolean;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
}): ServiceSlo {
  return {
    id: row.id,
    serviceKey: row.serviceKey,
    name: row.name,
    objectiveBasisPoints: row.objectiveBasisPoints,
    windowDays: row.windowDays as 7 | 30 | 90,
    excludeMaintenance: row.excludeMaintenance,
    enabled: row.enabled,
    configRevision: row.configRevision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function throwReliabilityDatabaseError(error: unknown): never {
  const normalized = normalizeDatabaseError(error);
  if (normalized.code === "UNIQUE_CONSTRAINT") {
    throw new ReliabilityError("CONFLICT", "SLO constraint violation");
  }
  throw normalized;
}

async function assertSloRevisionOrThrow(exists: boolean, changed: boolean): Promise<void> {
  if (changed) return;
  if (exists) throw new ReliabilityError("CONFLICT", "SLO configuration changed");
  throw new ReliabilityError("NOT_FOUND", "SLO not found");
}

function createReliabilityStore(adapters: {
  listIntegrationPresence(): Promise<ServicePresence[]>;
  integrationExists(serviceKey: string): Promise<boolean>;
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
  upsertHourly(rows: readonly HourlyReliabilityRollup[]): Promise<void>;
  listHourly(input: {
    serviceKeys: readonly string[];
    fromHourUtc: string;
    toHourUtc: string;
    limit: number;
  }): Promise<HourlyReliabilityRollup[]>;
  deleteHourlyOlderThan(hourUtcExclusive: string): Promise<number>;
  listSlos(input?: { serviceKeys?: readonly string[]; limit?: number }): Promise<ServiceSlo[]>;
  getSlo(id: string): Promise<ServiceSlo | null>;
  createSlo(input: {
    id: string;
    serviceKey: string;
    name: string;
    objectiveBasisPoints: number;
    windowDays: 7 | 30 | 90;
    excludeMaintenance: boolean;
    enabled: boolean;
    now: Date;
  }): Promise<ServiceSlo>;
  updateSlo(input: {
    id: string;
    expectedConfigRevision: number;
    name?: string;
    objectiveBasisPoints?: number;
    windowDays?: 7 | 30 | 90;
    excludeMaintenance?: boolean;
    enabled?: boolean;
    now: Date;
  }): Promise<ServiceSlo>;
  deleteSlo(id: string, expectedConfigRevision: number): Promise<void>;
}): ReliabilityStorePort {
  return {
    listIntegrationPresence: () => adapters.listIntegrationPresence(),
    integrationExists: (serviceKey) => adapters.integrationExists(serviceKey),
    listIncidentsBetween: (fromMs, toMs) => adapters.listIncidentsBetween(fromMs, toMs),
    listMaintenancesBetween: (fromMs, toMs) => adapters.listMaintenancesBetween(fromMs, toMs),
    upsertDaily: (rows) => adapters.upsertDaily(rows),
    listDaily: (input) => adapters.listDaily(input),
    deleteOlderThan: (dateUtcExclusive) => adapters.deleteOlderThan(dateUtcExclusive),
    upsertHourly: (rows) => adapters.upsertHourly(rows),
    listHourly: (input) => adapters.listHourly(input),
    deleteHourlyOlderThan: (hourUtcExclusive) => adapters.deleteHourlyOlderThan(hourUtcExclusive),
    listSlos: (input) => adapters.listSlos(input),
    getSlo: (id) => adapters.getSlo(id),
    createSlo: (input) => adapters.createSlo(input),
    updateSlo: (input) => adapters.updateSlo(input),
    deleteSlo: (id, expectedConfigRevision) => adapters.deleteSlo(id, expectedConfigRevision),
  };
}

export function createSqliteReliabilityStore(client: SqliteClient): ReliabilityStorePort {
  const db = client.db;
  const schema = sqliteSchema;

  async function getSloRow(id: string) {
    const rows = await db
      .select()
      .from(schema.serviceSlos)
      .where(eq(schema.serviceSlos.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

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
    async integrationExists(serviceKey) {
      const rows = await db
        .select({ id: schema.integrations.id })
        .from(schema.integrations)
        .where(eq(schema.integrations.id, serviceKey))
        .limit(1);
      return rows.length > 0;
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
      return rows.map(toDailyRollup);
    },
    async deleteOlderThan(dateUtcExclusive) {
      await db
        .delete(schema.serviceReliabilityDaily)
        .where(lt(schema.serviceReliabilityDaily.dateUtc, dateUtcExclusive));
      return 0;
    },
    async upsertHourly(rows) {
      if (rows.length === 0) return;
      try {
        for (const row of rows) {
          await db
            .insert(schema.serviceReliabilityHourly)
            .values({
              id: row.id,
              serviceKey: row.serviceKey,
              hourUtc: row.hourUtc,
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
                schema.serviceReliabilityHourly.serviceKey,
                schema.serviceReliabilityHourly.hourUtc,
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
    async listHourly(input) {
      const rows = await db
        .select()
        .from(schema.serviceReliabilityHourly)
        .where(
          and(
            inArray(schema.serviceReliabilityHourly.serviceKey, [...input.serviceKeys]),
            gte(schema.serviceReliabilityHourly.hourUtc, input.fromHourUtc),
            lte(schema.serviceReliabilityHourly.hourUtc, input.toHourUtc),
          ),
        )
        .orderBy(
          asc(schema.serviceReliabilityHourly.serviceKey),
          asc(schema.serviceReliabilityHourly.hourUtc),
        )
        .limit(input.limit);
      return rows.map(toHourlyRollup);
    },
    async deleteHourlyOlderThan(hourUtcExclusive) {
      await db
        .delete(schema.serviceReliabilityHourly)
        .where(lt(schema.serviceReliabilityHourly.hourUtc, hourUtcExclusive));
      return 0;
    },
    async listSlos(input) {
      const filters = [];
      if (input?.serviceKeys && input.serviceKeys.length > 0) {
        filters.push(inArray(schema.serviceSlos.serviceKey, [...input.serviceKeys]));
      }
      let query = db
        .select()
        .from(schema.serviceSlos)
        .orderBy(asc(schema.serviceSlos.serviceKey), asc(schema.serviceSlos.name));
      if (filters.length > 0) {
        query = query.where(and(...filters)) as typeof query;
      }
      if (input?.limit !== undefined) {
        query = query.limit(input.limit) as typeof query;
      }
      const rows = await query;
      return rows.map(toSlo);
    },
    async getSlo(id) {
      const row = await getSloRow(id);
      return row ? toSlo(row) : null;
    },
    async createSlo(input) {
      try {
        await db
          .insert(schema.serviceSlos)
          .values({
            id: input.id,
            serviceKey: input.serviceKey,
            name: input.name,
            objectiveBasisPoints: input.objectiveBasisPoints,
            windowDays: input.windowDays,
            excludeMaintenance: input.excludeMaintenance,
            enabled: input.enabled,
            configRevision: 1,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run();
      } catch (error) {
        throwReliabilityDatabaseError(error);
      }
      const created = await getSloRow(input.id);
      if (!created) throw new ReliabilityError("NOT_FOUND", "SLO not found");
      return toSlo(created);
    },
    async updateSlo(input) {
      try {
        await db
          .update(schema.serviceSlos)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.objectiveBasisPoints !== undefined
              ? { objectiveBasisPoints: input.objectiveBasisPoints }
              : {}),
            ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
            ...(input.excludeMaintenance !== undefined
              ? { excludeMaintenance: input.excludeMaintenance }
              : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            configRevision: sql`${schema.serviceSlos.configRevision} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(schema.serviceSlos.id, input.id),
              eq(schema.serviceSlos.configRevision, input.expectedConfigRevision),
            ),
          )
          .run();
        const updated = await getSloRow(input.id);
        if (!updated || updated.configRevision !== input.expectedConfigRevision + 1) {
          await assertSloRevisionOrThrow(Boolean(updated), false);
          throw new ReliabilityError("NOT_FOUND", "SLO not found");
        }
        return toSlo(updated);
      } catch (error) {
        if (error instanceof ReliabilityError) throw error;
        throwReliabilityDatabaseError(error);
      }
    },
    async deleteSlo(id, expectedConfigRevision) {
      try {
        const existing = await getSloRow(id);
        await db
          .delete(schema.serviceSlos)
          .where(
            and(
              eq(schema.serviceSlos.id, id),
              eq(schema.serviceSlos.configRevision, expectedConfigRevision),
            ),
          )
          .run();
        if (!existing) {
          throw new ReliabilityError("NOT_FOUND", "SLO not found");
        }
        const stillThere = await getSloRow(id);
        if (stillThere) {
          await assertSloRevisionOrThrow(true, false);
        }
      } catch (error) {
        if (error instanceof ReliabilityError) throw error;
        throwReliabilityDatabaseError(error);
      }
    },
  });
}

export function createPostgresqlReliabilityStore(client: PostgresqlClient): ReliabilityStorePort {
  const db = client.db;
  const schema = postgresqlSchema;

  async function getSloRow(id: string) {
    const rows = await db
      .select()
      .from(schema.serviceSlos)
      .where(eq(schema.serviceSlos.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

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
    async integrationExists(serviceKey) {
      const rows = await db
        .select({ id: schema.integrations.id })
        .from(schema.integrations)
        .where(eq(schema.integrations.id, serviceKey))
        .limit(1);
      return rows.length > 0;
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
      return rows.map(toDailyRollup);
    },
    async deleteOlderThan(dateUtcExclusive) {
      const result = await db
        .delete(schema.serviceReliabilityDaily)
        .where(lt(schema.serviceReliabilityDaily.dateUtc, dateUtcExclusive));
      return Number(result.rowCount ?? 0);
    },
    async upsertHourly(rows) {
      if (rows.length === 0) return;
      try {
        for (const row of rows) {
          await db
            .insert(schema.serviceReliabilityHourly)
            .values({
              id: row.id,
              serviceKey: row.serviceKey,
              hourUtc: row.hourUtc,
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
                schema.serviceReliabilityHourly.serviceKey,
                schema.serviceReliabilityHourly.hourUtc,
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
    async listHourly(input) {
      const rows = await db
        .select()
        .from(schema.serviceReliabilityHourly)
        .where(
          and(
            inArray(schema.serviceReliabilityHourly.serviceKey, [...input.serviceKeys]),
            gte(schema.serviceReliabilityHourly.hourUtc, input.fromHourUtc),
            lte(schema.serviceReliabilityHourly.hourUtc, input.toHourUtc),
          ),
        )
        .orderBy(
          asc(schema.serviceReliabilityHourly.serviceKey),
          asc(schema.serviceReliabilityHourly.hourUtc),
        )
        .limit(input.limit);
      return rows.map(toHourlyRollup);
    },
    async deleteHourlyOlderThan(hourUtcExclusive) {
      const result = await db
        .delete(schema.serviceReliabilityHourly)
        .where(lt(schema.serviceReliabilityHourly.hourUtc, hourUtcExclusive));
      return Number(result.rowCount ?? 0);
    },
    async listSlos(input) {
      const filters = [];
      if (input?.serviceKeys && input.serviceKeys.length > 0) {
        filters.push(inArray(schema.serviceSlos.serviceKey, [...input.serviceKeys]));
      }
      let query = db
        .select()
        .from(schema.serviceSlos)
        .orderBy(asc(schema.serviceSlos.serviceKey), asc(schema.serviceSlos.name));
      if (filters.length > 0) {
        query = query.where(and(...filters)) as typeof query;
      }
      if (input?.limit !== undefined) {
        query = query.limit(input.limit) as typeof query;
      }
      const rows = await query;
      return rows.map(toSlo);
    },
    async getSlo(id) {
      const row = await getSloRow(id);
      return row ? toSlo(row) : null;
    },
    async createSlo(input) {
      try {
        await db.insert(schema.serviceSlos).values({
          id: input.id,
          serviceKey: input.serviceKey,
          name: input.name,
          objectiveBasisPoints: input.objectiveBasisPoints,
          windowDays: input.windowDays,
          excludeMaintenance: input.excludeMaintenance,
          enabled: input.enabled,
          configRevision: 1,
          createdAt: input.now,
          updatedAt: input.now,
        });
      } catch (error) {
        throwReliabilityDatabaseError(error);
      }
      const created = await getSloRow(input.id);
      if (!created) throw new ReliabilityError("NOT_FOUND", "SLO not found");
      return toSlo(created);
    },
    async updateSlo(input) {
      try {
        const updatedRows = await db
          .update(schema.serviceSlos)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.objectiveBasisPoints !== undefined
              ? { objectiveBasisPoints: input.objectiveBasisPoints }
              : {}),
            ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
            ...(input.excludeMaintenance !== undefined
              ? { excludeMaintenance: input.excludeMaintenance }
              : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            configRevision: sql`${schema.serviceSlos.configRevision} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(schema.serviceSlos.id, input.id),
              eq(schema.serviceSlos.configRevision, input.expectedConfigRevision),
            ),
          )
          .returning();
        if (updatedRows.length !== 1) {
          const row = await getSloRow(input.id);
          await assertSloRevisionOrThrow(Boolean(row), false);
        }
        return toSlo(updatedRows[0]!);
      } catch (error) {
        if (error instanceof ReliabilityError) throw error;
        throwReliabilityDatabaseError(error);
      }
    },
    async deleteSlo(id, expectedConfigRevision) {
      try {
        const existing = await getSloRow(id);
        const deletedRows = await db
          .delete(schema.serviceSlos)
          .where(
            and(
              eq(schema.serviceSlos.id, id),
              eq(schema.serviceSlos.configRevision, expectedConfigRevision),
            ),
          )
          .returning({ id: schema.serviceSlos.id });
        if (deletedRows.length !== 1) {
          if (!existing) {
            throw new ReliabilityError("NOT_FOUND", "SLO not found");
          }
          await assertSloRevisionOrThrow(true, false);
        }
      } catch (error) {
        if (error instanceof ReliabilityError) throw error;
        throwReliabilityDatabaseError(error);
      }
    },
  });
}
