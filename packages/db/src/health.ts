import { sql } from "drizzle-orm";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import { DatabaseError, normalizeDatabaseError } from "./errors";

export async function checkDatabaseConnection(
  client: SqliteClient | PostgresqlClient,
): Promise<void> {
  try {
    if (client.dialect === "sqlite") await client.db.run(sql`select 1`);
    else await client.db.execute(sql`select 1`);
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    throw new DatabaseError("DB_UNAVAILABLE", "The database readiness check failed", {
      cause: normalized,
    });
  }
}
