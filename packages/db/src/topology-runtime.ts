import { eq, inArray, or } from "drizzle-orm";
import type { ServiceDependency, TopologyStorePort } from "@dashboard/topology";
import * as sqliteSchema from "./schema/sqlite";
import * as pgSchema from "./schema/postgresql";
import type { SqliteClient } from "./client/sqlite";
import type { PostgresqlClient } from "./client/postgresql";

function mapRow(row: {
  id: string;
  upstreamServiceKey: string;
  downstreamServiceKey: string;
  relationship: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ServiceDependency {
  return {
    id: row.id,
    upstreamServiceKey: row.upstreamServiceKey,
    downstreamServiceKey: row.downstreamServiceKey,
    relationship: row.relationship as ServiceDependency["relationship"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSqliteTopologyStore(client: SqliteClient): TopologyStorePort {
  const db = client.db;
  return {
    async integrationExists(serviceKey) {
      const rows = await db
        .select({ id: sqliteSchema.integrations.id })
        .from(sqliteSchema.integrations)
        .where(eq(sqliteSchema.integrations.id, serviceKey))
        .limit(1);
      return rows.length > 0;
    },
    async listDependencies(input) {
      const limit = input?.limit ?? 500;
      const keys = input?.serviceKeys;
      if (keys && keys.length > 0) {
        const rows = await db
          .select()
          .from(sqliteSchema.serviceDependencies)
          .where(
            or(
              inArray(sqliteSchema.serviceDependencies.upstreamServiceKey, [...keys]),
              inArray(sqliteSchema.serviceDependencies.downstreamServiceKey, [...keys]),
            ),
          )
          .limit(limit);
        return rows.map(mapRow);
      }
      const rows = await db.select().from(sqliteSchema.serviceDependencies).limit(limit);
      return rows.map(mapRow);
    },
    async getDependency(id) {
      const rows = await db
        .select()
        .from(sqliteSchema.serviceDependencies)
        .where(eq(sqliteSchema.serviceDependencies.id, id))
        .limit(1);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async createDependency(input) {
      await db.insert(sqliteSchema.serviceDependencies).values({
        id: input.id,
        upstreamServiceKey: input.upstreamServiceKey,
        downstreamServiceKey: input.downstreamServiceKey,
        relationship: input.relationship,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      });
      const rows = await db
        .select()
        .from(sqliteSchema.serviceDependencies)
        .where(eq(sqliteSchema.serviceDependencies.id, input.id))
        .limit(1);
      const created = rows[0];
      if (!created) throw new Error("Failed to create dependency");
      return mapRow(created);
    },
    async deleteDependency(id) {
      await db
        .delete(sqliteSchema.serviceDependencies)
        .where(eq(sqliteSchema.serviceDependencies.id, id));
    },
  };
}

export function createPostgresqlTopologyStore(client: PostgresqlClient): TopologyStorePort {
  const db = client.db;
  return {
    async integrationExists(serviceKey) {
      const rows = await db
        .select({ id: pgSchema.integrations.id })
        .from(pgSchema.integrations)
        .where(eq(pgSchema.integrations.id, serviceKey))
        .limit(1);
      return rows.length > 0;
    },
    async listDependencies(input) {
      const limit = input?.limit ?? 500;
      const keys = input?.serviceKeys;
      if (keys && keys.length > 0) {
        const rows = await db
          .select()
          .from(pgSchema.serviceDependencies)
          .where(
            or(
              inArray(pgSchema.serviceDependencies.upstreamServiceKey, [...keys]),
              inArray(pgSchema.serviceDependencies.downstreamServiceKey, [...keys]),
            ),
          )
          .limit(limit);
        return rows.map(mapRow);
      }
      const rows = await db.select().from(pgSchema.serviceDependencies).limit(limit);
      return rows.map(mapRow);
    },
    async getDependency(id) {
      const rows = await db
        .select()
        .from(pgSchema.serviceDependencies)
        .where(eq(pgSchema.serviceDependencies.id, id))
        .limit(1);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async createDependency(input) {
      await db.insert(pgSchema.serviceDependencies).values({
        id: input.id,
        upstreamServiceKey: input.upstreamServiceKey,
        downstreamServiceKey: input.downstreamServiceKey,
        relationship: input.relationship,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      });
      const rows = await db
        .select()
        .from(pgSchema.serviceDependencies)
        .where(eq(pgSchema.serviceDependencies.id, input.id))
        .limit(1);
      const created = rows[0];
      if (!created) throw new Error("Failed to create dependency");
      return mapRow(created);
    },
    async deleteDependency(id) {
      await db.delete(pgSchema.serviceDependencies).where(eq(pgSchema.serviceDependencies.id, id));
    },
  };
}
