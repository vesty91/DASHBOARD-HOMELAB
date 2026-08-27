import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";

type HealthErrorCode =
  "HTTP_STATUS" | "TIMEOUT" | "DNS_ERROR" | "TLS_ERROR" | "CONNECTION_ERROR" | "TARGET_BLOCKED";
type HealthStatus = "up" | "down" | "timeout" | "error";
interface HealthConfig {
  path: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusMin: number;
  expectedStatusMax: number;
}
interface AppDto {
  id: string;
  name: string;
  description: string | null;
  url: string;
  iconRef: string | null;
  color: string | null;
  target: "same-tab" | "new-tab";
  tags: string[];
  healthcheckEnabled: boolean;
  healthcheckConfig: HealthConfig;
  healthStatus: "unknown" | HealthStatus;
  lastCheckedAt: Date | null;
  lastLatencyMs: number | null;
  lastHttpStatus: number | null;
  lastHealthErrorCode: HealthErrorCode | null;
  healthConfigRevision: number;
  integrationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface AppCreateInput {
  name: string;
  description: string | null;
  url: string;
  iconRef: string | null;
  color: string | null;
  target: "same-tab" | "new-tab";
  tags: string[];
  healthcheckEnabled: boolean;
  healthcheckConfig: HealthConfig;
}
type AppUpdateInput = { id: string } & Partial<AppCreateInput>;
interface AppStore {
  list(limit: number, cursor?: string): Promise<AppDto[]>;
  findById(id: string): Promise<AppDto | undefined>;
  create(input: AppCreateInput): Promise<AppDto>;
  update(input: AppUpdateInput): Promise<AppDto | undefined>;
  delete(id: string): Promise<boolean>;
  persistHealthResult(
    id: string,
    revision: number,
    result: {
      status: HealthStatus;
      latencyMs: number;
      httpStatus: number | null;
      errorCode: HealthErrorCode | null;
    },
  ): Promise<boolean>;
}

type Row = Record<string, unknown>;
const config = (value: unknown): HealthConfig => {
  const parsed =
    typeof value === "string"
      ? (JSON.parse(value) as Partial<HealthConfig>)
      : ((value ?? {}) as Partial<HealthConfig>);
  return {
    path: parsed.path ?? "/",
    method: parsed.method ?? "GET",
    timeoutMs: parsed.timeoutMs ?? 5000,
    expectedStatusMin: parsed.expectedStatusMin ?? 200,
    expectedStatusMax: parsed.expectedStatusMax ?? 399,
  };
};
const dto = (row: Row, tags: string[]): AppDto => ({
  id: String(row.id),
  name: String(row.name),
  description: row.description == null ? null : String(row.description),
  url: String(row.url),
  iconRef: row.icon_ref == null ? null : String(row.icon_ref),
  color: row.color == null ? null : String(row.color),
  target: row.target as AppDto["target"],
  tags,
  healthcheckEnabled: Boolean(row.healthcheck_enabled),
  healthcheckConfig: config(row.healthcheck_config_json),
  healthStatus: row.health_status as AppDto["healthStatus"],
  lastCheckedAt:
    row.last_checked_at == null
      ? null
      : new Date(
          row.last_checked_at instanceof Date ? row.last_checked_at : Number(row.last_checked_at),
        ),
  lastLatencyMs: row.last_latency_ms == null ? null : Number(row.last_latency_ms),
  lastHttpStatus: row.last_http_status == null ? null : Number(row.last_http_status),
  lastHealthErrorCode:
    row.last_health_error_code == null ? null : (row.last_health_error_code as HealthErrorCode),
  healthConfigRevision: Number(row.health_config_revision),
  integrationId: row.integration_id == null ? null : String(row.integration_id),
  createdAt: new Date(row.created_at instanceof Date ? row.created_at : Number(row.created_at)),
  updatedAt: new Date(row.updated_at instanceof Date ? row.updated_at : Number(row.updated_at)),
});
const canonical = (value: string) => value.normalize("NFKC").toLocaleLowerCase("und");
const healthChanged = (current: AppDto, input: AppUpdateInput) =>
  (input.url !== undefined && input.url !== current.url) ||
  (input.healthcheckEnabled !== undefined &&
    input.healthcheckEnabled !== current.healthcheckEnabled) ||
  (input.healthcheckConfig !== undefined &&
    JSON.stringify(input.healthcheckConfig) !== JSON.stringify(current.healthcheckConfig));

export function createSqliteAppStore(db: DatabaseSync): AppStore {
  const find = (id: string) => {
    const row = db.prepare("SELECT * FROM apps WHERE id=?").get(id);
    return row
      ? dto(
          row,
          db
            .prepare("SELECT value FROM app_tags WHERE app_id=? ORDER BY canonical_value")
            .all(id)
            .map((tag) => String(tag.value)),
        )
      : undefined;
  };
  return {
    async list(limit, cursor) {
      return (
        cursor
          ? db.prepare("SELECT * FROM apps WHERE id>? ORDER BY id LIMIT ?").all(cursor, limit)
          : db.prepare("SELECT * FROM apps ORDER BY id LIMIT ?").all(limit)
      ).map((row) =>
        dto(
          row,
          db
            .prepare("SELECT value FROM app_tags WHERE app_id=? ORDER BY canonical_value")
            .all(String(row.id))
            .map((tag) => String(tag.value)),
        ),
      );
    },
    async findById(id) {
      return find(id);
    },
    async create(input) {
      const id = randomUUID(),
        now = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO apps(id,name,description,url,icon_ref,color,target,healthcheck_enabled,healthcheck_config_json,health_status,health_config_revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'unknown',1,?,?)",
        ).run(
          id,
          input.name,
          input.description,
          input.url,
          input.iconRef,
          input.color,
          input.target,
          input.healthcheckEnabled ? 1 : 0,
          JSON.stringify(input.healthcheckConfig),
          now,
          now,
        );
        const add = db.prepare("INSERT INTO app_tags(app_id,value,canonical_value) VALUES(?,?,?)");
        for (const tag of input.tags) add.run(id, tag, canonical(tag));
        db.exec("COMMIT");
        return find(id)!;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async update(input) {
      const current = find(input.id);
      if (!current) return undefined;
      const reset = healthChanged(current, input);
      const next = { ...current, ...input };
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `UPDATE apps SET name=?,description=?,url=?,icon_ref=?,color=?,target=?,healthcheck_enabled=?,healthcheck_config_json=?,health_status=?,last_checked_at=?,last_latency_ms=?,last_http_status=?,last_health_error_code=?,health_config_revision=health_config_revision+?,updated_at=? WHERE id=?`,
        ).run(
          next.name,
          next.description,
          next.url,
          next.iconRef,
          next.color,
          next.target,
          next.healthcheckEnabled ? 1 : 0,
          JSON.stringify(next.healthcheckConfig),
          reset ? "unknown" : current.healthStatus,
          reset ? null : (current.lastCheckedAt?.getTime() ?? null),
          reset ? null : current.lastLatencyMs,
          reset ? null : current.lastHttpStatus,
          reset ? null : current.lastHealthErrorCode,
          reset ? 1 : 0,
          Date.now(),
          input.id,
        );
        if (input.tags !== undefined) {
          db.prepare("DELETE FROM app_tags WHERE app_id=?").run(input.id);
          const add = db.prepare(
            "INSERT INTO app_tags(app_id,value,canonical_value) VALUES(?,?,?)",
          );
          for (const tag of input.tags) add.run(input.id, tag, canonical(tag));
        }
        db.exec("COMMIT");
        return find(input.id)!;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async delete(id) {
      return db.prepare("DELETE FROM apps WHERE id=?").run(id).changes === 1;
    },
    async persistHealthResult(id, revision, result) {
      return (
        db
          .prepare(
            "UPDATE apps SET health_status=?,last_checked_at=?,last_latency_ms=?,last_http_status=?,last_health_error_code=?,updated_at=? WHERE id=? AND health_config_revision=?",
          )
          .run(
            result.status,
            Date.now(),
            result.latencyMs,
            result.httpStatus,
            result.errorCode,
            Date.now(),
            id,
            revision,
          ).changes === 1
      );
    },
  };
}

export function createPostgresqlAppStore(pool: Pool): AppStore {
  const find = async (q: Pool | PoolClient, id: string) => {
    const result = await q.query("SELECT * FROM apps WHERE id=$1", [id]);
    if (!result.rows[0]) return undefined;
    const tags = await q.query(
      "SELECT value FROM app_tags WHERE app_id=$1 ORDER BY canonical_value",
      [id],
    );
    return dto(
      result.rows[0],
      tags.rows.map((tag) => String(tag.value)),
    );
  };
  return {
    async list(limit, cursor) {
      const rows = cursor
        ? await pool.query("SELECT * FROM apps WHERE id>$1 ORDER BY id LIMIT $2", [cursor, limit])
        : await pool.query("SELECT * FROM apps ORDER BY id LIMIT $1", [limit]);
      return Promise.all(
        rows.rows.map(async (row) =>
          dto(
            row,
            (
              await pool.query(
                "SELECT value FROM app_tags WHERE app_id=$1 ORDER BY canonical_value",
                [row.id],
              )
            ).rows.map((tag) => String(tag.value)),
          ),
        ),
      );
    },
    async findById(id) {
      return find(pool, id);
    },
    async create(input) {
      const client = await pool.connect(),
        id = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO apps(id,name,description,url,icon_ref,color,target,healthcheck_enabled,healthcheck_config_json,health_status,health_config_revision,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'unknown',1,now(),now())",
          [
            id,
            input.name,
            input.description,
            input.url,
            input.iconRef,
            input.color,
            input.target,
            input.healthcheckEnabled,
            input.healthcheckConfig,
          ],
        );
        for (const tag of input.tags)
          await client.query(
            "INSERT INTO app_tags(app_id,value,canonical_value) VALUES($1,$2,$3)",
            [id, tag, canonical(tag)],
          );
        await client.query("COMMIT");
        return (await find(pool, id))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async update(input) {
      const current = await find(pool, input.id);
      if (!current) return undefined;
      const reset = healthChanged(current, input),
        next = { ...current, ...input };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE apps SET name=$1,description=$2,url=$3,icon_ref=$4,color=$5,target=$6,healthcheck_enabled=$7,healthcheck_config_json=$8,health_status=$9,last_checked_at=$10,last_latency_ms=$11,last_http_status=$12,last_health_error_code=$13,health_config_revision=health_config_revision+CASE WHEN $14::boolean THEN 1 ELSE 0 END,updated_at=now() WHERE id=$15",
          [
            next.name,
            next.description,
            next.url,
            next.iconRef,
            next.color,
            next.target,
            next.healthcheckEnabled,
            next.healthcheckConfig,
            reset ? "unknown" : current.healthStatus,
            reset ? null : current.lastCheckedAt,
            reset ? null : current.lastLatencyMs,
            reset ? null : current.lastHttpStatus,
            reset ? null : current.lastHealthErrorCode,
            reset,
            input.id,
          ],
        );
        if (input.tags !== undefined) {
          await client.query("DELETE FROM app_tags WHERE app_id=$1", [input.id]);
          for (const tag of input.tags)
            await client.query(
              "INSERT INTO app_tags(app_id,value,canonical_value) VALUES($1,$2,$3)",
              [input.id, tag, canonical(tag)],
            );
        }
        await client.query("COMMIT");
        return (await find(pool, input.id))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async delete(id) {
      return (await pool.query("DELETE FROM apps WHERE id=$1", [id])).rowCount === 1;
    },
    async persistHealthResult(
      id: string,
      revision: number,
      result: {
        status: HealthStatus;
        latencyMs: number;
        httpStatus: number | null;
        errorCode: HealthErrorCode | null;
      },
    ) {
      return (
        (
          await pool.query(
            "UPDATE apps SET health_status=$1,last_checked_at=now(),last_latency_ms=$2,last_http_status=$3,last_health_error_code=$4,updated_at=now() WHERE id=$5 AND health_config_revision=$6",
            [result.status, result.latencyMs, result.httpStatus, result.errorCode, id, revision],
          )
        ).rowCount === 1
      );
    },
  };
}
