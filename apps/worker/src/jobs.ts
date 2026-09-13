import {
  createPostgresqlClient,
  createPostgresqlJobStore,
  createSqliteClient,
  createSqliteJobStore,
  parseDatabaseConfig,
  type JobStore,
} from "@dashboard/db";
import type { JobRecorder } from "./server";

export function createJobRecorder(store: JobStore): JobRecorder {
  return {
    async recordHeartbeat(input) {
      await store.record({
        type: "heartbeat",
        status: input.status,
        scheduledAt: input.occurredAt,
        startedAt: input.occurredAt,
        finishedAt: input.occurredAt,
        attempt: 1,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      });
    },
  };
}

export function createJobRecorderFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): JobRecorder | undefined {
  if (!env.DATABASE_URL?.trim()) return undefined;
  const config = parseDatabaseConfig({
    DB_DRIVER: env.DB_DRIVER ?? "sqlite",
    DATABASE_URL: env.DATABASE_URL,
  });
  if (config.DB_DRIVER === "postgres") {
    return createJobRecorder(createPostgresqlJobStore(createPostgresqlClient(config.DATABASE_URL)));
  }
  return createJobRecorder(createSqliteJobStore(createSqliteClient(config.DATABASE_URL)));
}
