import type { InferInsertModel } from "drizzle-orm";
import {
  BACKUP_COLUMNS,
  BACKUP_TABLE_NAMES,
  TABLE_DELETE_ORDER,
  TABLE_INSERT_ORDER,
  deserializeBackupRow,
  emptyBackupTables,
  serializeBackupRow,
  type BackupTableName,
  type BackupTables,
} from "@dashboard/backup";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

const sqliteTables = {
  users: sqliteSchema.users,
  groups: sqliteSchema.groups,
  group_members: sqliteSchema.groupMembers,
  boards: sqliteSchema.boards,
  layouts: sqliteSchema.layouts,
  items: sqliteSchema.items,
  item_layouts: sqliteSchema.itemLayouts,
  apps: sqliteSchema.apps,
  app_tags: sqliteSchema.appTags,
  integrations: sqliteSchema.integrations,
  integration_secrets: sqliteSchema.integrationSecrets,
  server_settings: sqliteSchema.serverSettings,
  user_credentials: sqliteSchema.userCredentials,
  roles: sqliteSchema.roles,
  role_permissions: sqliteSchema.rolePermissions,
  user_roles: sqliteSchema.userRoles,
  group_roles: sqliteSchema.groupRoles,
  board_user_permissions: sqliteSchema.boardUserPermissions,
  board_group_permissions: sqliteSchema.boardGroupPermissions,
  jobs: sqliteSchema.jobs,
} as const;

const postgresqlTables = {
  users: postgresqlSchema.users,
  groups: postgresqlSchema.groups,
  group_members: postgresqlSchema.groupMembers,
  boards: postgresqlSchema.boards,
  layouts: postgresqlSchema.layouts,
  items: postgresqlSchema.items,
  item_layouts: postgresqlSchema.itemLayouts,
  apps: postgresqlSchema.apps,
  app_tags: postgresqlSchema.appTags,
  integrations: postgresqlSchema.integrations,
  integration_secrets: postgresqlSchema.integrationSecrets,
  server_settings: postgresqlSchema.serverSettings,
  user_credentials: postgresqlSchema.userCredentials,
  roles: postgresqlSchema.roles,
  role_permissions: postgresqlSchema.rolePermissions,
  user_roles: postgresqlSchema.userRoles,
  group_roles: postgresqlSchema.groupRoles,
  board_user_permissions: postgresqlSchema.boardUserPermissions,
  board_group_permissions: postgresqlSchema.boardGroupPermissions,
  jobs: postgresqlSchema.jobs,
} as const;

function toSnakeCase(column: string): string {
  return column.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

function sqliteBindValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  throw new TypeError("Unsupported SQLite backup parameter type");
}

async function exportSqliteTables(client: SqliteClient): Promise<BackupTables> {
  const tables = emptyBackupTables();
  for (const name of BACKUP_TABLE_NAMES) {
    const rows = await client.db.select().from(sqliteTables[name]).all();
    assignTable(
      tables,
      name,
      rows.map((row) => serializeBackupRow(name, row)),
    );
  }
  return tables;
}

async function exportPostgresqlTables(client: PostgresqlClient): Promise<BackupTables> {
  const tables = emptyBackupTables();
  for (const name of BACKUP_TABLE_NAMES) {
    const rows = await client.db.select().from(postgresqlTables[name]);
    assignTable(
      tables,
      name,
      rows.map((row) => serializeBackupRow(name, row)),
    );
  }
  return tables;
}

function assignTable(
  tables: BackupTables,
  name: BackupTableName,
  rows: Record<string, unknown>[],
): void {
  (tables as unknown as Record<BackupTableName, Record<string, unknown>[]>)[name] = rows;
}

async function replaceSqliteTables(client: SqliteClient, tables: BackupTables): Promise<void> {
  client.sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const table of TABLE_DELETE_ORDER) client.sqlite.exec(`DELETE FROM "${table}"`);
    for (const table of TABLE_INSERT_ORDER) {
      const rows = tables[table];
      if (rows.length === 0) continue;
      const columns = BACKUP_COLUMNS[table];
      const statement = client.sqlite.prepare(
        `INSERT INTO "${table}" (${columns.map((column) => `"${toSnakeCase(column)}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      );
      for (const row of rows) {
        const mapped = deserializeBackupRow(table, row, "sqlite");
        statement.run(...columns.map((column) => sqliteBindValue(mapped[column])));
      }
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
}

async function replacePostgresqlTables(
  client: PostgresqlClient,
  tables: BackupTables,
): Promise<void> {
  await client.db.transaction(async (tx) => {
    for (const table of TABLE_DELETE_ORDER) await tx.delete(postgresqlTables[table]);
    for (const table of TABLE_INSERT_ORDER) {
      const rows = tables[table];
      if (rows.length === 0) continue;
      const mapped = rows.map((row) => deserializeBackupRow(table, row, "postgres"));
      await tx
        .insert(postgresqlTables[table])
        .values(mapped as InferInsertModel<(typeof postgresqlTables)[BackupTableName]>[]);
    }
  });
}

export function createSqliteBackupStore(client: SqliteClient) {
  return {
    exportSnapshot: () => exportSqliteTables(client),
    replaceSnapshot: (tables: BackupTables) => replaceSqliteTables(client, tables),
  };
}

export function createPostgresqlBackupStore(client: PostgresqlClient) {
  return {
    exportSnapshot: () => exportPostgresqlTables(client),
    replaceSnapshot: (tables: BackupTables) => replacePostgresqlTables(client, tables),
  };
}

export type BackupStore = ReturnType<typeof createSqliteBackupStore>;
