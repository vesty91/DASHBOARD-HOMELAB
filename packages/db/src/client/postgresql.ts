import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema/postgresql";

export function createPostgresqlClient(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  return {
    dialect: "postgres" as const,
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  };
}
export type PostgresqlClient = ReturnType<typeof createPostgresqlClient>;
