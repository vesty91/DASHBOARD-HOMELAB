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
  for (const migration of await readMigrations(directory)) database.exec(migration);
}
export async function migratePostgresql(
  pool: Pool,
  directory = new URL("../../drizzle/postgresql/", import.meta.url),
) {
  for (const migration of await readMigrations(directory)) await pool.query(migration);
}
