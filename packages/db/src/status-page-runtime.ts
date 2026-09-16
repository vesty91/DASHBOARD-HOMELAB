import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  StatusPageError,
  type IntegrationHealthStatus,
  type IntegrationStatusLookup,
  type StatusPageRecord,
  type StatusPageServiceRecord,
  type StatusPageSnapshot,
  type StatusPageStorePort,
  type StatusPageVisibility,
} from "@dashboard/status-pages";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

function toPage(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  enabled: boolean;
  createdBy: string | null;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
}): StatusPageRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    visibility: row.visibility as StatusPageVisibility,
    enabled: row.enabled,
    createdBy: row.createdBy,
    configRevision: row.configRevision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toService(row: {
  id: string;
  statusPageId: string;
  sourceIntegrationId: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  showIncidentHistory: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StatusPageServiceRecord {
  return {
    id: row.id,
    statusPageId: row.statusPageId,
    sourceIntegrationId: row.sourceIntegrationId,
    displayName: row.displayName,
    description: row.description,
    sortOrder: row.sortOrder,
    showIncidentHistory: row.showIncidentHistory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function createStatusPageStore(adapters: {
  listPages(): Promise<StatusPageRecord[]>;
  findPageById(id: string): Promise<StatusPageRecord | null>;
  findPageBySlug(slug: string): Promise<StatusPageRecord | null>;
  listServices(statusPageId: string): Promise<StatusPageServiceRecord[]>;
  insertPage(input: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    visibility: StatusPageVisibility;
    enabled: boolean;
    createdBy: string | null;
    now: Date;
  }): Promise<void>;
  updatePageRow(input: {
    id: string;
    expectedConfigRevision: number;
    name: string;
    slug: string;
    description: string | null;
    visibility: StatusPageVisibility;
    enabled: boolean;
    now: Date;
  }): Promise<boolean>;
  deletePageRow(id: string, expectedConfigRevision: number): Promise<boolean>;
  replaceServiceRows(input: {
    statusPageId: string;
    expectedConfigRevision: number;
    services: readonly {
      id: string;
      sourceIntegrationId: string;
      displayName: string;
      description: string | null;
      sortOrder: number;
      showIncidentHistory: boolean;
    }[];
    now: Date;
  }): Promise<boolean>;
  listOpenAvailabilityIncidentIntegrationIds(integrationIds: readonly string[]): Promise<string[]>;
  listActiveMaintenanceIntegrationIds(integrationIds: readonly string[]): Promise<string[]>;
  findIntegrationStatuses(integrationIds: readonly string[]): Promise<IntegrationStatusLookup[]>;
}): StatusPageStorePort {
  async function snapshotFromPage(
    page: StatusPageRecord | null,
  ): Promise<StatusPageSnapshot | null> {
    if (!page) return null;
    return { page, services: await adapters.listServices(page.id) };
  }

  return {
    listPages: () => adapters.listPages(),
    findPageById: (id) => adapters.findPageById(id),
    findPageBySlug: (slug) => adapters.findPageBySlug(slug),
    async findSnapshotById(id) {
      return snapshotFromPage(await adapters.findPageById(id));
    },
    async findSnapshotBySlug(slug) {
      return snapshotFromPage(await adapters.findPageBySlug(slug));
    },
    async createPage(input) {
      try {
        const id = randomUUID();
        await adapters.insertPage({ ...input, id });
        const created = await adapters.findPageById(id);
        if (!created) throw new StatusPageError("NOT_FOUND", "Status page not found");
        return created;
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        const normalized = normalizeDatabaseError(error);
        if (normalized.code === "UNIQUE_CONSTRAINT") {
          throw new StatusPageError("CONFLICT", "Status page slug already exists");
        }
        throw normalized;
      }
    },
    async updatePage(input) {
      try {
        const ok = await adapters.updatePageRow(input);
        if (!ok) {
          const existing = await adapters.findPageById(input.id);
          if (!existing) throw new StatusPageError("NOT_FOUND", "Status page not found");
          throw new StatusPageError("CONFLICT", "Status page revision conflict");
        }
        const updated = await adapters.findPageById(input.id);
        if (!updated) throw new StatusPageError("NOT_FOUND", "Status page not found");
        return updated;
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        const normalized = normalizeDatabaseError(error);
        if (normalized.code === "UNIQUE_CONSTRAINT") {
          throw new StatusPageError("CONFLICT", "Status page slug already exists");
        }
        throw normalized;
      }
    },
    async deletePage(id, expectedConfigRevision) {
      try {
        const ok = await adapters.deletePageRow(id, expectedConfigRevision);
        if (!ok) {
          const existing = await adapters.findPageById(id);
          if (!existing) throw new StatusPageError("NOT_FOUND", "Status page not found");
          throw new StatusPageError("CONFLICT", "Status page revision conflict");
        }
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        throw normalizeDatabaseError(error);
      }
    },
    async replaceServices(input) {
      try {
        const rows = input.services.map((service) => ({ ...service, id: randomUUID() }));
        const ok = await adapters.replaceServiceRows({ ...input, services: rows });
        if (!ok) {
          const existing = await adapters.findPageById(input.statusPageId);
          if (!existing) throw new StatusPageError("NOT_FOUND", "Status page not found");
          throw new StatusPageError("CONFLICT", "Status page revision conflict");
        }
        const snapshot = await snapshotFromPage(await adapters.findPageById(input.statusPageId));
        if (!snapshot) throw new StatusPageError("NOT_FOUND", "Status page not found");
        return snapshot;
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        throw normalizeDatabaseError(error);
      }
    },
    async listOpenAvailabilityIncidentIntegrationIds(integrationIds) {
      if (integrationIds.length === 0) return new Set();
      return new Set(await adapters.listOpenAvailabilityIncidentIntegrationIds(integrationIds));
    },
    async listActiveMaintenanceIntegrationIds(integrationIds) {
      if (integrationIds.length === 0) return new Set();
      return new Set(await adapters.listActiveMaintenanceIntegrationIds(integrationIds));
    },
    async findIntegrationStatuses(integrationIds) {
      const map = new Map<string, IntegrationStatusLookup>();
      if (integrationIds.length === 0) return map;
      for (const row of await adapters.findIntegrationStatuses(integrationIds)) {
        map.set(row.id, row);
      }
      return map;
    },
  };
}

export function createSqliteStatusPageStore(client: SqliteClient): StatusPageStorePort {
  const { db } = client;
  const pages = sqliteSchema.statusPages;
  const services = sqliteSchema.statusPageServices;
  const incidents = sqliteSchema.incidents;
  const maintenance = sqliteSchema.maintenanceWindows;
  const targets = sqliteSchema.maintenanceWindowTargets;
  const integrations = sqliteSchema.integrations;

  async function findPageById(id: string) {
    const found = await db.select().from(pages).where(eq(pages.id, id)).get();
    if (!found?.id) return null;
    return toPage({
      ...found,
      description: found.description ?? null,
      createdBy: found.createdBy ?? null,
    });
  }

  async function findPageBySlug(slug: string) {
    const found = await db.select().from(pages).where(eq(pages.slug, slug)).get();
    if (!found?.id) return null;
    return toPage({
      ...found,
      description: found.description ?? null,
      createdBy: found.createdBy ?? null,
    });
  }

  async function listServices(statusPageId: string) {
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.statusPageId, statusPageId))
      .orderBy(asc(services.sortOrder), asc(services.displayName))
      .all();
    return rows.map((row) => toService({ ...row, description: row.description ?? null }));
  }

  return createStatusPageStore({
    async listPages() {
      const rows = await db.select().from(pages).orderBy(asc(pages.name)).all();
      return rows.map((row) =>
        toPage({ ...row, description: row.description ?? null, createdBy: row.createdBy ?? null }),
      );
    },
    findPageById,
    findPageBySlug,
    listServices,
    async insertPage(input) {
      await db
        .insert(pages)
        .values({
          id: input.id,
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
          enabled: input.enabled,
          createdBy: input.createdBy,
          configRevision: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
    },
    async updatePageRow(input) {
      const result = client.sqlite
        .prepare(
          `UPDATE status_pages
           SET name = ?, slug = ?, description = ?, visibility = ?, enabled = ?,
               config_revision = config_revision + 1, updated_at = ?
           WHERE id = ? AND config_revision = ?`,
        )
        .run(
          input.name,
          input.slug,
          input.description,
          input.visibility,
          input.enabled ? 1 : 0,
          input.now.getTime(),
          input.id,
          input.expectedConfigRevision,
        );
      return Number(result.changes) === 1;
    },
    async deletePageRow(id, expectedConfigRevision) {
      const result = client.sqlite
        .prepare("DELETE FROM status_pages WHERE id = ? AND config_revision = ?")
        .run(id, expectedConfigRevision);
      return Number(result.changes) === 1;
    },
    async replaceServiceRows(input) {
      client.sqlite.exec("BEGIN");
      try {
        const updated = client.sqlite
          .prepare(
            `UPDATE status_pages
             SET config_revision = config_revision + 1, updated_at = ?
             WHERE id = ? AND config_revision = ?`,
          )
          .run(input.now.getTime(), input.statusPageId, input.expectedConfigRevision);
        if (Number(updated.changes) !== 1) {
          client.sqlite.exec("ROLLBACK");
          return false;
        }
        client.sqlite
          .prepare("DELETE FROM status_page_services WHERE status_page_id = ?")
          .run(input.statusPageId);
        const insert = client.sqlite.prepare(
          `INSERT INTO status_page_services(
             id, status_page_id, source_integration_id, display_name, description,
             sort_order, show_incident_history, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const service of input.services) {
          insert.run(
            service.id,
            input.statusPageId,
            service.sourceIntegrationId,
            service.displayName,
            service.description,
            service.sortOrder,
            service.showIncidentHistory ? 1 : 0,
            input.now.getTime(),
            input.now.getTime(),
          );
        }
        client.sqlite.exec("COMMIT");
        return true;
      } catch (error) {
        try {
          client.sqlite.exec("ROLLBACK");
        } catch (rollbackError) {
          void rollbackError;
        }
        throw error;
      }
    },
    async listOpenAvailabilityIncidentIntegrationIds(integrationIds) {
      const rows = await db
        .select({ integrationId: incidents.integrationId })
        .from(incidents)
        .where(
          and(
            eq(incidents.status, "open"),
            eq(incidents.kind, "availability"),
            inArray(incidents.integrationId, [...integrationIds]),
          ),
        )
        .all();
      return rows.map((row) => row.integrationId);
    },
    async listActiveMaintenanceIntegrationIds(integrationIds) {
      const rows = await db
        .select({ integrationId: targets.integrationId })
        .from(targets)
        .innerJoin(maintenance, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            eq(maintenance.status, "active"),
            inArray(targets.integrationId, [...integrationIds]),
          ),
        )
        .all();
      return rows.map((row) => row.integrationId);
    },
    async findIntegrationStatuses(integrationIds) {
      const rows = await db
        .select({
          id: integrations.id,
          status: integrations.status,
          baseUrl: integrations.baseUrl,
        })
        .from(integrations)
        .where(inArray(integrations.id, [...integrationIds]))
        .all();
      return rows.map((row) => ({
        id: row.id,
        status: row.status as IntegrationHealthStatus,
        baseUrl: row.baseUrl,
      }));
    },
  });
}

export function createPostgresqlStatusPageStore(client: PostgresqlClient): StatusPageStorePort {
  const { db } = client;
  const pages = postgresqlSchema.statusPages;
  const services = postgresqlSchema.statusPageServices;
  const incidents = postgresqlSchema.incidents;
  const maintenance = postgresqlSchema.maintenanceWindows;
  const targets = postgresqlSchema.maintenanceWindowTargets;
  const integrations = postgresqlSchema.integrations;

  async function findPageById(id: string) {
    const [found] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
    if (!found?.id) return null;
    return toPage({
      ...found,
      description: found.description ?? null,
      createdBy: found.createdBy ?? null,
    });
  }

  async function findPageBySlug(slug: string) {
    const [found] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
    if (!found?.id) return null;
    return toPage({
      ...found,
      description: found.description ?? null,
      createdBy: found.createdBy ?? null,
    });
  }

  async function listServices(statusPageId: string) {
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.statusPageId, statusPageId))
      .orderBy(asc(services.sortOrder), asc(services.displayName));
    return rows.map((row) => toService({ ...row, description: row.description ?? null }));
  }

  return createStatusPageStore({
    async listPages() {
      const rows = await db.select().from(pages).orderBy(asc(pages.name));
      return rows.map((row) =>
        toPage({ ...row, description: row.description ?? null, createdBy: row.createdBy ?? null }),
      );
    },
    findPageById,
    findPageBySlug,
    listServices,
    async insertPage(input) {
      await db.insert(pages).values({
        id: input.id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        visibility: input.visibility,
        enabled: input.enabled,
        createdBy: input.createdBy,
        configRevision: 1,
        createdAt: input.now,
        updatedAt: input.now,
      });
    },
    async updatePageRow(input) {
      const updated = await db
        .update(pages)
        .set({
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
          enabled: input.enabled,
          configRevision: sql`${pages.configRevision} + 1`,
          updatedAt: input.now,
        })
        .where(and(eq(pages.id, input.id), eq(pages.configRevision, input.expectedConfigRevision)))
        .returning({ id: pages.id });
      return updated.length === 1;
    },
    async deletePageRow(id, expectedConfigRevision) {
      const deleted = await db
        .delete(pages)
        .where(and(eq(pages.id, id), eq(pages.configRevision, expectedConfigRevision)))
        .returning({ id: pages.id });
      return deleted.length === 1;
    },
    async replaceServiceRows(input) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(pages)
          .set({
            configRevision: sql`${pages.configRevision} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(pages.id, input.statusPageId),
              eq(pages.configRevision, input.expectedConfigRevision),
            ),
          )
          .returning({ id: pages.id });
        if (updated.length !== 1) return false;
        await tx.delete(services).where(eq(services.statusPageId, input.statusPageId));
        if (input.services.length > 0) {
          await tx.insert(services).values(
            input.services.map((service) => ({
              id: service.id,
              statusPageId: input.statusPageId,
              sourceIntegrationId: service.sourceIntegrationId,
              displayName: service.displayName,
              description: service.description,
              sortOrder: service.sortOrder,
              showIncidentHistory: service.showIncidentHistory,
              createdAt: input.now,
              updatedAt: input.now,
            })),
          );
        }
        return true;
      });
    },
    async listOpenAvailabilityIncidentIntegrationIds(integrationIds) {
      const rows = await db
        .select({ integrationId: incidents.integrationId })
        .from(incidents)
        .where(
          and(
            eq(incidents.status, "open"),
            eq(incidents.kind, "availability"),
            inArray(incidents.integrationId, [...integrationIds]),
          ),
        );
      return rows.map((row) => row.integrationId);
    },
    async listActiveMaintenanceIntegrationIds(integrationIds) {
      const rows = await db
        .select({ integrationId: targets.integrationId })
        .from(targets)
        .innerJoin(maintenance, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            eq(maintenance.status, "active"),
            inArray(targets.integrationId, [...integrationIds]),
          ),
        );
      return rows.map((row) => row.integrationId);
    },
    async findIntegrationStatuses(integrationIds) {
      const rows = await db
        .select({
          id: integrations.id,
          status: integrations.status,
          baseUrl: integrations.baseUrl,
        })
        .from(integrations)
        .where(inArray(integrations.id, [...integrationIds]));
      return rows.map((row) => ({
        id: row.id,
        status: row.status as IntegrationHealthStatus,
        baseUrl: row.baseUrl,
      }));
    },
  });
}
