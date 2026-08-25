import type { PostgresqlClient } from "../client/postgresql";
import type { SqliteClient } from "../client/sqlite";

type SqliteTransaction = Parameters<Parameters<SqliteClient["db"]["transaction"]>[0]>[0];
type PostgresqlTransaction = Parameters<Parameters<PostgresqlClient["db"]["transaction"]>[0]>[0];

export function runSqliteTransaction<T>(
  client: SqliteClient,
  operation: (transaction: SqliteTransaction) => Promise<T>,
): Promise<T> {
  return client.db.transaction(operation);
}
export function runPostgresqlTransaction<T>(
  client: PostgresqlClient,
  operation: (transaction: PostgresqlTransaction) => Promise<T>,
): Promise<T> {
  return client.db.transaction(operation);
}
