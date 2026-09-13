import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import { JOB_STATUSES, JOB_TYPES } from "./schema/shared";
import * as sqliteSchema from "./schema/sqlite";

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
  errorCode: string | null;
  errorMessageSafe: string | null;
}

export interface JobRecordInput {
  type: JobType;
  status: JobStatus;
  scheduledAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  attempt?: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
}

export interface JobStore {
  record(input: JobRecordInput): Promise<JobRecord>;
  listRecent(limit: number): Promise<JobRecord[]>;
}

const JOB_LIST_MAX = 50;
const SAFE_MESSAGE_MAX = 200;

function boundedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) return 1;
  return Math.min(JOB_LIST_MAX, limit);
}

function sanitizeMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value
    .replace(/rediss?:\/\/\S+/giu, "redis://redacted")
    .slice(0, SAFE_MESSAGE_MAX);
  if (/password|api[_-]?key|token|secret|AUTH_SECRET/iu.test(trimmed)) return "INTERNAL_ERROR";
  return trimmed;
}

function sanitizeErrorCode(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(value)) return "INTERNAL_ERROR";
  return value;
}

function toRecord(row: {
  id: string;
  type: string;
  status: string;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
  errorCode: string | null;
  errorMessageSafe: string | null;
}): JobRecord {
  return {
    id: row.id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    attempt: row.attempt,
    errorCode: row.errorCode,
    errorMessageSafe: row.errorMessageSafe,
  };
}

export function createSqliteJobStore(client: SqliteClient): JobStore {
  const { db } = client;
  return {
    async record(input) {
      const errorCode = sanitizeErrorCode(input.errorCode);
      const errorMessageSafe = sanitizeMessage(input.errorMessageSafe);
      const row = {
        id: randomUUID(),
        type: input.type,
        status: input.status,
        scheduledAt: input.scheduledAt,
        attempt: input.attempt ?? 1,
        metadataJson: "{}",
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessageSafe ? { errorMessageSafe } : {}),
      };
      await db.insert(sqliteSchema.jobs).values(row).run();
      const found = await db
        .select()
        .from(sqliteSchema.jobs)
        .where(eq(sqliteSchema.jobs.id, row.id))
        .get();
      if (!found) throw new Error("JOB_RECORD_MISSING");
      return toRecord({
        ...found,
        startedAt: found.startedAt ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        errorMessageSafe: found.errorMessageSafe ?? null,
      });
    },
    async listRecent(limit) {
      const rows = await db
        .select()
        .from(sqliteSchema.jobs)
        .orderBy(desc(sqliteSchema.jobs.scheduledAt))
        .limit(boundedLimit(limit))
        .all();
      return rows.map((found) =>
        toRecord({
          ...found,
          startedAt: found.startedAt ?? null,
          finishedAt: found.finishedAt ?? null,
          errorCode: found.errorCode ?? null,
          errorMessageSafe: found.errorMessageSafe ?? null,
        }),
      );
    },
  };
}

export function createPostgresqlJobStore(client: PostgresqlClient): JobStore {
  const { db } = client;
  return {
    async record(input) {
      const rows = await db
        .insert(postgresqlSchema.jobs)
        .values({
          id: randomUUID(),
          type: input.type,
          status: input.status,
          scheduledAt: input.scheduledAt,
          startedAt: input.startedAt ?? null,
          finishedAt: input.finishedAt ?? null,
          attempt: input.attempt ?? 1,
          errorCode: sanitizeErrorCode(input.errorCode),
          errorMessageSafe: sanitizeMessage(input.errorMessageSafe),
          metadataJson: {},
        })
        .returning();
      const found = rows[0];
      if (!found) throw new Error("JOB_RECORD_MISSING");
      return toRecord({
        ...found,
        startedAt: found.startedAt ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        errorMessageSafe: found.errorMessageSafe ?? null,
      });
    },
    async listRecent(limit) {
      const rows = await db
        .select()
        .from(postgresqlSchema.jobs)
        .orderBy(desc(postgresqlSchema.jobs.scheduledAt))
        .limit(boundedLimit(limit));
      return rows.map((found) =>
        toRecord({
          ...found,
          startedAt: found.startedAt ?? null,
          finishedAt: found.finishedAt ?? null,
          errorCode: found.errorCode ?? null,
          errorMessageSafe: found.errorMessageSafe ?? null,
        }),
      );
    },
  };
}
