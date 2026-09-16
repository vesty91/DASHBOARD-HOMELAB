import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { parseDatabaseConfig } from "./config";
import { createPostgresqlClient } from "./client/postgresql";

const defaultFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/postgresql");

export async function migrateProductionPostgresql(input: {
  databaseUrl: string;
  migrationsFolder?: string;
}): Promise<void> {
  const client = createPostgresqlClient(input.databaseUrl);
  try {
    await migrate(client.db, {
      migrationsFolder: input.migrationsFolder ?? defaultFolder,
    });
  } finally {
    await client.close();
  }
}

export async function runProductionMigrateCli(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const config = parseDatabaseConfig({
    DB_DRIVER: env.DB_DRIVER ?? "postgres",
    DATABASE_URL: env.DATABASE_URL,
  });
  if (config.DB_DRIVER !== "postgres") {
    throw new Error("MIGRATE_REQUIRES_POSTGRES");
  }
  const version = env.APP_VERSION?.trim() || "1.4.0";
  console.log(JSON.stringify({ msg: "startup", service: "migrate", version }));
  await migrateProductionPostgresql({
    databaseUrl: config.DATABASE_URL,
    ...(env.MIGRATIONS_DIR ? { migrationsFolder: env.MIGRATIONS_DIR } : {}),
  });
  console.log(JSON.stringify({ msg: "migrate_complete", service: "migrate", version }));
}
