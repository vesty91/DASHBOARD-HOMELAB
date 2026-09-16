import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, lte, notInArray, sql } from "drizzle-orm";
import {
  StatusPageError,
  type IntegrationHealthStatus,
  type IntegrationStatusLookup,
  type MaintenanceWindowRecord,
  type MaintenanceWindowSnapshot,
  type MaintenanceWindowStatus,
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

function toMaintenanceWindow(row: {
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MaintenanceWindowRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as MaintenanceWindowStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type StatusPageStoreAdapters = {
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
  listActiveMaintenanceIntegrationIds(
    integrationIds: readonly string[],
    now: Date,
  ): Promise<string[]>;
  findIntegrationStatuses(integrationIds: readonly string[]): Promise<IntegrationStatusLookup[]>;
  listMaintenanceWindows(): Promise<MaintenanceWindowSnapshot[]>;
  findMaintenanceById(id: string): Promise<MaintenanceWindowSnapshot | null>;
  listNonTerminalMaintenanceWindows(): Promise<MaintenanceWindowSnapshot[]>;
  listPublicMaintenancesForIntegrations(
    integrationIds: readonly string[],
    now: Date,
  ): Promise<MaintenanceWindowSnapshot[]>;
  listStatusPageIdsForIntegrations(integrationIds: readonly string[]): Promise<string[]>;
  findExistingIntegrationIds(ids: readonly string[]): Promise<string[]>;
  insertMaintenanceWindow(input: {
    id: string;
    name: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    status: MaintenanceWindowStatus;
    integrationIds: readonly string[];
    createdBy: string | null;
    now: Date;
  }): Promise<void>;
  updateMaintenanceStatusRow(input: {
    id: string;
    fromStatuses: readonly MaintenanceWindowStatus[];
    toStatus: MaintenanceWindowStatus;
    now: Date;
  }): Promise<boolean>;
};

function createStatusPageStore(adapters: StatusPageStoreAdapters): StatusPageStorePort {
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
    async listActiveMaintenanceIntegrationIds(integrationIds, now) {
      if (integrationIds.length === 0) return new Set();
      return new Set(await adapters.listActiveMaintenanceIntegrationIds(integrationIds, now));
    },
    async findIntegrationStatuses(integrationIds) {
      const map = new Map<string, IntegrationStatusLookup>();
      if (integrationIds.length === 0) return map;
      for (const row of await adapters.findIntegrationStatuses(integrationIds)) {
        map.set(row.id, row);
      }
      return map;
    },
    listMaintenanceWindows: () => adapters.listMaintenanceWindows(),
    findMaintenanceById: (id) => adapters.findMaintenanceById(id),
    listNonTerminalMaintenanceWindows: () => adapters.listNonTerminalMaintenanceWindows(),
    listPublicMaintenancesForIntegrations: (integrationIds, now) =>
      adapters.listPublicMaintenancesForIntegrations(integrationIds, now),
    listStatusPageIdsForIntegrations: (integrationIds) =>
      adapters.listStatusPageIdsForIntegrations(integrationIds),
    async findExistingIntegrationIds(ids) {
      if (ids.length === 0) return new Set();
      return new Set(await adapters.findExistingIntegrationIds(ids));
    },
    async createMaintenanceWindow(input) {
      try {
        const id = randomUUID();
        await adapters.insertMaintenanceWindow({ ...input, id });
        const created = await adapters.findMaintenanceById(id);
        if (!created) throw new StatusPageError("NOT_FOUND", "Maintenance window not found");
        return created;
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        throw normalizeDatabaseError(error);
      }
    },
    async updateMaintenanceStatus(input) {
      try {
        const ok = await adapters.updateMaintenanceStatusRow(input);
        if (!ok) return null;
        return adapters.findMaintenanceById(input.id);
      } catch (error) {
        if (error instanceof StatusPageError) throw error;
        throw normalizeDatabaseError(error);
      }
    },
  };
}

function createMaintenanceHelpers(deps: {
  listTargets(maintenanceId: string): Promise<string[]>;
  listWindows(filter?: {
    statuses?: readonly MaintenanceWindowStatus[];
  }): Promise<MaintenanceWindowRecord[]>;
}): {
  hydrate(window: MaintenanceWindowRecord): Promise<MaintenanceWindowSnapshot>;
  hydrateMany(windows: MaintenanceWindowRecord[]): Promise<MaintenanceWindowSnapshot[]>;
} {
  async function hydrate(window: MaintenanceWindowRecord): Promise<MaintenanceWindowSnapshot> {
    return { window, integrationIds: await deps.listTargets(window.id) };
  }
  async function hydrateMany(
    windows: MaintenanceWindowRecord[],
  ): Promise<MaintenanceWindowSnapshot[]> {
    const result: MaintenanceWindowSnapshot[] = [];
    for (const window of windows) result.push(await hydrate(window));
    return result;
  }
  return { hydrate, hydrateMany };
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

  async function listTargets(maintenanceId: string): Promise<string[]> {
    const rows = await db
      .select({ integrationId: targets.integrationId })
      .from(targets)
      .where(eq(targets.maintenanceId, maintenanceId))
      .all();
    return rows.map((row) => row.integrationId);
  }

  async function listWindowRows(filter?: {
    statuses?: readonly MaintenanceWindowStatus[];
  }): Promise<MaintenanceWindowRecord[]> {
    const rows = filter?.statuses
      ? await db
          .select()
          .from(maintenance)
          .where(inArray(maintenance.status, [...filter.statuses]))
          .orderBy(asc(maintenance.startsAt))
          .all()
      : await db.select().from(maintenance).orderBy(asc(maintenance.startsAt)).all();
    return rows.map((row) =>
      toMaintenanceWindow({
        ...row,
        description: row.description ?? null,
        createdBy: row.createdBy ?? null,
      }),
    );
  }

  const helpers = createMaintenanceHelpers({ listTargets, listWindows: listWindowRows });

  async function findMaintenanceById(id: string): Promise<MaintenanceWindowSnapshot | null> {
    const found = await db.select().from(maintenance).where(eq(maintenance.id, id)).get();
    if (!found?.id) return null;
    return helpers.hydrate(
      toMaintenanceWindow({
        ...found,
        description: found.description ?? null,
        createdBy: found.createdBy ?? null,
      }),
    );
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
    async listActiveMaintenanceIntegrationIds(integrationIds, now) {
      // Clock-derived active window: not cancelled/completed, startsAt <= now < endsAt.
      // Stored status alone is never trusted for display.
      const rows = await db
        .select({ integrationId: targets.integrationId })
        .from(targets)
        .innerJoin(maintenance, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            notInArray(maintenance.status, ["cancelled", "completed"]),
            lte(maintenance.startsAt, now),
            gt(maintenance.endsAt, now),
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
    async listMaintenanceWindows() {
      return helpers.hydrateMany(await listWindowRows());
    },
    findMaintenanceById,
    async listNonTerminalMaintenanceWindows() {
      return helpers.hydrateMany(await listWindowRows({ statuses: ["scheduled", "active"] }));
    },
    async listPublicMaintenancesForIntegrations(integrationIds, now) {
      if (integrationIds.length === 0) return [];
      const rows = await db
        .select({
          id: maintenance.id,
          name: maintenance.name,
          description: maintenance.description,
          startsAt: maintenance.startsAt,
          endsAt: maintenance.endsAt,
          status: maintenance.status,
          createdBy: maintenance.createdBy,
          createdAt: maintenance.createdAt,
          updatedAt: maintenance.updatedAt,
        })
        .from(maintenance)
        .innerJoin(targets, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            notInArray(maintenance.status, ["cancelled", "completed"]),
            gt(maintenance.endsAt, now),
            inArray(targets.integrationId, [...integrationIds]),
          ),
        )
        .orderBy(asc(maintenance.startsAt))
        .all();
      const unique = new Map<string, MaintenanceWindowRecord>();
      for (const row of rows) {
        if (unique.has(row.id)) continue;
        unique.set(
          row.id,
          toMaintenanceWindow({
            ...row,
            description: row.description ?? null,
            createdBy: row.createdBy ?? null,
          }),
        );
      }
      return helpers.hydrateMany([...unique.values()]);
    },
    async listStatusPageIdsForIntegrations(integrationIds) {
      if (integrationIds.length === 0) return [];
      const rows = await db
        .select({ statusPageId: services.statusPageId })
        .from(services)
        .where(inArray(services.sourceIntegrationId, [...integrationIds]))
        .all();
      return [...new Set(rows.map((row) => row.statusPageId))];
    },
    async findExistingIntegrationIds(ids) {
      const rows = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(inArray(integrations.id, [...ids]))
        .all();
      return rows.map((row) => row.id);
    },
    async insertMaintenanceWindow(input) {
      client.sqlite.exec("BEGIN");
      try {
        client.sqlite
          .prepare(
            `INSERT INTO maintenance_windows(
               id, name, description, starts_at, ends_at, status, created_by, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.id,
            input.name,
            input.description,
            input.startsAt.getTime(),
            input.endsAt.getTime(),
            input.status,
            input.createdBy,
            input.now.getTime(),
            input.now.getTime(),
          );
        const insertTarget = client.sqlite.prepare(
          "INSERT INTO maintenance_window_targets(maintenance_id, integration_id) VALUES (?, ?)",
        );
        for (const integrationId of input.integrationIds) {
          insertTarget.run(input.id, integrationId);
        }
        client.sqlite.exec("COMMIT");
      } catch (error) {
        try {
          client.sqlite.exec("ROLLBACK");
        } catch (rollbackError) {
          void rollbackError;
        }
        throw error;
      }
    },
    async updateMaintenanceStatusRow(input) {
      if (input.fromStatuses.length === 0) return false;
      const placeholders = input.fromStatuses.map(() => "?").join(", ");
      const result = client.sqlite
        .prepare(
          `UPDATE maintenance_windows
           SET status = ?, updated_at = ?
           WHERE id = ? AND status IN (${placeholders})`,
        )
        .run(input.toStatus, input.now.getTime(), input.id, ...input.fromStatuses);
      return Number(result.changes) === 1;
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

  async function listTargets(maintenanceId: string): Promise<string[]> {
    const rows = await db
      .select({ integrationId: targets.integrationId })
      .from(targets)
      .where(eq(targets.maintenanceId, maintenanceId));
    return rows.map((row) => row.integrationId);
  }

  async function listWindowRows(filter?: {
    statuses?: readonly MaintenanceWindowStatus[];
  }): Promise<MaintenanceWindowRecord[]> {
    const rows = filter?.statuses
      ? await db
          .select()
          .from(maintenance)
          .where(inArray(maintenance.status, [...filter.statuses]))
          .orderBy(asc(maintenance.startsAt))
      : await db.select().from(maintenance).orderBy(asc(maintenance.startsAt));
    return rows.map((row) =>
      toMaintenanceWindow({
        ...row,
        description: row.description ?? null,
        createdBy: row.createdBy ?? null,
      }),
    );
  }

  const helpers = createMaintenanceHelpers({ listTargets, listWindows: listWindowRows });

  async function findMaintenanceById(id: string): Promise<MaintenanceWindowSnapshot | null> {
    const [found] = await db.select().from(maintenance).where(eq(maintenance.id, id)).limit(1);
    if (!found?.id) return null;
    return helpers.hydrate(
      toMaintenanceWindow({
        ...found,
        description: found.description ?? null,
        createdBy: found.createdBy ?? null,
      }),
    );
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
    async listActiveMaintenanceIntegrationIds(integrationIds, now) {
      const rows = await db
        .select({ integrationId: targets.integrationId })
        .from(targets)
        .innerJoin(maintenance, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            notInArray(maintenance.status, ["cancelled", "completed"]),
            lte(maintenance.startsAt, now),
            gt(maintenance.endsAt, now),
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
    async listMaintenanceWindows() {
      return helpers.hydrateMany(await listWindowRows());
    },
    findMaintenanceById,
    async listNonTerminalMaintenanceWindows() {
      return helpers.hydrateMany(await listWindowRows({ statuses: ["scheduled", "active"] }));
    },
    async listPublicMaintenancesForIntegrations(integrationIds, now) {
      if (integrationIds.length === 0) return [];
      const rows = await db
        .select({
          id: maintenance.id,
          name: maintenance.name,
          description: maintenance.description,
          startsAt: maintenance.startsAt,
          endsAt: maintenance.endsAt,
          status: maintenance.status,
          createdBy: maintenance.createdBy,
          createdAt: maintenance.createdAt,
          updatedAt: maintenance.updatedAt,
        })
        .from(maintenance)
        .innerJoin(targets, eq(targets.maintenanceId, maintenance.id))
        .where(
          and(
            notInArray(maintenance.status, ["cancelled", "completed"]),
            gt(maintenance.endsAt, now),
            inArray(targets.integrationId, [...integrationIds]),
          ),
        )
        .orderBy(asc(maintenance.startsAt));
      const unique = new Map<string, MaintenanceWindowRecord>();
      for (const row of rows) {
        if (unique.has(row.id)) continue;
        unique.set(
          row.id,
          toMaintenanceWindow({
            ...row,
            description: row.description ?? null,
            createdBy: row.createdBy ?? null,
          }),
        );
      }
      return helpers.hydrateMany([...unique.values()]);
    },
    async listStatusPageIdsForIntegrations(integrationIds) {
      if (integrationIds.length === 0) return [];
      const rows = await db
        .select({ statusPageId: services.statusPageId })
        .from(services)
        .where(inArray(services.sourceIntegrationId, [...integrationIds]));
      return [...new Set(rows.map((row) => row.statusPageId))];
    },
    async findExistingIntegrationIds(ids) {
      const rows = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(inArray(integrations.id, [...ids]));
      return rows.map((row) => row.id);
    },
    async insertMaintenanceWindow(input) {
      await db.transaction(async (tx) => {
        await tx.insert(maintenance).values({
          id: input.id,
          name: input.name,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: input.status,
          createdBy: input.createdBy,
          createdAt: input.now,
          updatedAt: input.now,
        });
        if (input.integrationIds.length > 0) {
          await tx.insert(targets).values(
            input.integrationIds.map((integrationId) => ({
              maintenanceId: input.id,
              integrationId,
            })),
          );
        }
      });
    },
    async updateMaintenanceStatusRow(input) {
      if (input.fromStatuses.length === 0) return false;
      const updated = await db
        .update(maintenance)
        .set({ status: input.toStatus, updatedAt: input.now })
        .where(
          and(eq(maintenance.id, input.id), inArray(maintenance.status, [...input.fromStatuses])),
        )
        .returning({ id: maintenance.id });
      return updated.length === 1;
    },
  });
}
