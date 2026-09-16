import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  NotificationError,
  type NotificationCategory,
  type NotificationCreateInput,
  type NotificationRecord,
  type NotificationSeverity,
  type NotificationSourceType,
  type NotificationStorePort,
} from "@dashboard/notifications";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

function toRecord(row: {
  id: string;
  userId: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string | null;
  sourceIntegrationId: string | null;
  dedupKey: string | null;
  destinationPath: string | null;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category as NotificationCategory,
    severity: row.severity as NotificationSeverity,
    title: row.title,
    body: row.body,
    sourceType: row.sourceType as NotificationSourceType,
    sourceId: row.sourceId,
    sourceIntegrationId: row.sourceIntegrationId,
    dedupKey: row.dedupKey,
    destinationPath: row.destinationPath,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSqliteNotificationStore(client: SqliteClient): NotificationStorePort {
  const { db } = client;
  const table = sqliteSchema.notifications;

  async function load(id: string): Promise<NotificationRecord | null> {
    const found = await db.select().from(table).where(eq(table.id, id)).get();
    if (!found?.id) return null;
    return toRecord({
      ...found,
      sourceId: found.sourceId ?? null,
      sourceIntegrationId: found.sourceIntegrationId ?? null,
      dedupKey: found.dedupKey ?? null,
      destinationPath: found.destinationPath ?? null,
      readAt: found.readAt ?? null,
      dismissedAt: found.dismissedAt ?? null,
      expiresAt: found.expiresAt ?? null,
    });
  }

  return {
    async create(input: NotificationCreateInput & { now: Date }) {
      try {
        const id = randomUUID();
        await db
          .insert(table)
          .values({
            id,
            userId: input.userId,
            category: input.category,
            severity: input.severity,
            title: input.title,
            body: input.body,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            sourceIntegrationId: input.sourceIntegrationId ?? null,
            dedupKey: input.dedupKey ?? null,
            destinationPath: input.destinationPath ?? null,
            expiresAt: input.expiresAt ?? null,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run();
        const created = await load(id);
        if (!created) throw new NotificationError("NOT_FOUND", "Notification not found");
        return created;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async updateCoalesced(id, patch) {
      try {
        await db
          .update(table)
          .set({
            title: patch.title,
            body: patch.body,
            severity: patch.severity,
            category: patch.category,
            sourceType: patch.sourceType,
            sourceId: patch.sourceId,
            sourceIntegrationId: patch.sourceIntegrationId,
            destinationPath: patch.destinationPath,
            expiresAt: patch.expiresAt,
            updatedAt: patch.updatedAt,
            readAt: patch.readAt,
          })
          .where(eq(table.id, id))
          .run();
        const updated = await load(id);
        if (!updated) throw new NotificationError("NOT_FOUND", "Notification not found");
        return updated;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async findRecentByDedup(input) {
      const found = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, input.userId),
            eq(table.dedupKey, input.dedupKey),
            sql`${table.createdAt} >= ${input.since.getTime()}`,
          ),
        )
        .orderBy(desc(table.createdAt))
        .limit(1)
        .get();
      if (!found?.id) return null;
      return toRecord({
        ...found,
        sourceId: found.sourceId ?? null,
        sourceIntegrationId: found.sourceIntegrationId ?? null,
        dedupKey: found.dedupKey ?? null,
        destinationPath: found.destinationPath ?? null,
        readAt: found.readAt ?? null,
        dismissedAt: found.dismissedAt ?? null,
        expiresAt: found.expiresAt ?? null,
      });
    },
    get: load,
    async list(input) {
      const conditions = [eq(table.userId, input.userId)];
      if (!input.includeDismissed) conditions.push(isNull(table.dismissedAt));
      if (input.cursorCreatedAt && input.cursorId) {
        conditions.push(
          or(
            lt(table.createdAt, input.cursorCreatedAt),
            and(eq(table.createdAt, input.cursorCreatedAt), lt(table.id, input.cursorId)),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(input.limit)
        .all();
      return rows.map((found) =>
        toRecord({
          ...found,
          sourceId: found.sourceId ?? null,
          sourceIntegrationId: found.sourceIntegrationId ?? null,
          dedupKey: found.dedupKey ?? null,
          destinationPath: found.destinationPath ?? null,
          readAt: found.readAt ?? null,
          dismissedAt: found.dismissedAt ?? null,
          expiresAt: found.expiresAt ?? null,
        }),
      );
    },
    async countUnread(userId) {
      const row = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(and(eq(table.userId, userId), isNull(table.readAt), isNull(table.dismissedAt)))
        .get();
      return Number(row?.count ?? 0);
    },
    async markRead(id, userId, at) {
      await db
        .update(table)
        .set({ readAt: at, updatedAt: at })
        .where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.dismissedAt)))
        .run();
      const updated = await load(id);
      if (!updated || updated.userId !== userId) return null;
      return updated;
    },
    async markAllRead(userId, at) {
      const before = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(and(eq(table.userId, userId), isNull(table.readAt), isNull(table.dismissedAt)))
        .get();
      const count = Number(before?.count ?? 0);
      if (count === 0) return 0;
      await db
        .update(table)
        .set({ readAt: at, updatedAt: at })
        .where(and(eq(table.userId, userId), isNull(table.readAt), isNull(table.dismissedAt)))
        .run();
      return count;
    },
    async dismiss(id, userId, at) {
      await db
        .update(table)
        .set({ dismissedAt: at, readAt: at, updatedAt: at })
        .where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.dismissedAt)))
        .run();
      const updated = await load(id);
      if (!updated || updated.userId !== userId || !updated.dismissedAt) return null;
      return updated;
    },
    async countForUser(userId) {
      const row = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(eq(table.userId, userId))
        .get();
      return Number(row?.count ?? 0);
    },
    async deleteOldestBeyondCap(userId, keep) {
      const keepRows = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(keep)
        .all();
      const keepIds = new Set(keepRows.map((row) => row.id));
      const all = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.userId, userId))
        .all();
      let deleted = 0;
      for (const row of all) {
        if (keepIds.has(row.id)) continue;
        await db.delete(table).where(eq(table.id, row.id)).run();
        deleted += 1;
      }
      return deleted;
    },
    async purgeExpired(now, cutoffs) {
      const expiredByAt = and(isNotNull(table.expiresAt), lt(table.expiresAt, now));
      const readOrDismissedOld = and(
        or(isNotNull(table.readAt), isNotNull(table.dismissedAt)),
        lt(table.updatedAt, cutoffs.readOrDismissed),
      );
      const unreadOld = and(
        isNull(table.readAt),
        isNull(table.dismissedAt),
        lt(table.createdAt, cutoffs.unread),
      );
      const before = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .get();
      await db
        .delete(table)
        .where(or(expiredByAt, readOrDismissedOld, unreadOld))
        .run();
      const after = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .get();
      return Math.max(0, Number(before?.count ?? 0) - Number(after?.count ?? 0));
    },
  };
}

export function createPostgresqlNotificationStore(client: PostgresqlClient): NotificationStorePort {
  const { db } = client;
  const table = postgresqlSchema.notifications;

  async function load(id: string): Promise<NotificationRecord | null> {
    const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
    const found = rows[0];
    if (!found?.id) return null;
    return toRecord({
      ...found,
      sourceId: found.sourceId ?? null,
      sourceIntegrationId: found.sourceIntegrationId ?? null,
      dedupKey: found.dedupKey ?? null,
      destinationPath: found.destinationPath ?? null,
      readAt: found.readAt ?? null,
      dismissedAt: found.dismissedAt ?? null,
      expiresAt: found.expiresAt ?? null,
    });
  }

  return {
    async create(input: NotificationCreateInput & { now: Date }) {
      try {
        const id = randomUUID();
        await db.insert(table).values({
          id,
          userId: input.userId,
          category: input.category,
          severity: input.severity,
          title: input.title,
          body: input.body,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          sourceIntegrationId: input.sourceIntegrationId ?? null,
          dedupKey: input.dedupKey ?? null,
          destinationPath: input.destinationPath ?? null,
          expiresAt: input.expiresAt ?? null,
          createdAt: input.now,
          updatedAt: input.now,
        });
        const created = await load(id);
        if (!created) throw new NotificationError("NOT_FOUND", "Notification not found");
        return created;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async updateCoalesced(id, patch) {
      try {
        await db
          .update(table)
          .set({
            title: patch.title,
            body: patch.body,
            severity: patch.severity,
            category: patch.category,
            sourceType: patch.sourceType,
            sourceId: patch.sourceId,
            sourceIntegrationId: patch.sourceIntegrationId,
            destinationPath: patch.destinationPath,
            expiresAt: patch.expiresAt,
            updatedAt: patch.updatedAt,
            readAt: patch.readAt,
          })
          .where(eq(table.id, id));
        const updated = await load(id);
        if (!updated) throw new NotificationError("NOT_FOUND", "Notification not found");
        return updated;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async findRecentByDedup(input) {
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, input.userId),
            eq(table.dedupKey, input.dedupKey),
            sql`${table.createdAt} >= ${input.since}`,
          ),
        )
        .orderBy(desc(table.createdAt))
        .limit(1);
      const found = rows[0];
      if (!found?.id) return null;
      return toRecord({
        ...found,
        sourceId: found.sourceId ?? null,
        sourceIntegrationId: found.sourceIntegrationId ?? null,
        dedupKey: found.dedupKey ?? null,
        destinationPath: found.destinationPath ?? null,
        readAt: found.readAt ?? null,
        dismissedAt: found.dismissedAt ?? null,
        expiresAt: found.expiresAt ?? null,
      });
    },
    get: load,
    async list(input) {
      const conditions = [eq(table.userId, input.userId)];
      if (!input.includeDismissed) conditions.push(isNull(table.dismissedAt));
      if (input.cursorCreatedAt && input.cursorId) {
        conditions.push(
          or(
            lt(table.createdAt, input.cursorCreatedAt),
            and(eq(table.createdAt, input.cursorCreatedAt), lt(table.id, input.cursorId)),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(input.limit);
      return rows.map((found) =>
        toRecord({
          ...found,
          sourceId: found.sourceId ?? null,
          sourceIntegrationId: found.sourceIntegrationId ?? null,
          dedupKey: found.dedupKey ?? null,
          destinationPath: found.destinationPath ?? null,
          readAt: found.readAt ?? null,
          dismissedAt: found.dismissedAt ?? null,
          expiresAt: found.expiresAt ?? null,
        }),
      );
    },
    async countUnread(userId) {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(and(eq(table.userId, userId), isNull(table.readAt), isNull(table.dismissedAt)));
      return Number(rows[0]?.count ?? 0);
    },
    async markRead(id, userId, at) {
      await db
        .update(table)
        .set({ readAt: at, updatedAt: at })
        .where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.dismissedAt)));
      const updated = await load(id);
      if (!updated || updated.userId !== userId) return null;
      return updated;
    },
    async markAllRead(userId, at) {
      const rows = await db
        .update(table)
        .set({ readAt: at, updatedAt: at })
        .where(and(eq(table.userId, userId), isNull(table.readAt), isNull(table.dismissedAt)))
        .returning({ id: table.id });
      return rows.length;
    },
    async dismiss(id, userId, at) {
      await db
        .update(table)
        .set({ dismissedAt: at, readAt: at, updatedAt: at })
        .where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.dismissedAt)));
      const updated = await load(id);
      if (!updated || updated.userId !== userId || !updated.dismissedAt) return null;
      return updated;
    },
    async countForUser(userId) {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.userId, userId));
      return Number(rows[0]?.count ?? 0);
    },
    async deleteOldestBeyondCap(userId, keep) {
      const keepRows = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(keep);
      const keepIds = keepRows.map((row) => row.id);
      if (keepIds.length === 0) return 0;
      const deleted = await db
        .delete(table)
        .where(and(eq(table.userId, userId), notInArray(table.id, keepIds)))
        .returning({ id: table.id });
      return deleted.length;
    },
    async purgeExpired(now, cutoffs) {
      const deleted = await db
        .delete(table)
        .where(
          or(
            and(isNotNull(table.expiresAt), lt(table.expiresAt, now)),
            and(
              or(isNotNull(table.readAt), isNotNull(table.dismissedAt)),
              lt(table.updatedAt, cutoffs.readOrDismissed),
            ),
            and(
              isNull(table.readAt),
              isNull(table.dismissedAt),
              lt(table.createdAt, cutoffs.unread),
            ),
          ),
        )
        .returning({ id: table.id });
      return deleted.length;
    },
  };
}
