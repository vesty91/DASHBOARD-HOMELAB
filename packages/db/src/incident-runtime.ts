import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import {
  NotificationError,
  type IncidentEventRecord,
  type IncidentKind,
  type IncidentRecord,
  type IncidentStatus,
  type IncidentStorePort,
  type NotificationSeverity,
} from "@dashboard/notifications";
import { DatabaseError, normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

function toIncident(row: {
  id: string;
  integrationId: string;
  kind: string;
  severity: string;
  status: string;
  openedAt: Date;
  lastChangedAt: Date;
  resolvedAt: Date | null;
  openingEventId: string | null;
  closingEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IncidentRecord {
  return {
    id: row.id,
    integrationId: row.integrationId,
    kind: row.kind as IncidentKind,
    severity: row.severity as NotificationSeverity,
    status: row.status as IncidentStatus,
    openedAt: row.openedAt,
    lastChangedAt: row.lastChangedAt,
    resolvedAt: row.resolvedAt,
    openingEventId: row.openingEventId,
    closingEventId: row.closingEventId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: {
  id: string;
  incidentId: string;
  eventType: string;
  summary: string;
  createdAt: Date;
}): IncidentEventRecord {
  return {
    id: row.id,
    incidentId: row.incidentId,
    eventType: row.eventType as IncidentEventRecord["eventType"],
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "UNIQUE_CONSTRAINT";
}

function mapIncidentRow(found: {
  id: string;
  integrationId: string;
  kind: string;
  severity: string;
  status: string;
  openedAt: Date;
  lastChangedAt: Date;
  resolvedAt: Date | null;
  openingEventId: string | null;
  closingEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IncidentRecord {
  return toIncident({
    ...found,
    resolvedAt: found.resolvedAt ?? null,
    openingEventId: found.openingEventId ?? null,
    closingEventId: found.closingEventId ?? null,
  });
}

export function createSqliteIncidentStore(client: SqliteClient): IncidentStorePort {
  const { db, sqlite } = client;
  const incidents = sqliteSchema.incidents;
  const events = sqliteSchema.incidentEvents;

  async function load(id: string): Promise<IncidentRecord | null> {
    const found = await db.select().from(incidents).where(eq(incidents.id, id)).get();
    if (!found?.id) return null;
    return mapIncidentRow(found);
  }

  const store: IncidentStorePort = {
    async findOpen(integrationId, kind) {
      const found = await db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.integrationId, integrationId),
            eq(incidents.kind, kind),
            eq(incidents.status, "open"),
          ),
        )
        .get();
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    async findByOpeningEventId(openingEventId) {
      const found = await db
        .select()
        .from(incidents)
        .where(eq(incidents.openingEventId, openingEventId))
        .get();
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    async findByClosingEventId(closingEventId) {
      const found = await db
        .select()
        .from(incidents)
        .where(eq(incidents.closingEventId, closingEventId))
        .get();
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    get: load,
    async list(input) {
      const conditions = [];
      if (input.status) conditions.push(eq(incidents.status, input.status));
      if (input.integrationId) conditions.push(eq(incidents.integrationId, input.integrationId));
      if (input.kind) conditions.push(eq(incidents.kind, input.kind));
      if (input.cursorCreatedAt && input.cursorId) {
        conditions.push(
          or(
            lt(incidents.lastChangedAt, input.cursorCreatedAt),
            and(
              eq(incidents.lastChangedAt, input.cursorCreatedAt),
              lt(incidents.id, input.cursorId),
            ),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(incidents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(incidents.lastChangedAt), desc(incidents.id))
        .limit(input.limit)
        .all();
      return rows.map(mapIncidentRow);
    },
    async openAvailability(input) {
      const id = randomUUID();
      const eventId = randomUUID();
      try {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          await db
            .insert(incidents)
            .values({
              id,
              integrationId: input.integrationId,
              kind: "availability",
              severity: input.severity,
              status: "open",
              openedAt: input.now,
              lastChangedAt: input.now,
              resolvedAt: null,
              openingEventId: input.openingEventId,
              closingEventId: null,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .run();
          await db
            .insert(events)
            .values({
              id: eventId,
              incidentId: id,
              eventType: "opened",
              summary: input.summary,
              createdAt: input.now,
            })
            .run();
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
        const created = await load(id);
        if (!created) throw new NotificationError("NOT_FOUND", "Incident not found");
        return created;
      } catch (error) {
        const normalized = normalizeDatabaseError(error);
        if (isUniqueConstraint(normalized)) {
          const existing = await store.findOpen(input.integrationId, "availability");
          if (existing) return existing;
          const byEvent = await store.findByOpeningEventId(input.openingEventId);
          if (byEvent) return byEvent;
        }
        throw normalized;
      }
    },
    async resolve(input) {
      try {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          await db
            .update(incidents)
            .set({
              status: "resolved",
              resolvedAt: input.now,
              lastChangedAt: input.now,
              closingEventId: input.closingEventId,
              updatedAt: input.now,
            })
            .where(and(eq(incidents.id, input.id), eq(incidents.status, "open")))
            .run();
          const current = await db.select().from(incidents).where(eq(incidents.id, input.id)).get();
          if (
            !current?.id ||
            current.status !== "resolved" ||
            current.closingEventId !== input.closingEventId
          ) {
            sqlite.exec("ROLLBACK");
            return null;
          }
          await db
            .insert(events)
            .values({
              id: randomUUID(),
              incidentId: input.id,
              eventType: "resolved",
              summary: input.summary,
              createdAt: input.now,
            })
            .run();
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
        return load(input.id);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listEvents(incidentId, limit) {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.incidentId, incidentId))
        .orderBy(asc(events.createdAt), asc(events.id))
        .limit(limit)
        .all();
      return rows.map(toEvent);
    },
  };
  return store;
}

export function createPostgresqlIncidentStore(client: PostgresqlClient): IncidentStorePort {
  const { db } = client;
  const incidents = postgresqlSchema.incidents;
  const events = postgresqlSchema.incidentEvents;

  async function load(id: string): Promise<IncidentRecord | null> {
    const rows = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
    const found = rows[0];
    if (!found?.id) return null;
    return mapIncidentRow(found);
  }

  const store: IncidentStorePort = {
    async findOpen(integrationId, kind) {
      const rows = await db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.integrationId, integrationId),
            eq(incidents.kind, kind),
            eq(incidents.status, "open"),
          ),
        )
        .limit(1);
      const found = rows[0];
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    async findByOpeningEventId(openingEventId) {
      const rows = await db
        .select()
        .from(incidents)
        .where(eq(incidents.openingEventId, openingEventId))
        .limit(1);
      const found = rows[0];
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    async findByClosingEventId(closingEventId) {
      const rows = await db
        .select()
        .from(incidents)
        .where(eq(incidents.closingEventId, closingEventId))
        .limit(1);
      const found = rows[0];
      if (!found?.id) return null;
      return mapIncidentRow(found);
    },
    get: load,
    async list(input) {
      const conditions = [];
      if (input.status) conditions.push(eq(incidents.status, input.status));
      if (input.integrationId) conditions.push(eq(incidents.integrationId, input.integrationId));
      if (input.kind) conditions.push(eq(incidents.kind, input.kind));
      if (input.cursorCreatedAt && input.cursorId) {
        conditions.push(
          or(
            lt(incidents.lastChangedAt, input.cursorCreatedAt),
            and(
              eq(incidents.lastChangedAt, input.cursorCreatedAt),
              lt(incidents.id, input.cursorId),
            ),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(incidents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(incidents.lastChangedAt), desc(incidents.id))
        .limit(input.limit);
      return rows.map(mapIncidentRow);
    },
    async openAvailability(input) {
      const id = randomUUID();
      const eventId = randomUUID();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(incidents).values({
            id,
            integrationId: input.integrationId,
            kind: "availability",
            severity: input.severity,
            status: "open",
            openedAt: input.now,
            lastChangedAt: input.now,
            resolvedAt: null,
            openingEventId: input.openingEventId,
            closingEventId: null,
            createdAt: input.now,
            updatedAt: input.now,
          });
          await tx.insert(events).values({
            id: eventId,
            incidentId: id,
            eventType: "opened",
            summary: input.summary,
            createdAt: input.now,
          });
        });
        const created = await load(id);
        if (!created) throw new NotificationError("NOT_FOUND", "Incident not found");
        return created;
      } catch (error) {
        const normalized = normalizeDatabaseError(error);
        if (isUniqueConstraint(normalized)) {
          const existing = await store.findOpen(input.integrationId, "availability");
          if (existing) return existing;
          const byEvent = await store.findByOpeningEventId(input.openingEventId);
          if (byEvent) return byEvent;
        }
        throw normalized;
      }
    },
    async resolve(input) {
      try {
        const updated = await db.transaction(async (tx) => {
          const rows = await tx
            .update(incidents)
            .set({
              status: "resolved",
              resolvedAt: input.now,
              lastChangedAt: input.now,
              closingEventId: input.closingEventId,
              updatedAt: input.now,
            })
            .where(and(eq(incidents.id, input.id), eq(incidents.status, "open")))
            .returning({ id: incidents.id });
          if (rows.length === 0) return null;
          await tx.insert(events).values({
            id: randomUUID(),
            incidentId: input.id,
            eventType: "resolved",
            summary: input.summary,
            createdAt: input.now,
          });
          return input.id;
        });
        if (!updated) return null;
        return load(input.id);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listEvents(incidentId, limit) {
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.incidentId, incidentId))
        .orderBy(asc(events.createdAt), asc(events.id))
        .limit(limit);
      return rows.map(toEvent);
    },
  };
  return store;
}
