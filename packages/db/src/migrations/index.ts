import { readdir, readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";

async function readMigrations(directory: URL): Promise<string[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  return Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")));
}
export async function migrateSqlite(
  database: DatabaseSync,
  directory = new URL("../../drizzle/sqlite/", import.meta.url),
) {
  for (const migration of await readMigrations(directory))
    executeSqliteMigration(database, migration);
}
export function executeSqliteMigration(database: DatabaseSync, migration: string) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(migration);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
export async function migratePostgresql(
  pool: Pool,
  directory = new URL("../../drizzle/postgresql/", import.meta.url),
) {
  for (const migration of await readMigrations(directory))
    await executePostgresqlMigration(pool, migration);
}
export async function executePostgresqlMigration(pool: Pool, migration: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
