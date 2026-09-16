import { and, eq, isNull } from "drizzle-orm";
import {
  NotificationError,
  type PushEncryptedField,
  type PushSubscriptionRecord,
  type PushSubscriptionStorePort,
} from "@dashboard/notifications";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

function toEncrypted(field: {
  ciphertext: string;
  iv: string;
  authTag: string;
}): PushEncryptedField {
  return {
    ciphertext: field.ciphertext,
    iv: field.iv,
    authTag: field.authTag,
  };
}

function toRecord(row: {
  id: string;
  userId: string;
  endpointHash: string;
  endpointCiphertext: string;
  endpointIv: string;
  endpointAuthTag: string;
  p256dhCiphertext: string;
  p256dhIv: string;
  p256dhAuthTag: string;
  authCiphertext: string;
  authIv: string;
  authAuthTag: string;
  keyVersion: number;
  userAgent: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    endpointHash: row.endpointHash,
    endpoint: toEncrypted({
      ciphertext: row.endpointCiphertext,
      iv: row.endpointIv,
      authTag: row.endpointAuthTag,
    }),
    p256dh: toEncrypted({
      ciphertext: row.p256dhCiphertext,
      iv: row.p256dhIv,
      authTag: row.p256dhAuthTag,
    }),
    auth: toEncrypted({
      ciphertext: row.authCiphertext,
      iv: row.authIv,
      authTag: row.authAuthTag,
    }),
    keyVersion: row.keyVersion,
    userAgent: row.userAgent,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRow(found: {
  id: string;
  userId: string;
  endpointHash: string;
  endpointCiphertext: string;
  endpointIv: string;
  endpointAuthTag: string;
  p256dhCiphertext: string;
  p256dhIv: string;
  p256dhAuthTag: string;
  authCiphertext: string;
  authIv: string;
  authAuthTag: string;
  keyVersion: number;
  userAgent: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PushSubscriptionRecord {
  return toRecord({
    ...found,
    userAgent: found.userAgent ?? null,
    disabledAt: found.disabledAt ?? null,
  });
}

export function createSqlitePushSubscriptionStore(client: SqliteClient): PushSubscriptionStorePort {
  const { db } = client;
  const table = sqliteSchema.pushSubscriptions;

  async function load(id: string): Promise<PushSubscriptionRecord | null> {
    const found = await db.select().from(table).where(eq(table.id, id)).get();
    if (!found?.id) return null;
    return mapRow(found);
  }

  return {
    async findByUserAndEndpointHash(userId, endpointHash) {
      try {
        const found = await db
          .select()
          .from(table)
          .where(and(eq(table.userId, userId), eq(table.endpointHash, endpointHash)))
          .get();
        if (!found?.id) return null;
        return mapRow(found);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async countActiveForUser(userId) {
      try {
        const rows = await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.userId, userId), isNull(table.disabledAt)))
          .all();
        return rows.length;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listActiveForUser(userId) {
      try {
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(table.userId, userId), isNull(table.disabledAt)))
          .all();
        return rows.map(mapRow);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async get(id) {
      try {
        return await load(id);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async insert(input) {
      try {
        await db
          .insert(table)
          .values({
            id: input.id,
            userId: input.userId,
            endpointHash: input.endpointHash,
            endpointCiphertext: input.endpoint.ciphertext,
            endpointIv: input.endpoint.iv,
            endpointAuthTag: input.endpoint.authTag,
            p256dhCiphertext: input.p256dh.ciphertext,
            p256dhIv: input.p256dh.iv,
            p256dhAuthTag: input.p256dh.authTag,
            authCiphertext: input.auth.ciphertext,
            authIv: input.auth.iv,
            authAuthTag: input.auth.authTag,
            keyVersion: input.keyVersion,
            userAgent: input.userAgent,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run();
        const created = await load(input.id);
        if (!created) throw new NotificationError("NOT_FOUND", "Push subscription not found");
        return created;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async updateEncrypted(id, patch) {
      try {
        await db
          .update(table)
          .set({
            endpointCiphertext: patch.endpoint.ciphertext,
            endpointIv: patch.endpoint.iv,
            endpointAuthTag: patch.endpoint.authTag,
            p256dhCiphertext: patch.p256dh.ciphertext,
            p256dhIv: patch.p256dh.iv,
            p256dhAuthTag: patch.p256dh.authTag,
            authCiphertext: patch.auth.ciphertext,
            authIv: patch.auth.iv,
            authAuthTag: patch.auth.authTag,
            keyVersion: patch.keyVersion,
            userAgent: patch.userAgent,
            disabledAt: patch.disabledAt,
            updatedAt: patch.updatedAt,
          })
          .where(eq(table.id, id))
          .run();
        const updated = await load(id);
        if (!updated) throw new NotificationError("NOT_FOUND", "Push subscription not found");
        return updated;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async disable(id, at) {
      try {
        await db.update(table).set({ disabledAt: at, updatedAt: at }).where(eq(table.id, id)).run();
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async deleteForUser(id, userId) {
      try {
        const existing = await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, id), eq(table.userId, userId)))
          .get();
        if (!existing?.id) return false;
        await db
          .delete(table)
          .where(and(eq(table.id, id), eq(table.userId, userId)))
          .run();
        return true;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
  };
}

export function createPostgresqlPushSubscriptionStore(
  client: PostgresqlClient,
): PushSubscriptionStorePort {
  const { db } = client;
  const table = postgresqlSchema.pushSubscriptions;

  async function load(id: string): Promise<PushSubscriptionRecord | null> {
    const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
    const found = rows[0];
    if (!found?.id) return null;
    return mapRow(found);
  }

  return {
    async findByUserAndEndpointHash(userId, endpointHash) {
      try {
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(table.userId, userId), eq(table.endpointHash, endpointHash)))
          .limit(1);
        const found = rows[0];
        if (!found?.id) return null;
        return mapRow(found);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async countActiveForUser(userId) {
      try {
        const rows = await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.userId, userId), isNull(table.disabledAt)));
        return rows.length;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async listActiveForUser(userId) {
      try {
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(table.userId, userId), isNull(table.disabledAt)));
        return rows.map(mapRow);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async get(id) {
      try {
        return await load(id);
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async insert(input) {
      try {
        await db.insert(table).values({
          id: input.id,
          userId: input.userId,
          endpointHash: input.endpointHash,
          endpointCiphertext: input.endpoint.ciphertext,
          endpointIv: input.endpoint.iv,
          endpointAuthTag: input.endpoint.authTag,
          p256dhCiphertext: input.p256dh.ciphertext,
          p256dhIv: input.p256dh.iv,
          p256dhAuthTag: input.p256dh.authTag,
          authCiphertext: input.auth.ciphertext,
          authIv: input.auth.iv,
          authAuthTag: input.auth.authTag,
          keyVersion: input.keyVersion,
          userAgent: input.userAgent,
          createdAt: input.now,
          updatedAt: input.now,
        });
        const created = await load(input.id);
        if (!created) throw new NotificationError("NOT_FOUND", "Push subscription not found");
        return created;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async updateEncrypted(id, patch) {
      try {
        await db
          .update(table)
          .set({
            endpointCiphertext: patch.endpoint.ciphertext,
            endpointIv: patch.endpoint.iv,
            endpointAuthTag: patch.endpoint.authTag,
            p256dhCiphertext: patch.p256dh.ciphertext,
            p256dhIv: patch.p256dh.iv,
            p256dhAuthTag: patch.p256dh.authTag,
            authCiphertext: patch.auth.ciphertext,
            authIv: patch.auth.iv,
            authAuthTag: patch.auth.authTag,
            keyVersion: patch.keyVersion,
            userAgent: patch.userAgent,
            disabledAt: patch.disabledAt,
            updatedAt: patch.updatedAt,
          })
          .where(eq(table.id, id));
        const updated = await load(id);
        if (!updated) throw new NotificationError("NOT_FOUND", "Push subscription not found");
        return updated;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async disable(id, at) {
      try {
        await db.update(table).set({ disabledAt: at, updatedAt: at }).where(eq(table.id, id));
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
    async deleteForUser(id, userId) {
      try {
        const rows = await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, id), eq(table.userId, userId)))
          .limit(1);
        if (!rows[0]?.id) return false;
        await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId)));
        return true;
      } catch (error) {
        throw normalizeDatabaseError(error);
      }
    },
  };
}
