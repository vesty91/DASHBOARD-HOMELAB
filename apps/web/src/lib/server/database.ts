import "server-only";
import {
  createPostgresqlAuthStore,
  createPostgresqlClient,
  createSqliteAuthStore,
  createSqliteClient,
} from "@dashboard/db/auth-runtime";
import { createPostgresqlBoardStore, createSqliteBoardStore } from "@dashboard/db/board-runtime";

const globalDatabase = globalThis as typeof globalThis & {
  dashboardDatabase?: ReturnType<typeof createDatabase>;
};
async function createDatabase() {
  if (process.env.DB_DRIVER === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL");
    const client = createPostgresqlClient(process.env.DATABASE_URL);
    return {
      dialect: "postgres" as const,
      client,
      authStore: createPostgresqlAuthStore(client.pool),
      boardStore: createPostgresqlBoardStore(client.pool),
    };
  }
  const client = createSqliteClient(process.env.DATABASE_URL ?? "./appdata/dashboard.sqlite");
  return {
    dialect: "sqlite" as const,
    client,
    authStore: createSqliteAuthStore(client.sqlite),
    boardStore: createSqliteBoardStore(client.sqlite),
  };
}
export function getDatabase() {
  return (globalDatabase.dashboardDatabase ??= createDatabase());
}
